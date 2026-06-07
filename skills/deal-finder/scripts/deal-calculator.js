#!/usr/bin/env node
/**
 * 优惠计算器 - 组合优惠计算、预算优化、省钱方案
 * 
 * 用法:
 *   node deal-calculator.js query <restaurant_id|venue_id>    # 查询单店优惠
 *   node deal-calculator.js combo <ids...>                    # 计算组合优惠
 *   node deal-calculator.js optimize <budget> <plan_json>     # 预算优化方案
 * 
 * plan_json: JSON数组 [{"id":"R06","name":"意面工坊","price":240,"type":"restaurant"}, ...]
 */

const fs = require('fs');
const path = require('path');

const DEALS_PATH = path.join(__dirname, '..', 'references', 'deals-data.json');
const CITY_PATH = path.join(__dirname, '..', '..', 'shared', 'city-map.json');

const dealsData = JSON.parse(fs.readFileSync(DEALS_PATH, 'utf8'));
const cityData = JSON.parse(fs.readFileSync(CITY_PATH, 'utf8'));

/**
 * 查询单个餐厅/场所的优惠
 */
function queryDeals(id) {
  const results = { restaurant_deals: [], venue_deals: [], combo_deals: [], transport_deals: [] };

  // 餐厅优惠
  if (dealsData.restaurant_deals) {
    results.restaurant_deals = dealsData.restaurant_deals.filter(d => d.restaurant_id === id);
  }

  // 场所优惠
  if (dealsData.venue_deals) {
    results.venue_deals = dealsData.venue_deals.filter(d => d.venue_id === id);
  }

  // 相关组合优惠
  if (dealsData.combo_deals) {
    results.combo_deals = dealsData.combo_deals.filter(d => {
      const items = d.includes || d.items || [];
      return items.some(item => {
        if (typeof item === 'string') return item === id;
        return item.id === id || item.restaurant_id === id || item.venue_id === id;
      });
    });
  }

  // 出行优惠
  if (dealsData.transport_deals) {
    results.transport_deals = dealsData.transport_deals;
  }

  return results;
}

/**
 * 计算多项目的组合优惠
 */
function calcComboDeals(ids) {
  const result = {
    items: [],
    individual_deals: [],
    combo_deals: [],
    original_total: 0,
    optimized_total: 0,
    savings: 0,
    savings_details: []
  };

  // 获取各项目的原价
  ids.forEach(id => {
    const restaurant = cityData.restaurants.find(r => r.id === id);
    const venue = cityData.venues.find(v => v.id === id);
    const item = restaurant || venue;
    if (item) {
      const price = item.avg_price || item.price || 0;
      result.items.push({ id, name: item.name, price, type: restaurant ? 'restaurant' : 'venue' });
      result.original_total += price;
    }
  });

  // 查找适用的单店优惠
  ids.forEach(id => {
    const deals = queryDeals(id);
    const allDeals = [...deals.restaurant_deals, ...deals.venue_deals];
    if (allDeals.length > 0) {
      const bestDeal = allDeals.reduce((best, d) => {
        const saving = d.saving || d.discount_amount || 0;
        return saving > (best.saving || 0) ? { ...d, saving } : best;
      }, {});
      if (bestDeal.saving) {
        result.individual_deals.push({ id, deal: bestDeal.name || bestDeal.description, saving: bestDeal.saving });
      }
    }
  });

  // 查找适用的组合优惠
  if (dealsData.combo_deals) {
    dealsData.combo_deals.forEach(combo => {
      const comboItems = combo.includes || combo.items || [];
      const comboIds = comboItems.map(item => typeof item === 'string' ? item : item.id || item.restaurant_id || item.venue_id);
      const matchCount = comboIds.filter(cid => ids.includes(cid)).length;
      if (matchCount >= comboIds.length) {
        result.combo_deals.push({
          name: combo.name || combo.description,
          original_price: combo.original_price,
          combo_price: combo.price || combo.combo_price,
          saving: (combo.original_price || 0) - (combo.price || combo.combo_price || 0),
          includes: comboIds
        });
      }
    });
  }

  // 计算最优方案
  let maxSaving = 0;
  // 方案1: 单店优惠叠加
  const individualSaving = result.individual_deals.reduce((sum, d) => sum + d.saving, 0);
  // 方案2: 组合优惠
  result.combo_deals.forEach(combo => {
    if (combo.saving > maxSaving) maxSaving = combo.saving;
  });
  // 取最优
  const bestSaving = Math.max(individualSaving, maxSaving);

  result.optimized_total = result.original_total - bestSaving;
  result.savings = bestSaving;

  if (individualSaving >= maxSaving && individualSaving > 0) {
    result.savings_details = result.individual_deals.map(d => `${d.deal}: 省¥${d.saving}`);
    result.best_strategy = 'individual_deals';
  } else if (maxSaving > 0) {
    const bestCombo = result.combo_deals.find(c => c.saving === maxSaving);
    result.savings_details = [`${bestCombo?.name}: 省¥${maxSaving}`];
    result.best_strategy = 'combo_deal';
  } else {
    result.best_strategy = 'none';
  }

  return result;
}

