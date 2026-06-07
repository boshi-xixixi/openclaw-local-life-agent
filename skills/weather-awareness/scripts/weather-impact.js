#!/usr/bin/env node
/**
 * 天气影响计算器 - 天气对行程/消费/交通的影响分析
 * 
 * 用法:
 *   node weather-impact.js analyze <weather> [time]           # 分析天气影响
 *   node weather-impact.js suggest <weather> <scene>          # 给出天气联动建议
 *   node weather-impact.js adjust <plan_json> <weather>       # 根据天气调整方案
 * 
 * weather: sunny | rain | storm | hot | cold | fog
 * scene: commute | meal | leisure | full_day
 * plan_json: JSON对象 {"items": [...]}
 */

const fs = require('fs');
const path = require('path');

const WEATHER_PATH = path.join(__dirname, '..', 'references', 'weather-simulation.json');
const CITY_PATH = path.join(__dirname, '..', '..', 'shared', 'city-map.json');

const weatherData = JSON.parse(fs.readFileSync(WEATHER_PATH, 'utf8'));
const cityData = JSON.parse(fs.readFileSync(CITY_PATH, 'utf8'));

/**
 * 分析天气对各维度的影响
 */
function analyzeWeather(weather, time) {
  // 从weather-simulation.json获取天气数据
  const weatherInfo = weatherData.conditions?.[weather] || weatherData[weather] || {};
  
  const impacts = {
    weather,
    weather_label: weatherInfo.name || weatherInfo.label || weather,
    time: time || '全天',
    commute: {},
    dining: {},
    leisure: {},
    safety: {},
    cost_impact: {}
  };

  // 通勤影响
  switch (weather) {
    case 'sunny':
      impacts.commute = { impact: '无影响', bike_ok: true, walk_ok: true, delay: 0 };
      impacts.dining = { delivery_premium: 0, outdoor_ok: true };
      impacts.leisure = { outdoor_ok: true, indoor_preferred: false };
      break;
    case 'rain':
      impacts.commute = { impact: '轻度影响: 打车等待+10min, 路滑减速', bike_ok: false, walk_ok: true, delay: 10 };
      impacts.dining = { delivery_premium: 2, delivery_delay: 10, outdoor_ok: false };
      impacts.leisure = { outdoor_ok: false, indoor_preferred: true, note: '建议室内活动，携带雨具' };
      impacts.safety = { umbrella: true, raincoat: false, drive_careful: true };
      break;
    case 'storm':
      impacts.commute = { impact: '严重影响: 打车困难, 建议地铁', bike_ok: false, walk_ok: false, delay: 30 };
      impacts.dining = { delivery_premium: 3, delivery_delay: 20, outdoor_ok: false };
      impacts.leisure = { outdoor_ok: false, indoor_preferred: true, note: '强烈建议室内活动，避免外出' };
      impacts.safety = { umbrella: true, raincoat: true, drive_careful: true, stay_indoor: true };
      break;
    case 'hot':
      impacts.commute = { impact: '轻度影响: 避免长时间户外步行', bike_ok: true, walk_ok: false, delay: 5 };
      impacts.dining = { delivery_premium: 1, outdoor_ok: false, cold_drink_bonus: true };
      impacts.leisure = { outdoor_ok: false, indoor_preferred: true, note: '选择有空调的室内场所，注意防晒补水' };
      impacts.safety = { sunscreen: true, hydration: true, avoid_noon: true };
      break;
    case 'cold':
      impacts.commute = { impact: '轻度影响: 骑行体感差', bike_ok: false, walk_ok: true, delay: 5 };
      impacts.dining = { delivery_premium: 1, outdoor_ok: false, hot_food_bonus: true };
      impacts.leisure = { outdoor_ok: false, indoor_preferred: true, note: '优先室内活动，注意保暖' };
      impacts.safety = { warm_clothes: true, scarf: true };
      break;
    case 'fog':
      impacts.commute = { impact: '中度影响: 能见度低, 驾驶危险', bike_ok: false, walk_ok: true, delay: 15 };
      impacts.dining = { delivery_premium: 1, delivery_delay: 5, outdoor_ok: false };
      impacts.leisure = { outdoor_ok: false, indoor_preferred: true, note: '避免户外活动，能见度差' };
      impacts.safety = { low_visibility: true, drive_careful: true, mask_recommended: true };
      break;
  }

  // 成本影响
  if (weather === 'rain' || weather === 'storm') {
    impacts.cost_impact = {
      transport: '打车溢价约1.5-2倍',
      delivery: '配送费+¥2-3, 配送时间延长10-20分钟',
      estimate_extra: weather === 'storm' ? '¥50-80' : '¥20-40'
    };
  }

  return impacts;
}

/**
 * 天气联动建议
 */
