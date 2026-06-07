"""
动态模拟沙盒 — FastAPI Mock Backend
本地生活管家Agent的动态数据源，模拟真实世界中不断变化的状态。

启动方式:
  pip install fastapi uvicorn
  uvicorn main:app --host 0.0.0.0 --port 8900 --reload

核心特性:
  1. 餐厅排队状态动态变化（模拟10分钟内从有位到已满）
  2. 路况信息实时更新（高峰期拥堵模拟）
  3. 天气随机事件（突发暴雨、温度骤变）
  4. 叫车/预约模拟执行
  5. 动态事件流（随机生成有趣的生活事件）
"""

import json
import random
import time
import math
from datetime import datetime, timedelta
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List

app = FastAPI(title="本地生活动态模拟沙盒", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ====== 加载基础数据 ======

SKILLS_DIR = Path(__file__).parent.parent / "skills"
CITY_MAP_PATH = SKILLS_DIR / "shared" / "city-map.json"
WEATHER_PATH = SKILLS_DIR / "weather-awareness" / "references" / "weather-simulation.json"
DEALS_PATH = SKILLS_DIR / "deal-finder" / "references" / "deals-data.json"

def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

city_map = load_json(CITY_MAP_PATH)
weather_data = load_json(WEATHER_PATH)
deals_data = load_json(DEALS_PATH)

# ====== 动态状态存储 ======

class RestaurantState:
    """餐厅动态状态（排队、座位、等位时间）"""
    def __init__(self, restaurant_id: str, name: str):
        self.restaurant_id = restaurant_id
        self.name = name
        self.base_queue = random.randint(0, 20)  # 初始排队桌数
        self.last_update = time.time()
        self.trend = random.choice(["increasing", "stable", "decreasing"])
        self.trend_speed = random.uniform(0.5, 2.0)  # 每分钟变化桌数
    
    def get_current_queue(self) -> dict:
        """计算当前排队状态（基于时间流逝动态变化）"""
        elapsed_min = (time.time() - self.last_update) / 60
        
        if self.trend == "decreasing":
            current = max(0, self.base_queue - elapsed_min * self.trend_speed)
        elif self.trend == "increasing":
            current = min(30, self.base_queue + elapsed_min * self.trend_speed)
        else:
            current = self.base_queue + random.uniform(-1, 1)
        
        current = max(0, round(current))
        
        # 每10分钟随机改变趋势
        if elapsed_min > 10:
            self.trend = random.choice(["increasing", "stable", "decreasing"])
            self.trend_speed = random.uniform(0.5, 2.0)
            self.base_queue = current
            self.last_update = time.time()
        
        # 计算等待时间
        avg_eat_time = 45  # 平均用餐时间45分钟
        tables_available = max(1, 10 - current // 3)  # 假设10桌容量
        wait_minutes = (current // max(1, tables_available)) * avg_eat_time
        
        return {
            "restaurant_id": self.restaurant_id,
            "name": self.name,
            "queue_count": current,
            "estimated_wait_min": wait_minutes,
            "trend": self.trend,
            "status": "available" if current == 0 else ("busy" if current < 10 else "full"),
            "tables_total": 10,
            "tables_available": tables_available,
            "updated_at": datetime.now().isoformat()
        }

class TrafficState:
    """路况动态状态"""
    def __init__(self):
        self.routes = {}
        self._init_routes()
    
    def _init_routes(self):
        """初始化主要路线"""
        self.routes = {
            "home_to_office": {
                "name": "望京 → 中关村",
                "distance_km": 12,
                "base_time_min": 35,
                "routes": [
                    {"name": "地铁10号线→4号线", "type": "subway", "time_min": 35, "cost": 6, "congestion": 1.0},
                    {"name": "打车(四环)", "type": "car", "time_min": 30, "cost": 45, "congestion": 1.0},
                    {"name": "打车(三环)", "type": "car", "time_min": 25, "cost": 55, "congestion": 1.0},
                ]
            },
            "office_to_home": {
                "name": "中关村 → 望京",
                "distance_km": 12,
                "base_time_min": 35,
                "routes": [
                    {"name": "地铁4号线→10号线", "type": "subway", "time_min": 35, "cost": 6, "congestion": 1.0},
                    {"name": "打车(四环)", "type": "car", "time_min": 30, "cost": 45, "congestion": 1.0},
                ]
            }
        }
    
    def get_current_traffic(self) -> dict:
        """获取当前路况（基于时间段动态调整）"""
        now = datetime.now()
        hour = now.hour
        
        # 根据时间段计算拥堵系数
        if 7 <= hour <= 9:  # 早高峰
            congestion_car = random.uniform(1.5, 2.2)
            congestion_subway = random.uniform(1.0, 1.15)
            period = "早高峰"
        elif 17 <= hour <= 19:  # 晚高峰
            congestion_car = random.uniform(1.4, 2.0)
            congestion_subway = random.uniform(1.0, 1.1)
            period = "晚高峰"
        elif 22 <= hour or hour <= 6:  # 夜间
            congestion_car = random.uniform(0.7, 0.9)
            congestion_subway = 1.0
            period = "夜间"
        else:  # 平峰
            congestion_car = random.uniform(0.9, 1.2)
            congestion_subway = 1.0
            period = "平峰"
        
        result = {
            "period": period,
            "timestamp": datetime.now().isoformat(),
            "routes": []
        }
        
        for route_id, route_info in self.routes.items():
            route_result = {
                "route_id": route_id,
                "name": route_info["name"],
                "options": []
            }
            for option in route_info["routes"]:
                congestion = congestion_subway if option["type"] == "subway" else congestion_car
                adjusted_time = round(option["time_min"] * congestion)
                route_result["options"].append({
                    **option,
                    "congestion_multiplier": round(congestion, 2),
                    "adjusted_time_min": adjusted_time,
                    "delay_min": max(0, adjusted_time - option["time_min"])
                })
            result["routes"].append(route_result)
        
        return result

class EventGenerator:
    """动态事件生成器"""
    
    EVENT_TEMPLATES = [
        {"type": "restaurant", "template": "{name}今日推出限时特价：招牌菜8折", "impact": "positive"},
        {"type": "restaurant", "template": "{name}排队突然增多（旅游团到达）", "impact": "negative"},
        {"type": "weather", "template": "突发阵雨，预计30分钟后转晴", "impact": "warning"},
        {"type": "weather", "template": "空气质量突然下降，建议减少户外活动", "impact": "warning"},
        {"type": "traffic", "template": "四环发生交通事故，预计拥堵1小时", "impact": "negative"},
        {"type": "traffic", "template": "地铁10号线临时限流，预计延误15分钟", "impact": "negative"},
        {"type": "entertainment", "template": "万达影城《星际穿越》加映IMAX场次", "impact": "positive"},
        {"type": "entertainment", "template": "陶艺工坊周末加开夜间场（延至22:00）", "impact": "positive"},
        {"type": "deal", "template": "意面工坊限时闪购：双人套餐再降30元（仅限今天）", "impact": "positive"},
        {"type": "deal", "template": "海底捞大学生折扣扩至全时段（限时3天）", "impact": "positive"},
    ]
    
    def __init__(self):
        self.generated_events = []
        self.last_generation = time.time()
    
    def generate_events(self, count: int = 3) -> list:
        """生成随机动态事件"""
        restaurants = city_map.get("restaurants", [])
        events = []
        
        for _ in range(count):
            template = random.choice(self.EVENT_TEMPLATES)
            event = {
                "id": f"EVT-{len(self.generated_events) + len(events) + 1:04d}",
                "type": template["type"],
                "impact": template["impact"],
                "timestamp": datetime.now().isoformat(),
            }
            
            if "{name}" in template["template"] and restaurants:
                r = random.choice(restaurants)
                event["description"] = template["template"].format(name=r["name"])
                event["restaurant_id"] = r["id"]
            else:
                event["description"] = template["template"]
            
            events.append(event)
        
        self.generated_events.extend(events)
        return events

# ====== 初始化动态状态 ======

restaurant_states = {}
for r in city_map.get("restaurants", []):
    restaurant_states[r["id"]] = RestaurantState(r["id"], r["name"])

traffic_state = TrafficState()
event_generator = EventGenerator()

# 叫车和预约记录
car_orders = []
reservations = []


# ====== API 端点 ======

# --- 餐厅排队 ---

@app.get("/api/queue/{restaurant_id}")
async def get_queue_status(restaurant_id: str):
    """查询餐厅排队状态（动态变化）"""
    if restaurant_id not in restaurant_states:
        raise HTTPException(status_code=404, detail=f"餐厅 {restaurant_id} 不存在")
    
    state = restaurant_states[restaurant_id].get_current_queue()
    return state


@app.get("/api/queue")
async def get_all_queues():
    """查询所有餐厅排队状态"""
    return {
        "timestamp": datetime.now().isoformat(),
        "restaurants": [s.get_current_queue() for s in restaurant_states.values()]
    }


@app.post("/api/queue/{restaurant_id}/simulate")
async def simulate_queue_change(restaurant_id: str, target_count: int):
    """手动设置排队桌数（用于演示控制）"""
    if restaurant_id not in restaurant_states:
        raise HTTPException(status_code=404, detail=f"餐厅 {restaurant_id} 不存在")
    
    state = restaurant_states[restaurant_id]
    state.base_queue = target_count
    state.last_update = time.time()
    state.trend = "stable"
    
    return {
        "message": f"已设置 {state.name} 排队为 {target_count} 桌",
        "current": state.get_current_queue()
    }


# --- 路况 ---

@app.get("/api/traffic")
async def get_traffic():
    """查询实时路况（基于时间段动态变化）"""
    return traffic_state.get_current_traffic()


# --- 天气 ---

@app.get("/api/weather/realtime")
async def get_realtime_weather():
    """查询实时天气（加入随机波动模拟）"""
    today = weather_data["forecast"][0]
    
    # 加入随机波动
    temp_offset = random.uniform(-2, 2)
    weather_options = [today["weather"]]
    
    # 10%概率天气突变
    if random.random() < 0.1:
        weather_options.extend(["突发阵雨", "大风", "雷暴预警"])
    
    return {
        "weather": random.choice(weather_options),
        "temp_current": round((today["temp_high"] + today["temp_low"]) / 2 + temp_offset, 1),
        "temp_high": today["temp_high"] + round(temp_offset),
        "temp_low": today["temp_low"] + round(temp_offset),
        "wind": today["wind"],
        "aqi": today["aqi"],
        "sudden_change": len(weather_options) > 1,
        "timestamp": datetime.now().isoformat()
    }


@app.get("/api/weather/alerts")
async def get_weather_alerts():
    """查询天气预警（随机生成）"""
    alerts = []
    if random.random() < 0.3:
        alert_types = [
            {"level": "黄色", "type": "暴雨", "desc": "预计未来2小时有中到大雨", "advice": "建议地铁出行，避免骑车"},
            {"level": "橙色", "type": "高温", "desc": "最高气温将达38°C", "advice": "避免长时间户外活动，注意防暑"},
            {"level": "蓝色", "type": "大风", "desc": "阵风6-7级", "advice": "注意户外安全，骑行不安全"},
        ]
        alerts.append(random.choice(alert_types))
    
    return {"alerts": alerts, "timestamp": datetime.now().isoformat()}


# --- 叫车 ---

class CarOrder(BaseModel):
    from_location: str = "user_home"
    to_location: str
    restaurant_id: Optional[str] = None

@app.post("/api/car/call")
async def call_car(order: CarOrder):
    """模拟叫车"""
    car_id = f"CAR-{random.randint(1000, 9999)}"
    plate = f"京B·{random.randint(10000, 99999)}"
    cars = ["白色丰田卡罗拉", "黑色大众帕萨特", "银色比亚迪秦", "蓝色北汽新能源"]
    eta = random.randint(3, 12)
    cost = random.randint(25, 65)
    
    car_order = {
        "order_id": car_id,
        "status": "dispatched",
        "car": {"plate": plate, "model": random.choice(cars)},
        "eta_min": eta,
        "estimated_cost": cost,
        "from": order.from_location,
        "to": order.to_location,
        "created_at": datetime.now().isoformat()
    }
    car_orders.append(car_order)
    
    return car_order


@app.get("/api/car/status/{order_id}")
async def get_car_status(order_id: str):
    """查询叫车状态"""
    order = next((o for o in car_orders if o["order_id"] == order_id), None)
    if not order:
        raise HTTPException(status_code=404, detail="订单不存在")
    
    # 模拟状态推进
    elapsed = (datetime.now() - datetime.fromisoformat(order["created_at"])).total_seconds()
    if elapsed > order["eta_min"] * 60:
        order["status"] = "arrived"
    elif elapsed > order["eta_min"] * 30:
        order["status"] = "approaching"
    
    return order


# --- 预约/取号 ---

class Reservation(BaseModel):
    restaurant_id: str
    party_size: int = 2
    notes: Optional[str] = None

@app.post("/api/reservation")
async def make_reservation(reservation: Reservation):
    """模拟餐厅预约/取号"""
    if reservation.restaurant_id not in restaurant_states:
        raise HTTPException(status_code=404, detail="餐厅不存在")
    
    state = restaurant_states[reservation.restaurant_id]
    queue = state.get_current_queue()
    
    # 生成排号
    queue_number = f"A{random.randint(10, 99)}"
    
    res = {
        "reservation_id": f"RES-{random.randint(10000, 99999)}",
        "restaurant_id": reservation.restaurant_id,
        "restaurant_name": state.name,
        "queue_number": queue_number,
        "party_size": reservation.party_size,
        "queue_ahead": max(0, queue["queue_count"] - 1),
        "estimated_wait_min": queue["estimated_wait_min"],
        "status": "confirmed",
        "notes": reservation.notes,
        "created_at": datetime.now().isoformat()
    }
    reservations.append(res)
    
    return res


# --- 动态事件流 ---

@app.get("/api/events")
async def get_events(count: int = 5):
    """获取动态事件（随机生成的城市生活事件）"""
    events = event_generator.generate_events(count)
    return {
        "events": events,
        "total": len(event_generator.generated_events),
        "timestamp": datetime.now().isoformat()
    }


@app.get("/api/events/stream")
async def event_stream():
    """事件流（每次调用返回1个新事件，模拟实时推送）"""
    events = event_generator.generate_events(1)
    return events[0] if events else {"message": "暂无新事件"}


# --- 综合状态面板 ---

@app.get("/api/dashboard")
async def get_dashboard():
    """综合状态面板（一次获取所有动态信息）"""
    return {
        "timestamp": datetime.now().isoformat(),
        "weather": await get_realtime_weather(),
        "traffic": traffic_state.get_current_traffic(),
        "top_queues": sorted(
            [s.get_current_queue() for s in restaurant_states.values()],
            key=lambda x: x["queue_count"]
        )[:5],
        "weather_alerts": await get_weather_alerts(),
        "recent_events": event_generator.generated_events[-5:],
        "active_car_orders": [o for o in car_orders if o["status"] != "completed"],
        "active_reservations": reservations[-3:]
    }


# --- 演示专用 ---

@app.post("/api/demo/simulate-queue-flow")
async def demo_queue_flow():
    """
    演示专用：模拟完整的排队变化流程
    在10秒内模拟餐厅从"排队15桌"逐渐减少到"4桌"的过程
    """
    restaurant_id = "R13"  # 海底捞
    state = restaurant_states.get(restaurant_id)
    if not state:
        raise HTTPException(status_code=404, detail="餐厅不存在")
    
    # 设置初始状态
    state.base_queue = 15
    state.last_update = time.time()
    state.trend = "decreasing"
    state.trend_speed = 1.5  # 每分钟减少1.5桌
    
    return {
        "message": "演示模式已启动：海底捞排队将从15桌开始递减",
        "initial_queue": 15,
        "trend": "decreasing",
        "speed": "1.5桌/分钟",
        "estimated_trigger_time": "约7分钟后（排队≤5桌时触发提醒）",
        "instruction": "使用 GET /api/queue/R13 持续查询排队变化"
    }


@app.get("/")
async def root():
    return {
        "name": "本地生活动态模拟沙盒",
        "version": "1.0.0",
        "description": "为本地生活管家Agent提供动态模拟数据",
        "endpoints": {
            "餐厅排队": "GET /api/queue/{restaurant_id}",
            "全部排队": "GET /api/queue",
            "路况信息": "GET /api/traffic",
            "实时天气": "GET /api/weather/realtime",
            "天气预警": "GET /api/weather/alerts",
            "叫车服务": "POST /api/car/call",
            "车辆状态": "GET /api/car/status/{order_id}",
            "餐厅预约": "POST /api/reservation",
            "动态事件": "GET /api/events",
            "事件流": "GET /api/events/stream",
            "综合面板": "GET /api/dashboard",
            "演示-排队流程": "POST /api/demo/simulate-queue-flow"
        }
    }