/**
 * 预算优化 - 给定预算和方案，自动降级到预算内
 */
function optimizeForBudget(budget, planItems) {
  const result = {
    original_plan: planItems,
    original_total: planItems.reduce((sum, p) => sum + p.price, 0),
    budget,
    over_budget: false,
    optimized_plan: [...planItems],
    adjustments: [],
    final_total: 0
  };

  const total = result.original_total;
  if (total <= budget) {
    result.final_total = total;
    result.over_budget = false;
    return result;
  }

  result.over_budget = true;
  let currentTotal = total;

  // 降级策略1: 出行降级（打车→地铁，节省约¥20-40）
  const transportItems = result.optimized_plan.filter(p => p.type === 'transport' && p.price > 10);
  transportItems.forEach(item => {
    if (currentTotal > budget) {
      const saved = item.price - 6; // 地铁¥6
      item.price = 6;
      item.adjusted = true;
      item.note = '出行降级: 打车→地铁';
      result.adjustments.push({ type: 'transport', desc: `${item.name}: 打车¥${item.price + saved}→地铁¥6, 省¥${saved}` });
      currentTotal -= saved;
    }
  });

  // 降级策略2: 娱乐降级（收费场所→免费场所）
  if (currentTotal > budget) {
    const venueItems = result.optimized_plan
      .filter(p => p.type === 'venue' && p.price > 0)
      .sort((a, b) => b.price - a.price);

    venueItems.forEach(item => {
      if (currentTotal > budget) {
        const saved = item.price;
        const freeAlternative = cityData.venues.find(v => v.price === 0 && v.child_friendly !== false);
        if (freeAlternative) {
          result.adjustments.push({ type: 'venue', desc: `${item.name}(¥${item.price})→${freeAlternative.name}(免费), 省¥${saved}` });
          item.price = 0;
          item.name = freeAlternative.name;
          item.adjusted = true;
          item.note = `替换为免费场所: ${freeAlternative.name}`;
          currentTotal -= saved;
        }
      }
    });
  }

  // 降级策略3: 应用组合优惠
  if (currentTotal > budget) {
    const ids = result.optimized_plan.map(p => p.id).filter(Boolean);
    const comboResult = calcComboDeals(ids);
    if (comboResult.savings > 0) {
      result.adjustments.push({ type: 'combo', desc: `应用组合优惠: 省¥${comboResult.savings}` });
      currentTotal -= comboResult.savings;
    }
  }

  // 降级策略4: 餐饮降级
  if (currentTotal > budget) {
    const foodItems = result.optimized_plan
      .filter(p => p.type === 'restaurant' && p.price > 50)
      .sort((a, b) => b.price - a.price);

    foodItems.forEach(item => {
      if (currentTotal > budget) {
        const cheaper = cityData.restaurants
          .filter(r => r.avg_price < (item.price / (item.persons || 2)) && r.rating >= 4.0)
          .sort((a, b) => a.avg_price - b.avg_price)[0];
        if (cheaper) {
          const newPrice = cheaper.avg_price * (item.persons || 2);
          const saved = item.price - newPrice;
          result.adjustments.push({ type: 'restaurant', desc: `${item.name}(¥${item.price})→${cheaper.name}(¥${newPrice}), 省¥${saved}` });
          item.price = newPrice;
          item.name = cheaper.name;
          item.adjusted = true;
          currentTotal -= saved;
        }
      }
    });
  }

  result.final_total = Math.round(currentTotal);
  result.within_budget = currentTotal <= budget;
  result.remaining_budget = Math.round(budget - currentTotal);

  return result;
}

// ========== CLI ==========
const [,, command, ...args] = process.argv;

switch (command) {
  case 'query': {
    const [id] = args;
    const result = queryDeals(id);
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  case 'combo': {
    const result = calcComboDeals(args);
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  case 'optimize': {
    const budget = parseInt(args[0]);
    const planJson = args[1];
    const plan = JSON.parse(planJson);
    const result = optimizeForBudget(budget, plan);
    console.log(JSON.stringify(result, null, 2));
    break;
  }

  default:
    console.log('用法: node deal-calculator.js <command> [args...]');
    console.log('命令: query, combo, optimize');
    process.exit(1);
}
