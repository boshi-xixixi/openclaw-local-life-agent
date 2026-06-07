#!/usr/bin/env node
/**
 * 出行路线规划器 - 多交通方式对比、路况模拟、费用计算
 * 
 * 用法:
 *   node route-planner.js single <from> <to> [time_period]   # 单程规划
 *   node route-planner.js multi <start> <stops...> [time]     # 多目的地串联
 *   node route-planner.js commute [time_period]               # 家→公司通勤
 * 
 * time_period: peak_morning | peak_evening | normal | night (默认 normal)
 */

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', '..', 'shared', 'city-map.json');
const cityData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

// 交通参数
const TRANSPORT = {
  subway: { speed_kmh: 30, base_fare: 3, per_station: 1, label: '地铁' },
  taxi:   { speed_kmh: 25, base_fare: 13, per_km: 2.3, label: '打车' },
  bike:   { speed_kmh: 15, base_fare: 1.5, label: '骑行' },
  walk:   { speed_kmh: 5,  base_fare: 0, label: '步行' }
};

// 路况系数
const TRAFFIC = {
  peak_morning: { taxi: 1.8, subway: 1.0, bike: 1.0, walk: 1.0, label: '早高峰(7:30-9:30)' },
  peak_evening: { taxi: 1.6, subway: 1.0, bike: 1.0, walk: 1.0, label: '晚高峰(17:30-19:30)' },
  normal:       { taxi: 1.0, subway: 1.0, bike: 1.0, walk: 1.0, label: '平峰' },
  night:        { taxi: 0.8, subway: 1.0, bike: 1.0, walk: 1.0, label: '夜间(22:00-6:00)' }
};

// 天气影响系数
const WEATHER_MOD = {
  sunny:  { taxi: 1.0, subway: 1.0, bike: 1.0, walk: 1.0, bike_allowed: true,  walk_allowed: true },
  rain:   { taxi: 1.2, subway: 1.0, bike: 999, walk: 1.3, bike_allowed: false, walk_allowed: true },
  storm:  { taxi: 1.5, subway: 1.0, bike: 999, walk: 999, bike_allowed: false, walk_allowed: false },
  hot:    { taxi: 1.0, subway: 1.0, bike: 1.2, walk: 1.5, bike_allowed: true,  walk_allowed: true },
  cold:   { taxi: 1.0, subway: 1.0, bike: 1.3, walk: 1.3, bike_allowed: true,  walk_allowed: true },
  fog:    { taxi: 1.3, subway: 1.0, bike: 1.2, walk: 1.2, bike_allowed: true,  walk_allowed: true }
};

function calcDistance(coord1, coord2) {
  const dx = coord1[0] - coord2[0];
  const dy = coord1[1] - coord2[1];
  return Math.sqrt(dx * dx + dy * dy) * 111;
}

function findLocation(id) {
  const r = cityData.restaurants.find(r => r.id === id);
  if (r) return r;
  const v = cityData.venues.find(v => v.id === id);
  if (v) return v;
  if (id === 'home') return { ...cityData.user_home, id: 'home' };
  if (id === 'office') return { ...cityData.user_office, id: 'office' };
  return null;
}

/**
 * 计算单段路线的所有交通方式
 */
