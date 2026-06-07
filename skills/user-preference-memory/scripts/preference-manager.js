#!/usr/bin/env node
/**
 * preference-manager.js — 用户偏好记忆管理器
 * 
 * 用法：
 *   node preference-manager.js show                              # 查看当前偏好
 *   node preference-manager.js update <category> <json>          # 更新偏好
 *   node preference-manager.js add-date <key> <value>            # 添加特殊日期
 *   node preference-manager.js reset                             # 重置偏好
 *   node preference-manager.js extract "<text>"                  # 从文本智能提取偏好
 *   node preference-manager.js log                               # 查看记忆日志
 */

const fs = require('fs');
const path = require('path');

const PREFS_FILE = path.join(__dirname, '..', 'references', 'user-preferences.json');
const DEFAULT_FILE = path.join(__dirname, '..', 'references', 'default-preferences.json');

function loadPrefs() {
  try {
    return JSON.parse(fs.readFileSync(PREFS_FILE, 'utf-8'));
  } catch (e) {
    // 如果不存在，从默认模板复制
    const defaults = JSON.parse(fs.readFileSync(DEFAULT_FILE, 'utf-8'));
    defaults.created_at = new Date().toISOString();
    savePrefs(defaults);
    return defaults;
  }
}

function savePrefs(prefs) {
  prefs.updated_at = new Date().toISOString();
  fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2), 'utf-8');
}

function addLog(prefs, action, category, detail) {
  prefs.memory_log = prefs.memory_log || [];
  prefs.memory_log.push({
    time: new Date().toISOString(),
    action,
    category,
    detail
  });
}

// ====== 命令实现 ======

function show() {
  const prefs = loadPrefs();
  console.log('=== 用户偏好记忆 ===\n');
  
  const p = prefs.preferences;
  
  console.log('【口味偏好】');
  console.log(`  喜欢: ${p.taste.likes.length > 0 ? p.taste.likes.join('、') : '(未记录)'}`);
  console.log(`  不喜欢: ${p.taste.dislikes.length > 0 ? p.taste.dislikes.join('、') : '(未记录)'}`);
  console.log(`  辣度: ${p.taste.spicy_level}`);
  console.log(`  过敏: ${p.taste.allergies.length > 0 ? p.taste.allergies.join('、') : '无'}`);
  
  console.log('\n【消费习惯】');
  console.log(`  日常人均: ${p.budget.daily_meal ? '¥' + p.budget.daily_meal : '(未记录)'}`);
  console.log(`  约会预算: ${p.budget.date_budget ? '¥' + p.budget.date_budget : '(未记录)'}`);
  console.log(`  消费风格: ${p.budget.style}`);
  
  console.log('\n【通勤信息】');
  console.log(`  住址: ${p.commute.home_area}`);
  console.log(`  工作: ${p.commute.office_area}`);
  console.log(`  偏好交通: ${p.commute.preferred_transport || '(未记录)'}`);
  
  console.log('\n【生活节奏】');
  console.log(`  起床时间: ${p.lifestyle.wake_time || '(未记录)'}`);
  console.log(`  睡觉时间: ${p.lifestyle.sleep_time || '(未记录)'}`);
  console.log(`  周末习惯: ${p.lifestyle.weekend_style || '(未记录)'}`);
  
  console.log('\n【家庭人员】');
  console.log(`  有小孩: ${p.family.has_child ? '是' + (p.family.child_age ? ' (' + p.family.child_age + '岁)' : '') : '否'}`);
  console.log(`  有伴侣: ${p.family.has_partner ? '是' : '否'}`);
  if (p.family.partner_dislikes && p.family.partner_dislikes.length > 0) {
    console.log(`  伴侣不喜欢: ${p.family.partner_dislikes.join('、')}`);
  }
  
  console.log('\n【娱乐偏好】');
  console.log(`  喜欢: ${p.entertainment.likes.length > 0 ? p.entertainment.likes.join('、') : '(未记录)'}`);
  console.log(`  不喜欢: ${p.entertainment.dislikes.length > 0 ? p.entertainment.dislikes.join('、') : '(未记录)'}`);
  
  console.log('\n【特殊日期】');
  const dates = p.special_dates || {};
  if (Object.keys(dates).length === 0) {
    console.log('  (未记录)');
  } else {
    Object.entries(dates).forEach(([key, val]) => {
      console.log(`  ${key}: ${val}`);
    });
  }
  
  console.log(`\n记忆日志: ${prefs.memory_log ? prefs.memory_log.length : 0} 条`);
}

