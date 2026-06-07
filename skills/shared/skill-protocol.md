---
name: skill-protocol
version: 1.0.0
description: Skill间数据传递格式协议，定义各Skill联动时的标准数据结构，确保跨Skill调用的信息准确传递。
metadata:
  requires: []
---

# Skill 间数据传递协议

**CRITICAL — 所有跨Skill联动必须使用本协议定义的标准格式传递数据，禁止自由格式传递。**

---

## 一、通用消息格式

所有 Skill 间传递数据时，使用统一的 JSON 消息格式：

```json
{
  "from_skill": "发起方Skill名称",
  "to_skill": "接收方Skill名称",
  "action": "请求动作",
  "data": { ... },
  "constraints": { ... }
}
```

---

## 二、各场景传递格式

### 2.1 餐饮 → 出行（用户选了餐厅，请求出行规划）

```json
{
  "from_skill": "food-order-recommendation",
  "to_skill": "commute-planning-assistant",
  "action": "plan_route_to_restaurant",
  "data": {
    "restaurant_id": "R06",
    "restaurant_name": "意面工坊",
    "coord": [116.46, 39.91],
    "address": "朝阳区国贸商城B1"
  },
  "constraints": {
    "departure_from": "user_home",
    "arrive_before": "18:00",
    "weather": "rain"
  }
}
```

### 2.2 餐饮 → 娱乐（推荐餐厅附近的娱乐场所）

```json
{
  "from_skill": "food-order-recommendation",
  "to_skill": "leisure-activity-recommendation",
  "action": "find_nearby_venues",
  "data": {
    "restaurant_id": "R06",
    "restaurant_name": "意面工坊",
    "coord": [116.46, 39.91],
    "search_radius_km": 1.0
  },
  "constraints": {
    "person_type": "couple",
    "time_available_min": 180,
    "budget_remaining": 300
  }
}
```

### 2.3 娱乐 → 餐饮（时间线中插入用餐推荐）

```json
{
  "from_skill": "leisure-activity-recommendation",
  "to_skill": "food-order-recommendation",
  "action": "recommend_meal",
  "data": {
    "meal_type": "dinner",
    "around_coord": [116.40, 39.93],
    "target_time": "18:00"
  },
  "constraints": {
    "person_count": 2,
    "budget_per_person": 120,
    "person_type": "couple",
    "weather": "good_weather"
  }
}
```

### 2.4 娱乐/餐饮 → 出行（多目的地串联路线）

```json
{
  "from_skill": "leisure-activity-recommendation",
  "to_skill": "commute-planning-assistant",
  "action": "plan_multi_stop_route",
  "data": {
    "stops": [
      {"order": 1, "name": "陶艺工坊", "coord": [116.40, 39.94], "arrive_time": "13:00", "leave_time": "15:00"},
      {"order": 2, "name": "新城市美术馆", "coord": [116.40, 39.93], "arrive_time": "15:15", "leave_time": "17:15"},
      {"order": 3, "name": "意面工坊", "coord": [116.46, 39.91], "arrive_time": "17:45", "leave_time": "19:30"},
      {"order": 4, "name": "万达影城", "coord": [116.47, 39.91], "arrive_time": "19:40", "leave_time": "21:40"}
    ]
  },
  "constraints": {
    "departure_from": "user_home",
    "weather": "good_weather",
    "prefer_cheapest": false
  }
}
```

### 2.5 编排中枢 → 天气（获取天气约束）

```json
{
  "from_skill": "life-service-query",
  "to_skill": "weather-awareness",
  "action": "get_forecast",
  "data": {
    "day_offset": 1
  },
  "constraints": {}
}
```

**天气 Skill 返回格式：**

```json
{
  "weather": "多云转晴",
  "temp_high": 29,
  "temp_low": 19,
  "wind": "微风",
  "scenario_rules_matched": ["good_weather"],
  "impact": {
    "food": {"prefer_outdoor_seating": true},
    "transport": {"allow_all": true},
    "entertainment": {"prefer_outdoor": true, "prefer_park": true}
  }
}
```

### 2.6 编排中枢 → 优惠（查询优惠信息）

```json
{
  "from_skill": "life-service-query",
  "to_skill": "deal-finder",
  "action": "find_deals",
  "data": {
    "restaurant_ids": ["R06"],
    "venue_ids": ["V05", "V17"],
    "person_count": 2,
    "scenario": "couple"
  },
  "constraints": {
    "budget_total": 600,
    "current_total_cost": 696
  }
}
```

**优惠 Skill 返回格式：**

```json
{
  "single_deals": [
    {"id": "R06", "name": "意面工坊", "deal": "双人浪漫套餐199元（原价240）", "saving": 41},
    {"id": "V17", "name": "陶艺工坊", "deal": "双人票168元（原价216）", "saving": 48}
  ],
  "combo_deals": [
    {"name": "浪漫约会套餐", "desc": "意面工坊+万达影城双人套票299元", "saving": 51}
  ],
  "total_original": 696,
  "total_after_deals": 598,
  "total_saving": 98
}
```

### 2.7 天气 → 所有 Skill（天气约束广播）

```json
{
  "from_skill": "weather-awareness",
  "to_skill": "all",
  "action": "weather_broadcast",
  "data": {
    "weather": "小雨",
    "temp_high": 24,
    "temp_low": 17
  },
  "constraints": {
    "food": {"prefer_delivery": true, "prefer_indoor": true},
    "transport": {"ban_bike": true, "prefer_subway": true, "time_multiplier": 1.2},
    "entertainment": {"exclude_outdoor": true, "prefer_indoor": true}
  }
}
```

---

## 三、约束条件标准字段

所有 `constraints` 对象可包含以下标准字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `person_count` | int | 人数 |
| `person_type` | string | 人员类型：couple/family/friends/solo/team |
| `budget_total` | int | 总预算（元） |
| `budget_per_person` | int | 人均预算（元） |
| `weather` | string | 天气场景：rain/heavy_rain/snow/high_temp/low_temp/fog/good_weather |
| `depart_before` | string | 最晚出发时间 HH:MM |
| `arrive_before` | string | 最晚到达时间 HH:MM |
| `home_by` | string | 最晚回家时间 HH:MM |
| `has_child` | boolean | 是否带小孩 |
| `child_age` | int | 小孩年龄 |
| `search_radius_km` | float | 搜索半径（公里） |
