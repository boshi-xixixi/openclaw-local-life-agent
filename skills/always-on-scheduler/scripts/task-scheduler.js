#!/usr/bin/env node
/**
 * task-scheduler.js — 后台任务调度模拟器
 * 
 * 用法：
 *   node task-scheduler.js status                    # 查看所有任务状态
 *   node task-scheduler.js create <type> [config]    # 创建新的后台任务
 *   node task-scheduler.js watch <task_id>           # 执行一次监控检查
 *   node task-scheduler.js simulate <task_id>        # 模拟完整的监控→触发→执行流程
 *   node task-scheduler.js cron <job_id>             # 手动触发一个定时任务
 * 
 * 示例：
 *   node task-scheduler.js create queue_monitor '{"restaurant_id":"R13","threshold":5}'
 *   node task-scheduler.js simulate queue_watch_001
 *   node task-scheduler.js cron morning_briefing
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

// 配置
const SANDBOX_API = process.env.SANDBOX_API || 'http://localhost:8900';
const TASKS_FILE = path.join(__dirname, '..', 'references', 'scheduled-tasks.json');
const STATE_FILE = path.join(__dirname, '..', 'references', 'task-state.json');
const CITY_MAP = path.join(__dirname, '..', '..', 'shared', 'city-map.json');

// ====== 工具函数 ======

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = http.request(options, (res) => {
      let result = '';
      res.on('data', chunk => result += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(result)); }
        catch (e) { resolve(result); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function generateTaskId(type) {
  const timestamp = Date.now().toString(36);
  return `${type}_${timestamp}`;
}

function nowStr() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

// ====== 核心功能 ======

// 查看所有任务状态
async function showStatus() {
  const config = loadJson(TASKS_FILE);
  const state = loadJson(STATE_FILE) || { active_tasks: [], completed_tasks: [] };
  
  console.log('=== Always-on 调度器状态 ===\n');
  
  console.log('【定时任务 Cron Jobs】');
  config.cron_jobs.forEach(job => {
    const status = job.enabled ? '✅ 启用' : '❌ 禁用';
    console.log(`  ${status} ${job.id}: ${job.name} (${job.schedule})`);
    console.log(`         ${job.description}`);
  });
  
  console.log('\n【事件监控器 Watchers】');
  config.watchers.forEach(w => {
    console.log(`  🔍 ${w.id}: ${w.name}`);
    console.log(`     ${w.description}`);
    console.log(`     检查间隔: ${w.config_template.check_interval_sec || 'N/A'}秒`);
  });
  
  console.log('\n【活跃任务】');
  if (state.active_tasks.length === 0) {
    console.log('  (无活跃任务)');
  } else {
    state.active_tasks.forEach(t => {
      console.log(`  📋 ${t.task_id} [${t.status}]`);
      console.log(`     类型: ${t.type} | 创建: ${t.created_at}`);
      if (t.config) console.log(`     配置: ${JSON.stringify(t.config)}`);
      if (t.history && t.history.length > 0) {
        console.log(`     历史: ${t.history.length}条记录`);
        t.history.slice(-3).forEach(h => {
          console.log(`       ${h.time}: ${JSON.stringify(h)}`);
        });
      }
    });
  }
  
  console.log('\n【已完成任务】');
  if (state.completed_tasks.length === 0) {
    console.log('  (无已完成任务)');
  } else {
    state.completed_tasks.slice(-5).forEach(t => {
      console.log(`  ✅ ${t.task_id} [${t.status}] 完成于 ${t.completed_at}`);
    });
  }
}

// 创建新的后台任务
async function createTask(type, configStr) {
  const config = configStr ? JSON.parse(configStr) : {};
  const taskConfig = loadJson(TASKS_FILE);
  const state = loadJson(STATE_FILE) || { active_tasks: [], completed_tasks: [] };
  
  // 查找 watcher 配置模板
  const watcher = taskConfig.watchers.find(w => w.id === type);
  if (!watcher) {
    console.error(`错误: 未知的任务类型 "${type}"`);
    console.error(`可用类型: ${taskConfig.watchers.map(w => w.id).join(', ')}`);
    process.exit(1);
  }
  
  const taskId = generateTaskId(type);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (watcher.config_template.max_watch_hours || 3) * 3600000);
  
  const task = {
    task_id: taskId,
    type: type,
    name: watcher.name,
    status: 'WATCHING',
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    config: { ...watcher.config_template, ...config },
    history: [
      { time: nowStr(), action: 'CREATED', detail: `监控任务已创建: ${watcher.name}` }
    ]
  };
  
  state.active_tasks.push(task);
  saveJson(STATE_FILE, state);
  
  console.log(`✅ 后台任务已创建`);
  console.log(`   任务ID: ${taskId}`);
  console.log(`   类型: ${watcher.name}`);
  console.log(`   状态: WATCHING`);
  console.log(`   配置: ${JSON.stringify(task.config)}`);
  console.log(`   过期时间: ${expiresAt.toISOString()}`);
  
  return taskId;
}

// 执行一次监控检查
async function watchOnce(taskId) {
  const state = loadJson(STATE_FILE) || { active_tasks: [], completed_tasks: [] };
  const task = state.active_tasks.find(t => t.task_id === taskId);
  
  if (!task) {
    console.error(`错误: 找不到任务 "${taskId}"`);
    process.exit(1);
  }
  
  if (task.status !== 'WATCHING') {
    console.log(`任务 "${taskId}" 当前状态: ${task.status}，无法执行监控`);
    return;
  }
  
  console.log(`🔍 执行监控检查: ${task.name} (${taskId})`);
  
  if (task.type === 'queue_monitor') {
    try {
      const endpoint = task.config.api_endpoint.replace('{restaurant_id}', task.config.restaurant_id);
      const result = await httpGet(`${SANDBOX_API}${endpoint}`);
      const queueCount = result.queue_count;
      
      task.history.push({
        time: nowStr(),
        action: 'CHECK',
        queue_count: queueCount,
        detail: `排队 ${queueCount} 桌`
      });
      
      console.log(`   排队桌数: ${queueCount}`);
      console.log(`   触发阈值: ≤ ${task.config.threshold_tables} 桌`);
      
      if (queueCount <= (task.config.threshold_tables || 5)) {
        task.status = 'TRIGGERED';
        task.history.push({
          time: nowStr(),
          action: 'TRIGGERED',
          queue_count: queueCount,
          detail: `排队仅剩 ${queueCount} 桌，已触发提醒！`
        });
        console.log(`   ⚡ 条件满足！任务已触发`);
      } else {
        console.log(`   ⏳ 继续监控...`);
      }
    } catch (e) {
      console.log(`   ⚠️ 沙盒API不可用: ${e.message}`);
      console.log(`   使用模拟数据: 排队12桌`);
      task.history.push({
        time: nowStr(),
        action: 'CHECK',
        queue_count: 12,
        detail: `API不可用，使用模拟数据: 排队12桌`
      });
    }
  }
  
  saveJson(STATE_FILE, state);
}

// 模拟完整的监控→触发→执行流程（用于演示）
async function simulateFull(taskId) {
  const state = loadJson(STATE_FILE) || { active_tasks: [], completed_tasks: [] };
  let task = state.active_tasks.find(t => t.task_id === taskId);
  
  // 如果没有活跃任务，创建一个模拟任务
  if (!task) {
    console.log('⚠️ 未找到活跃任务，创建模拟任务...\n');
    taskId = await createTask('queue_monitor', '{"restaurant_id":"R13","restaurant_name":"海底捞","threshold_tables":5}');
    task = (loadJson(STATE_FILE) || { active_tasks: [] }).active_tasks.find(t => t.task_id === taskId);
  }
  
  console.log('\n🎬 === 模拟完整监控流程 ===\n');
  
  // 模拟排队递减
  const queueSequence = [15, 12, 10, 8, 6, 4];
  const timeSlots = ['19:05', '19:15', '19:25', '19:35', '19:42', '19:48'];
  
  for (let i = 0; i < queueSequence.length; i++) {
    const queueCount = queueSequence[i];
    const time = timeSlots[i];
    const triggered = queueCount <= (task.config.threshold_tables || 5);
    
    console.log(`[${time}] 排队 ${queueCount} 桌`);
    
    task.history.push({
      time: time,
      action: triggered ? 'TRIGGERED' : 'CHECK',
      queue_count: queueCount
    });
    
    if (triggered) {
      task.status = 'TRIGGERED';
      console.log(`\n⚡ 触发！排队仅剩 ${queueCount} 桌（阈值: ${task.config.threshold_tables || 5}）`);
      
      // 模拟通知用户
      console.log(`\n📱 推送消息给用户:`);
      console.log(`   "${task.config.restaurant_name || '餐厅'}排队还剩${queueCount}桌了！`);
      console.log(`    现在出发刚好，要帮你叫车吗？"`);
      
      // 模拟计算路线
      console.log(`\n🚗 计算出行路线:`);
      const cityMap = loadJson(CITY_MAP);
      if (cityMap) {
        const restaurant = cityMap.restaurants.find(r => r.id === task.config.restaurant_id);
        if (restaurant) {
          console.log(`   目的地: ${restaurant.name} (${restaurant.address})`);
          console.log(`   从望京出发: 打车约20min ¥35 | 地铁约35min ¥6`);
        }
      }
      
      // 模拟叫车
      task.status = 'EXECUTING';
      console.log(`\n🚕 自动叫车服务:`);
      console.log(`   车辆: 京B·12345 (白色丰田卡罗拉)`);
      console.log(`   预计到达: 8分钟`);
      console.log(`   预估费用: ¥35`);
      
      // 模拟取号
      console.log(`\n📋 远程取号:`);
      console.log(`   取号成功！排号: A${Math.floor(Math.random() * 50) + 10}`);
      console.log(`   前面还有 ${queueCount - 1} 桌等候`);
      
      task.status = 'COMPLETED';
      task.completed_at = nowStr();
      task.history.push({
        time: time,
        action: 'COMPLETED',
        detail: '用户已确认，车辆已叫，取号已完成'
      });
      
      console.log(`\n✅ 任务完成！`);
      
      // 移到已完成列表
      state.active_tasks = state.active_tasks.filter(t => t.task_id !== taskId);
      state.completed_tasks = state.completed_tasks || [];
      state.completed_tasks.push(task);
      break;
    } else {
      console.log(`   ⏳ 继续监控...`);
    }
  }
  
  saveJson(STATE_FILE, state);
  
  console.log('\n=== 完整执行历史 ===');
  task.history.forEach(h => {
    console.log(`  [${h.time}] ${h.action}: ${h.detail || JSON.stringify(h.queue_count)}`);
  });
}

// 手动触发定时任务
async function triggerCron(jobId) {
  const config = loadJson(TASKS_FILE);
  const job = config.cron_jobs.find(j => j.id === jobId);
  
  if (!job) {
    console.error(`错误: 未知的定时任务 "${jobId}"`);
    console.error(`可用任务: ${config.cron_jobs.map(j => j.id).join(', ')}`);
    process.exit(1);
  }
  
  console.log(`⏰ 手动触发定时任务: ${job.name}\n`);
  console.log(`执行步骤:`);
  
  for (const action of job.actions) {
    console.log(`  Step ${action.step}: [${action.skill}] ${action.action}`);
    
    if (action.skill === 'weather-awareness' && action.action === 'get_today_weather') {
      const weatherData = loadJson(path.join(__dirname, '..', '..', 'weather-awareness', 'references', 'weather-simulation.json'));
      if (weatherData) {
        const today = weatherData.forecast[0];
        console.log(`    → 天气: ${today.weather}, ${today.temp_low}-${today.temp_high}°C, ${today.wind}`);
        console.log(`    → 建议: ${today.description}`);
      }
    }
    
    if (action.skill === 'always-on-scheduler' && action.action === 'check_special_dates') {
      console.log(`    → 检查用户偏好中的特殊日期...`);
      console.log(`    → (暂无近期特殊日期)`);
    }
    
    if (action.skill === 'always-on-scheduler' && action.action === 'compose_morning_message') {
      console.log(`    → 组装早安消息...`);
      console.log(`    → 输出: "早！今天天气不错，适合出门~"`);
    }
  }
  
  console.log(`\n✅ 定时任务执行完成`);
}

// ====== 主入口 ======

const [,, command, ...args] = process.argv;

(async () => {
  switch (command) {
    case 'status':
      await showStatus();
      break;
    case 'create':
      await createTask(args[0], args[1]);
      break;
    case 'watch':
      await watchOnce(args[0]);
      break;
    case 'simulate':
      await simulateFull(args[0]);
      break;
    case 'cron':
      await triggerCron(args[0]);
      break;
    default:
      console.log('用法: node task-scheduler.js <command> [args]');
      console.log('');
      console.log('命令:');
      console.log('  status                    查看所有任务状态');
      console.log('  create <type> [config]    创建新的后台任务');
      console.log('  watch <task_id>           执行一次监控检查');
      console.log('  simulate [task_id]        模拟完整的监控→触发→执行流程');
      console.log('  cron <job_id>             手动触发一个定时任务');
      console.log('');
      console.log('示例:');
      console.log('  node task-scheduler.js status');
      console.log('  node task-scheduler.js create queue_monitor \'{"restaurant_id":"R13","threshold_tables":5}\'');
      console.log('  node task-scheduler.js simulate');
      console.log('  node task-scheduler.js cron morning_briefing');
  }
})();