function planSegment(fromCoord, toCoord, timePeriod = 'normal', weather = 'sunny') {
  const distKm = calcDistance(fromCoord, toCoord);
  const traffic = TRAFFIC[timePeriod] || TRAFFIC.normal;
  const weatherMod = WEATHER_MOD[weather] || WEATHER_MOD.sunny;
  const bufferFactor = 1.3; // 含等车/步行换乘时间

  const options = {};

  // 地铁
  const subwayMin = (distKm / TRANSPORT.subway.speed_kmh * 60 * traffic.subway) * bufferFactor;
  const subwayStations = Math.max(1, Math.round(distKm / 1.5)); // 约1.5km一站
  options.subway = {
    label: '地铁',
    time_min: Math.round(subwayMin),
    cost: TRANSPORT.subway.base_fare + subwayStations * TRANSPORT.subway.per_station,
    distance_km: Math.round(distKm * 100) / 100,
    available: true
  };

  // 打车
  const taxiMin = (distKm / TRANSPORT.taxi.speed_kmh * 60 * traffic.taxi * weatherMod.taxi) * bufferFactor;
  const taxiCost = TRANSPORT.taxi.base_fare + distKm * TRANSPORT.taxi.per_km;
  options.taxi = {
    label: '打车',
    time_min: Math.round(taxiMin),
    cost: Math.round(taxiCost * 10) / 10,
    distance_km: Math.round(distKm * 100) / 100,
    available: true
  };

  // 骑行
  const bikeAllowed = weatherMod.bike_allowed && distKm <= 10;
  const bikeMin = bikeAllowed
    ? (distKm / TRANSPORT.bike.speed_kmh * 60 * weatherMod.bike) * bufferFactor
    : 999;
  options.bike = {
    label: '骑行',
    time_min: bikeAllowed ? Math.round(bikeMin) : null,
    cost: bikeAllowed ? TRANSPORT.bike.base_fare : null,
    distance_km: Math.round(distKm * 100) / 100,
    available: bikeAllowed,
    disabled_reason: !bikeAllowed ? (distKm > 10 ? '距离过远' : '天气不适合骑行') : null
  };

  // 步行
  const walkAllowed = weatherMod.walk_allowed && distKm <= 3;
  const walkMin = walkAllowed
    ? (distKm / TRANSPORT.walk.speed_kmh * 60 * weatherMod.walk) * bufferFactor
    : 999;
  options.walk = {
    label: '步行',
    time_min: walkAllowed ? Math.round(walkMin) : null,
    cost: 0,
    distance_km: Math.round(distKm * 100) / 100,
    available: walkAllowed,
    disabled_reason: !walkAllowed ? (distKm > 3 ? '距离过远' : '天气不适合步行') : null
  };

  // 推荐最优
  const available = Object.entries(options)
    .filter(([, v]) => v.available && v.time_min !== null)
    .sort((a, b) => a[1].time_min - b[1].time_min);
  const recommended = available[0]?.[0] || 'subway';

  return {
    options,
    recommended,
    traffic_period: traffic.label,
    weather_condition: weather,
    distance_km: Math.round(distKm * 100) / 100
  };
}

/**
 * 多目的地串联路线规划
 */
function planMultiRoute(startId, stopIds, timePeriod = 'normal', weather = 'sunny') {
  const start = findLocation(startId);
  if (!start) return { error: `找不到起点: ${startId}` };

  const stops = stopIds.map(id => findLocation(id)).filter(Boolean);
  if (stops.length === 0) return { error: '没有有效目的地' };

  // 贪心最近邻排序
  const route = [];
  const remaining = [...stops];
  let currentCoord = start.coord;
  let totalTime = 0;
  let totalCost = 0;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    remaining.forEach((dest, i) => {
      const d = calcDistance(currentCoord, dest.coord);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    });

    const next = remaining.splice(nearestIdx, 1)[0];
    const segment = planSegment(currentCoord, next.coord, timePeriod, weather);
    const recommended = segment.options[segment.recommended];

    route.push({
      segment: route.length + 1,
      to: { id: next.id, name: next.name },
      transport: segment.recommended,
      transport_label: recommended.label,
      time_min: recommended.time_min,
      cost: recommended.cost,
      distance_km: segment.distance_km,
      all_options: segment.options
    });

    totalTime += recommended.time_min;
    totalCost += recommended.cost;
    currentCoord = next.coord;
  }

  return {
    start: { id: start.id, name: start.name },
    route,
    summary: {
      total_time_min: totalTime,
      total_cost: Math.round(totalCost * 10) / 10,
      stops: route.length,
      traffic_period: TRAFFIC[timePeriod]?.label || '平峰',
      weather
    }
  };
}

// ========== CLI ==========
const [,, command, ...args] = process.argv;

switch (command) {
  case 'single': {
    const [fromId, toId, timePeriod, weather] = args;
    const from = findLocation(fromId);
    const to = findLocation(toId);
    if (!from || !to) { console.log(JSON.stringify({ error: '找不到地点' })); process.exit(1); }
    const result = planSegment(from.coord, to.coord, timePeriod || 'normal', weather || 'sunny');
    result.from = { id: from.id, name: from.name };
    result.to = { id: to.id, name: to.name };
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  case 'multi': {
    const startId = args[0];
    const stopIds = args.slice(1, -1);
    const timePeriod = args[args.length - 1]?.match(/^(peak_|normal|night)/) ? args.pop() : 'normal';
    const result = planMultiRoute(startId, stopIds.length ? stopIds : args.slice(1), timePeriod);
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  case 'commute': {
    const [timePeriod, weather] = args;
    const result = planSegment(
      cityData.user_home.coord,
      cityData.user_office.coord,
      timePeriod || 'peak_morning',
      weather || 'sunny'
    );
    result.from = { id: 'home', name: '家', address: cityData.user_home.address };
    result.to = { id: 'office', name: '公司', address: cityData.user_office.address };
    result.route_type = '每日通勤';
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  default:
    console.log('用法: node route-planner.js <command> [args...]');
    console.log('命令: single, multi, commute');
    process.exit(1);
}