function update(category, jsonStr) {
  const prefs = loadPrefs();
  const data = JSON.parse(jsonStr);
  
  if (!prefs.preferences[category]) {
    console.error(`错误: 未知的偏好类别 "${category}"`);
    console.error(`可用类别: taste, budget, commute, lifestyle, family, entertainment`);
    process.exit(1);
  }
  
  // 合并更新（数组字段追加而非覆盖）
  Object.entries(data).forEach(([key, value]) => {
    const existing = prefs.preferences[category][key];
    if (Array.isArray(existing) && Array.isArray(value)) {
      // 数组合并去重
      const merged = [...new Set([...existing, ...value])];
      prefs.preferences[category][key] = merged;
    } else {
      prefs.preferences[category][key] = value;
    }
  });
  
  addLog(prefs, 'UPDATE', category, `更新了 ${Object.keys(data).join(', ')}`);
  savePrefs(prefs);
  
  console.log(`✅ 已更新偏好 [${category}]: ${JSON.stringify(data)}`);
}

function addDate(key, value) {
  const prefs = loadPrefs();
  prefs.preferences.special_dates = prefs.preferences.special_dates || {};
  prefs.preferences.special_dates[key] = value;
  
  addLog(prefs, 'ADD_DATE', 'special_dates', `${key} = ${value}`);
  savePrefs(prefs);
  
  console.log(`✅ 已添加特殊日期: ${key} = ${value}`);
}

function reset() {
  const defaults = JSON.parse(fs.readFileSync(DEFAULT_FILE, 'utf-8'));
  defaults.created_at = new Date().toISOString();
  defaults.memory_log = [{
    time: new Date().toISOString(),
    action: 'RESET',
    category: 'all',
    detail: '偏好已重置为默认值'
  }];
  savePrefs(defaults);
  
  console.log('✅ 偏好已重置为默认值');
}

