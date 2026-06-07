#!/usr/bin/env node
/**
 * 城市数据工具库 - 距离计算、坐标查询、数据检索
 * 
 * 用法:
 *   node city-utils.js distance <id1> <id2>           # 计算两地距离(km)
 *   node city-utils.js nearby <type> <coord> <radius>  # 搜索附近场所
 *   node city-utils.js search <type> <filters>         # 按条件筛选
 *   node city-utils.js route <ids...>                  # 多目的地最优排序
 * 
 * type: restaurant | venue | subway_station
 * coord: "lng,lat" 格式
 * filters: JSON对象，如 '{"cuisine":"川菜","max_price":100}'
 */

const fs = require('fs');
const path = require('path');

// 加载城市数据
const DATA_PATH = path.join(__dirname, '..', 'city-map.json');
const cityData = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

/**
 * 欧几里得距离 × 111km（经纬度近似转公里）
 */
function calcDistance(coord1, coord2) {
  const dx = coord1[0] - coord2[0];
  const dy = coord1[1] - coord2[1];
  return Math.sqrt(dx * dx + dy * dy) * 111;
}

/**
 * 按ID查找地点（餐厅/场所/地标）
 */
function findById(id) {
  const restaurant = cityData.restaurants.find(r => r.id === id);
  if (restaurant) return { ...restaurant, _type: 'restaurant' };
  const venue = cityData.venues.find(v => v.id === id);
  if (venue) return { ...venue, _type: 'venue' };
  if (id === 'home') return { ...cityData.user_home, id: 'home', _type: 'landmark' };
  if (id === 'office') return { ...cityData.user_office, id: 'office', _type: 'landmark' };
  return null;
}

/**
 * 获取所有可检索地点
 */
function getAllLocations(type) {
  switch (type) {
    case 'restaurant': return cityData.restaurants.map(r => ({ ...r, _type: 'restaurant' }));
    case 'venue': return cityData.venues.map(v => ({ ...v, _type: 'venue' }));
    case 'all': return [
      ...cityData.restaurants.map(r => ({ ...r, _type: 'restaurant' })),
      ...cityData.venues.map(v => ({ ...v, _type: 'venue' })),
      { ...cityData.user_home, id: 'home', name: '家', _type: 'landmark' },
      { ...cityData.user_office, id: 'office', name: '公司', _type: 'landmark' },
    ];
    default: return [];
  }
}

/**
 * 搜索附近地点
 */
function searchNearby(type, coord, radiusKm, filters = {}) {
  const locations = getAllLocations(type);
  const results = locations
    .map(loc => ({
      ...loc,
      _distance: calcDistance(coord, loc.coord)
    }))
    .filter(loc => loc._distance <= radiusKm)
    .sort((a, b) => a._distance - b._distance);

  // 应用过滤器
  return results.filter(loc => {
    for (const [key, value] of Object.entries(filters)) {
      if (key === 'max_price') {
        const price = loc.avg_price || loc.price || 0;
        if (price > value) return false;
      } else if (key === 'min_rating') {
        if ((loc.rating || 0) < value) return false;
      } else if (key === 'child_friendly') {
        if (value && !loc.child_friendly) return false;
      } else if (key === 'has_delivery') {
        if (value && !loc.has_delivery) return false;
      } else if (key === 'cuisine') {
        if (loc.cuisine !== value) return false;
      } else if (key === 'tags') {
        const tags = Array.isArray(value) ? value : [value];
        if (!tags.some(t => (loc.tags || []).includes(t))) return false;
      } else if (key === 'outdoor') {
        if (value === false && loc.outdoor === true) return false;
      }
    }
    return true;
  });
}

/**
 * 多目的地最优排序（贪心最近邻，减少折返）
 */
function optimizeRoute(startId, destinationIds) {
  const start = findById(startId);
  if (!start) return { error: `找不到起点: ${startId}` };

  const destinations = destinationIds
    .map(id => findById(id))
    .filter(Boolean);

  if (destinations.length === 0) return { error: '没有有效目的地' };

  const route = [];
  const remaining = [...destinations];
  let currentCoord = start.coord;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    remaining.forEach((dest, i) => {
      const d = calcDistance(currentCoord, dest.coord);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    });
    const next = remaining.splice(nearestIdx, 1)[0];
    route.push({
      id: next.id,
      name: next.name,
      coord: next.coord,
      distance_km: Math.round(nearestDist * 100) / 100,
      distance_m: Math.round(nearestDist * 1000)
    });
    currentCoord = next.coord;
  }

  const totalDistance = route.reduce((sum, r) => sum + r.distance_km, 0);
  return {
    start: { id: start.id, name: start.name, coord: start.coord },
    route,
    total_distance_km: Math.round(totalDistance * 100) / 100
  };
}

// ========== CLI ==========
const [,, command, ...args] = process.argv;

switch (command) {
  case 'distance': {
    const [id1, id2] = args;
    const a = findById(id1);
    const b = findById(id2);
    if (!a || !b) { console.log(JSON.stringify({ error: '找不到地点' })); process.exit(1); }
    const dist = calcDistance(a.coord, b.coord);
    console.log(JSON.stringify({
      from: { id: a.id, name: a.name, coord: a.coord },
      to: { id: b.id, name: b.name, coord: b.coord },
      distance_km: Math.round(dist * 100) / 100,
      distance_m: Math.round(dist * 1000),
      walk_min: Math.round(dist / 5 * 60),
      bike_min: Math.round(dist / 15 * 60),
      drive_min: Math.round(dist / 25 * 60),
      subway_min: Math.round(dist / 30 * 60)
    }, null, 2));
    break;
  }

  case 'nearby': {
    const [type, coordStr, radius] = args;
    const coord = coordStr.split(',').map(Number);
    const results = searchNearby(type, coord, parseFloat(radius));
    console.log(JSON.stringify(results.map(r => ({
      id: r.id, name: r.name, type: r._type,
      distance_km: Math.round(r._distance * 100) / 100,
      price: r.avg_price || r.price || 0,
      rating: r.rating
    })), null, 2));
    break;
  }

  case 'search': {
    const [type, filtersStr] = args;
    const filters = filtersStr ? JSON.parse(filtersStr) : {};
    const allCoords = type === 'restaurant'
      ? cityData.user_home.coord
      : cityData.user_home.coord;
    const results = searchNearby(type, allCoords, 50, filters);
    console.log(JSON.stringify(results.map(r => ({
      id: r.id, name: r.name,
      cuisine: r.cuisine, type: r.type,
      price: r.avg_price || r.price, rating: r.rating,
      tags: r.tags, hours: r.hours,
      child_friendly: r.child_friendly,
      has_delivery: r.has_delivery
    })), null, 2));
    break;
  }

  case 'route': {
    const startId = args[0];
    const destIds = args.slice(1);
    const result = optimizeRoute(startId, destIds);
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  default:
    console.log('用法: node city-utils.js <command> [args...]');
    console.log('命令: distance, nearby, search, route');
    process.exit(1);
}
