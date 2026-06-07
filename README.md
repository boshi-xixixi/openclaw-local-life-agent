# 新城市生活助手 · 本地生活管家 Agent

> 基于 **OpenClaw** 开源智能体框架构建。**用 1 句话替代 10 个 App**。

---

## 评委 60 秒速览

| 维度 | 内容 |
|------|------|
| **做什么** | 用自然语言对话替代点评/地图/打车/天气等多个 App 的本地生活服务入口 |
| **凭什么** | 8 个本地生活 Skill + 1 套共享虚拟城市 + 3 级联动架构 + 动态模拟沙盒 |
| **核心创新** | 数据/推理/编排三级联动 + 7×24 后台协同 + 跨会话长尾偏好记忆 |
| **数据安全** | 25 餐厅/18 场所/4 地铁线全模拟，**零真实 API、零用户信息收集** |
| **目标用户** | 25-40 岁一二线城市白领 |

**5 大核心能力**：
1. **人设**：管家"小橙"是朋友，不是 AI 客服
2. **联动**：8 个 Skill 协同，一个约束触发全链路调整
3. **7×24**：监控排队→剩 5 桌提醒→自动叫车→远程取号
4. **动态沙盒**：排队/路况/天气/事件真实时间维度演化
5. **记忆**：跨会话记住口味/预算/通勤/家庭/娱乐偏好

---

## 文档导览

| 想看什么 | 文档 | 用途 |
|---------|------|------|
| 项目全貌 | [项目介绍.md](docs/项目介绍.md) | 1 页概览 + 5 大亮点 + 典型用户旅程 |
| 架构与实现 | [技术文档.md](docs/技术文档.md) | 系统架构图 + Skill 详细设计 + 部署集成 + API 契约 |
| 测试用例 | [测试手册.md](docs/测试手册.md) | 8 大 Skill 测试 + 联动测试 + 沙盒测试 + 问题排查 |

---

## 3 分钟快速运行

```bash
# 0. 一键部署 Skills 到 OpenClaw（推荐）
bash install.sh
# 此脚本会自动将 8 个 Skill + 共享数据层同步到 ~/.openclaw/skills/

# 1. 启动动态沙盒（一个终端）
cd sandbox
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8900 --reload

# 2. 验证沙盒（另一个终端）
curl http://localhost:8900/api/dashboard
# 预期: 返回 JSON 含 weather/traffic/queues/events

# 3. 加载人设
mkdir -p ~/.openclaw/soul
cp SOUL.md ~/.openclaw/soul/default.md

# 4. 启动 OpenClaw 网关
openclaw gateway start

# 5. 验证 Skills 已加载
openclaw skills check | grep -E "food-order|commute|leisure|life-service|weather|deal-finder|always-on|user-preference"
# 预期: 8 个 Skill 全部显示 📦

# 6. 在 IM（飞书/微信/钉钉）发起对话
# "今天中午吃什么"        → 验证餐饮推荐
# "明天下雨了方案怎么调"   → 验证天气联动
# "帮我盯着海底捞排队"     → 验证 7×24 监控

# 7. 验证辅助脚本（可选）
skills/shared/scripts/city-utils.js search restaurant '{"cuisine":"川菜"}'
skills/always-on-scheduler/scripts/task-scheduler.js simulate
nskills/user-preference-memory/scripts/preference-manager.js show
```

---

## 8 个 Skill 一览

| # | Skill | 核心能力 | 关键场景 |
|---|-------|---------|---------|
| 1 | 餐饮点餐推荐 | 8 维约束推理 + N+1 菜 | "今天中午吃什么" |
| 2 | 通勤出行规划 | 4 种交通 + 多目的地串联 | "先去吃火锅再去看电影" |
| 3 | 休闲娱乐推荐 | 5 种画像 + 时间线编排 | "周末和女朋友约会" |
| 4 | 综合生活服务 | **编排中枢** + 生活百科 | 跨 Skill 全场景方案 |
| 5 | 天气感知引擎 | 驱动所有 Skill 决策 | "明天下雨" → 全方案重排 |
| 6 | 智能优惠比价 | 组合优惠 + 预算优化 | "预算 400 怎么办" |
| 7 | 7×24 自主调度 | 后台任务 + 监控→提醒→执行 | 排队监控→叫车→取号 |
| 8 | 用户偏好记忆 | 跨会话 7 维长尾记忆 | "上次你说不吃香菜" |