function extract(text) {
  const prefs = loadPrefs();
  const extracted = [];
  
  // 口味提取
  const dislikePatterns = [
    /不[吃喜](.{1,4}?)(?:[，。,.\s]|$)/g,
    /不[爱要](.{1,4}?)(?:[，。,.\s]|$)/g,
    /讨厌(.{1,4}?)(?:[，。,.\s]|$)/g,
  ];
  
  const likePatterns = [
    /(?:爱|喜欢)吃(.{1,4}?)(?:[，。,.\s]|$)/g,
  ];
  
  dislikePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const item = match[1].trim();
      if (item && !prefs.preferences.taste.dislikes.includes(item)) {
        prefs.preferences.taste.dislikes.push(item);
        extracted.push(`不喜欢: ${item}`);
      }
    }
  });
  
  likePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const item = match[1].trim();
      if (item && !prefs.preferences.taste.likes.includes(item)) {
        prefs.preferences.taste.likes.push(item);
        extracted.push(`喜欢: ${item}`);
      }
    }
  });
  
  // 过敏提取
  const allergyMatch = text.match(/(?:过敏|不能吃)[：:]?\s*(.{1,6})/);
  if (allergyMatch) {
    const item = allergyMatch[1].trim();
    if (!prefs.preferences.taste.allergies.includes(item)) {
      prefs.preferences.taste.allergies.push(item);
      extracted.push(`过敏: ${item}`);
    }
  }
  
  // 辣度提取
  if (/能[吃受]辣|爱[吃辣]/.test(text)) {
    prefs.preferences.taste.spicy_level = '能吃辣';
    extracted.push('辣度: 能吃辣');
  }
  if (/不[能太]吃辣|微辣/.test(text)) {
    prefs.preferences.taste.spicy_level = '微辣';
    extracted.push('辣度: 微辣');
  }
  
  // 住址提取
  const homeMatch = text.match(/(?:住在|家在|住)(.{2,4}?)(?:[，。,.\s]|$)/);
  if (homeMatch) {
    prefs.preferences.commute.home_area = homeMatch[1].trim();
    extracted.push(`住址: ${homeMatch[1]}`);
  }
  
  // 工作地址提取
  const officeMatch = text.match(/在(.{2,4}?)(?:上班|工作)/);
  if (officeMatch) {
    prefs.preferences.commute.office_area = officeMatch[1].trim();
    extracted.push(`工作: ${officeMatch[1]}`);
  }
  
  // 预算提取
  const budgetMatch = text.match(/(?:人均|预算)[：:]?\s*(\d+)/);
  if (budgetMatch) {
    const amount = parseInt(budgetMatch[1]);
    if (amount <= 200) {
      prefs.preferences.budget.daily_meal = amount;
    } else {
      prefs.preferences.budget.date_budget = amount;
    }
    extracted.push(`预算: ¥${amount}`);
  }
  
  // 家庭提取
  if (/女朋友|男朋友|老婆|老公|伴侣/.test(text)) {
    prefs.preferences.family.has_partner = true;
    extracted.push('有伴侣: 是');
    
    // 伴侣偏好
    const partnerDislikeMatch = text.match(/(?:女朋友|男朋友|老婆|伴侣)(?:不[吃喜欢]|不爱)(.{1,6})/);
    if (partnerDislikeMatch) {
      prefs.preferences.family.partner_dislikes.push(partnerDislikeMatch[1]);
      extracted.push(`伴侣不喜欢: ${partnerDislikeMatch[1]}`);
    }
  }
  
  const childMatch = text.match(/(\d+)岁(?:的)?(?:宝宝|小孩|孩子|儿子|女儿)/);
  if (childMatch) {
    prefs.preferences.family.has_child = true;
    prefs.preferences.family.child_age = parseInt(childMatch[1]);
    extracted.push(`小孩: ${childMatch[1]}岁`);
  }
  
  // 特殊日期提取
  const dateMatch = text.match(/(?:生日|纪念日)[：:]?\s*(\d{1,2})月(\d{1,2})[号日]?/);
  if (dateMatch) {
    const month = dateMatch[1].padStart(2, '0');
    const day = dateMatch[2].padStart(2, '0');
    
    // 推断是谁的生日
    if (/女朋友|老婆|伴侣/.test(text)) {
      prefs.preferences.special_dates.partner_birthday = `${month}-${day}`;
      extracted.push(`伴侣生日: ${month}-${day}`);
    } else {
      prefs.preferences.special_dates.birthday = `${month}-${day}`;
      extracted.push(`生日: ${month}-${day}`);
    }
  }
  
  // 娱乐偏好
  const entLikes = text.match(/(?:喜欢|爱)(?:看|去|玩)?(?:电影|美术馆|公园|KTV|密室|攀岩|温泉)/g);
  if (entLikes) {
    entLikes.forEach(match => {
      const item = match.replace(/喜欢|爱|看|去|玩/g, '');
      if (item && !prefs.preferences.entertainment.likes.includes(item)) {
        prefs.preferences.entertainment.likes.push(item);
        extracted.push(`娱乐喜欢: ${item}`);
      }
    });
  }
  
  const entDislikes = text.match(/(?:不[喜欢爱]|讨厌)(?:看|去|玩)?(?:电影|美术馆|公园|KTV|密室|攀岩|温泉)/g);
  if (entDislikes) {
    entDislikes.forEach(match => {
      const item = match.replace(/不喜欢|不爱|讨厌|看|去|玩/g, '');
      if (item && !prefs.preferences.entertainment.dislikes.includes(item)) {
        prefs.preferences.entertainment.dislikes.push(item);
        extracted.push(`娱乐不喜欢: ${item}`);
      }
    });
  }
  
  if (extracted.length > 0) {
    addLog(prefs, 'EXTRACT', 'auto', `从对话提取: ${extracted.join('; ')}`);
    savePrefs(prefs);
    
    console.log('🧠 从文本中提取到以下偏好:\n');
    extracted.forEach(e => console.log(`  ✓ ${e}`));
    console.log(`\n共提取 ${extracted.length} 项，已保存。`);
  } else {
    console.log('未从文本中提取到偏好信息。');
  }
}

function showLog() {
  const prefs = loadPrefs();
  const log = prefs.memory_log || [];
  
  console.log(`=== 记忆日志 (共 ${log.length} 条) ===\n`);
  log.slice(-20).forEach(entry => {
    console.log(`  [${entry.time}] ${entry.action} [${entry.category}]: ${entry.detail}`);
  });
}

// ====== 主入口 ======

const [,, command, ...args] = process.argv;

switch (command) {
  case 'show':
    show();
    break;
  case 'update':
    if (!args[0] || !args[1]) {
      console.error('用法: node preference-manager.js update <category> <json>');
      process.exit(1);
    }
    update(args[0], args[1]);
    break;
  case 'add-date':
    if (!args[0] || !args[1]) {
      console.error('用法: node preference-manager.js add-date <key> <value>');
      process.exit(1);
    }
    addDate(args[0], args[1]);
    break;
  case 'reset':
    reset();
    break;
  case 'extract':
    if (!args[0]) {
      console.error('用法: node preference-manager.js extract "<text>"');
      process.exit(1);
    }
    extract(args[0]);
    break;
  case 'log':
    showLog();
    break;
  default:
    console.log('用法: node preference-manager.js <command>');
    console.log('');
    console.log('命令:');
    console.log('  show                              查看当前偏好');
    console.log('  update <category> <json>          更新偏好类别');
    console.log('  add-date <key> <value>            添加特殊日期');
    console.log('  reset                             重置为默认');
    console.log('  extract "<text>"                  从文本智能提取');
    console.log('  log                               查看记忆日志');
}