function suggestByWeather(weather, scene) {
  const suggestions = { weather, scene, recommendations: [] };

  if (scene === 'commute') {
    switch (weather) {
      case 'sunny': suggestions.recommendations = ['地铁通勤(准时)', '骑行通勤(健康)']; break;
      case 'rain': suggestions.recommendations = ['地铁通勤(首选)', '打车(需预约提前15min)']; break;
      case 'storm': suggestions.recommendations = ['地铁通勤(唯一推荐)', '如非必要建议居家办公']; break;
      case 'hot': suggestions.recommendations = ['地铁通勤(有空调)', '打车(避免户外步行)']; break;
      case 'cold': suggestions.recommendations = ['地铁通勤(暖和)', '打车(避免骑行)']; break;
      case 'fog': suggestions.recommendations = ['地铁通勤(最安全)', '如必须驾车请减速慢行']; break;
    }
  } else if (scene === 'meal') {
    switch (weather) {
      case 'sunny': suggestions.recommendations = ['户外就餐区', '到店堂食', '外卖均可']; break;
      case 'rain': suggestions.recommendations = ['到店堂食(推荐)', '外卖(配送费稍高)']; break;
      case 'storm': suggestions.recommendations = ['外卖(首选, 避免外出)', '如已外出就近就餐']; break;
      case 'hot': suggestions.recommendations = ['冷食/沙拉/饮品', '室内空调餐厅', '外卖到家']; break;
      case 'cold': suggestions.recommendations = ['火锅/汤面/热食', '室内暖气餐厅', '外卖热饮']; break;
      case 'fog': suggestions.recommendations = ['就近就餐', '外卖配送']; break;
    }
  } else if (scene === 'leisure') {
    const outdoorVenues = cityData.venues.filter(v => v.outdoor === true).map(v => ({ id: v.id, name: v.name }));
    const indoorVenues = cityData.venues.filter(v => v.outdoor === false).map(v => ({ id: v.id, name: v.name }));
    suggestions.outdoor_venues = outdoorVenues;
    suggestions.indoor_venues = indoorVenues;

    switch (weather) {
      case 'sunny':
        suggestions.recommendations = ['户外场所优先', '可带儿童户外活动'];
        suggestions.preferred = 'outdoor';
        break;
      case 'rain':
      case 'storm':
      case 'fog':
        suggestions.recommendations = ['室内场所优先'];
        suggestions.preferred = 'indoor';
        suggestions.avoid = outdoorVenues.map(v => v.name);
        break;
      case 'hot':
        suggestions.recommendations = ['室内空调场所', '如有户外需注意防晒'];
        suggestions.preferred = 'indoor';
        break;
      case 'cold':
        suggestions.recommendations = ['室内暖和场所', '避免长时间户外'];
        suggestions.preferred = 'indoor';
        break;
    }
  }

  return suggestions;
}

/**
 * 根据天气调整已有方案
 */
function adjustPlan(plan, weather) {
  const adjustments = { weather, original_plan: plan, adjusted_plan: [], changes: [] };

  const items = Array.isArray(plan) ? plan : (plan.items || []);

  items.forEach(item => {
    const adjusted = { ...item };

    // 户外场所在恶劣天气下替换
    if (item.outdoor === true && ['rain', 'storm', 'fog'].includes(weather)) {
      const indoorAlt = cityData.venues.find(v => v.outdoor === false && v.child_friendly !== false);
      if (indoorAlt) {
        adjusted.original = item.name;
        adjusted.name = indoorAlt.name;
        adjusted.id = indoorAlt.id;
        adjusted.note = `因${weather}天气, 从户外替换为室内: ${indoorAlt.name}`;
        adjustments.changes.push(`场所替换: ${item.name} → ${indoorAlt.name} (${weather}天气)`);
      }
    }

    // 出行方式调整
    if (item.type === 'transport') {
      if (weather === 'storm' && item.method === 'taxi') {
        adjusted.method = 'subway';
        adjusted.note = '暴雨天气, 打车→地铁(更安全)';
        adjustments.changes.push(`出行调整: 打车→地铁 (暴雨天气)`);
      } else if (weather === 'rain' && item.method === 'bike') {
        adjusted.method = 'subway';
        adjusted.note = '下雨天, 骑行→地铁';
        adjustments.changes.push(`出行调整: 骑行→地铁 (下雨天)`);
      }
    }

    // 配送费调整
    if (item.type === 'delivery') {
      const premium = weather === 'storm' ? 3 : weather === 'rain' ? 2 : 0;
      if (premium > 0) {
        adjusted.price = (item.price || 0) + premium;
        adjusted.note = `${weather}天配送费溢价+¥${premium}`;
        adjustments.changes.push(`配送费调整: +¥${premium} (${weather}天气)`);
      }
    }

    adjustments.adjusted_plan.push(adjusted);
  });

  adjustments.total_changes = adjustments.changes.length;
  return adjustments;
}

// ========== CLI ==========
const [,, command, ...args] = process.argv;

switch (command) {
  case 'analyze': {
    const [weather, time] = args;
    console.log(JSON.stringify(analyzeWeather(weather, time), null, 2));
    break;
  }

  case 'suggest': {
    const [weather, scene] = args;
    console.log(JSON.stringify(suggestByWeather(weather, scene), null, 2));
    break;
  }

  case 'adjust': {
    const [planJson, weather] = args;
    const plan = JSON.parse(planJson);
    console.log(JSON.stringify(adjustPlan(plan, weather), null, 2));
    break;
  }

  default:
    console.log('用法: node weather-impact.js <command> [args...]');
    console.log('命令: analyze, suggest, adjust');
    process.exit(1);
}