---

## 目录结构

```
.
├── SOUL.md                                  # 管家人设定义
├── README.md                                # 本文件（快速索引）
│
├── docs/                                    # 项目文档
│   ├── 项目介绍.md
│   ├── 技术文档.md
│   └── 测试手册.md
│
├── skills/                                  # 8 大 Skill + 共享数据
│   ├── shared/                              # 共享虚拟城市数据
│   ├── food-order-recommendation/
│   ├── commute-planning-assistant/
│   ├── leisure-activity-recommendation/
│   ├── life-service-query/
│   ├── weather-awareness/
│   ├── deal-finder/
│   ├── always-on-scheduler/
│   └── user-preference-memory/
│
└── sandbox/                                 # FastAPI 动态沙盒
    ├── main.py
    └── requirements.txt
```

---

## 赛题要求对照

| 赛题要求 | 本项目实现 | 状态 |
|---------|----------|------|
| 专属管家塑造（SOUL.md + 记忆） | "小橙"人设 + 7 维长尾偏好 | ✅ |
| 至少 3 个本地生活 Skill | **8 个** | ✅ 超额 167% |
| 7×24 自主协同 | 定时+事件监控+任务状态机 | ✅ |
| 动态模拟沙盒（FastAPI / Mockoon） | FastAPI，12 端点动态数据 | ✅ |

---

## 常见问题

**Q: 为什么不用真实 API？**
A: 赛题要求数据安全、不收集真实用户信息。虚拟城市能完整展示推理能力，避免了 API 依赖和数据隐私风险。

**Q: 模型幻觉怎么处理？**
A: 所有数据来自本地 JSON（city-map.json），LLM 只做理解和编排，精确计算由 Node.js 脚本完成，从源头减少幻觉。

**Q: 和直接调推荐算法比优势在哪？**
A: 本项目核心价值不是推荐准确度，而是**跨场景编排能力**——一个约束变化触发全链路自动调整，这是传统推荐系统做不到的。

**Q: 7×24 后台任务是怎么实现的？**
A: 基于 OpenClaw 的 Always-on 特性，通过定时触发器（Cron Jobs）和事件监控器（Watchers）实现。任务调度器持续轮询动态沙盒 API，条件满足时自动触发推送和执行动作。

**Q: 跨会话偏好记忆怎么做到？**
A: 偏好以 JSON 格式持久化存储在本地，每次对话开始时自动加载。同时支持从对话文本中智能提取偏好，并在下次推荐时自动应用。

---

## 数据安全声明

| 措施 | 说明 |
|------|------|
| 全模拟数据 | 25 餐厅 / 18 场所 / 4 地铁线 / 天气 / 优惠 均为虚构 |
| 无真实 API 调用 | 不接入美团/高德/天气/支付等任何真实第三方 API |
| 无用户信息收集 | 不收集姓名、手机号、地址等任何真实个人信息 |
| 偏好本地存储 | 偏好仅存储在本地 JSON 文件，不上传任何服务器 |
| 坐标虚拟化 | 虚拟城市坐标不对应任何真实地理位置 |
| 价格虚构 | 所有价格数据为模拟设定，不反映真实市场价格 |

---

## 团队与致谢

- 开发框架：[OpenClaw](https://github.com/anthropics/openclaw) v2.7.1
- 技能规范：AgentSkills 兼容规范
- 所有数据均为模拟数据，不涉及任何真实用户信息
