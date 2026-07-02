# Apple Watch / Apple 健康 数据接入指南

## 为什么不能"直接连"

本项目是跑在浏览器里的 Web 应用（Next.js）。**Safari/网页无法直接读取 Apple HealthKit（Apple Watch 数据）**——苹果没有向网页开放 Health 接口，只有原生 iOS App 能用 HealthKit。所以"连接手表"必须让 iPhone 端主动把数据**推**到本站的一个接口。

三条可行路径（本项目已实现第 1、2 条所需的服务端管道）：

| 路径 | 说明 | 是否需要上架 App |
|---|---|---|
| **Health Auto Export → API（推荐）** | App Store 上的「Health Auto Export – JSON API」按天自动把健康数据 POST 到本站 | 否 |
| **iOS 快捷指令 → API** | 用系统「快捷指令」读取健康样本，POST 到本站 | 否 |
| 原生伴侣 App（HealthKit） | 功能最全，但需 Apple 开发者账号并上架 | 是 |

## 可用数据与映射

Apple Watch / 健康里这些数据每天在测，本系统按下表使用：

| Apple 健康数据 | 本系统字段 | 用途 |
|---|---|---|
| 体重 Body Mass（连体脂秤同步） | `weightKg` | 喂 BMR / TDEE / 全部三大营养素目标 |
| 活动能量 Active Energy | `activeEnergyKcal` → 档案「运动消耗」 | 喂 **当日 TDEE**（决定当天目标热量） |
| 静息能量 Basal Energy | `restingEnergyKcal` | 对照 BMR |
| 静息心率 Resting HR | `restingHr` | 训练恢复参考 |
| 心率变异性 HRV(SDNN) | `hrvMs` | 训练恢复参考 |
| 睡眠 Sleep | `sleepHours` | 训练恢复参考 |
| 体脂率 Body Fat % | `bodyFatPct` | 去脂体重参考 |
| VO₂Max、步数、运动分钟 | `vo2max` / `steps` / `exerciseMinutes` | 趋势 / 活动量参考 |

> 最有价值的两项是**体重**和**活动能量**：它们直接进档案、驱动"当日目标热量 = 当日 TDEE"的新算法。

## 一次性准备

1. **建表**：在 Supabase → SQL Editor 执行仓库里的 [`supabase/health_metrics.sql`](../supabase/health_metrics.sql)（仅一次）。
2. **配置服务端密钥**：在 Vercel（或本地 `.env.local`）加环境变量 `SUPABASE_SERVICE_ROLE_KEY=<你的 service_role key>`，重新部署/重启。
   - service_role key 在 Supabase → Project Settings → API → `service_role`（**保密，切勿放进 `NEXT_PUBLIC_*`**）。
3. **生成令牌**：登录本站 → 当天计划页 → 「Apple 健康同步」卡片 → 生成同步令牌 → 复制形如
   `https://你的域名/api/health-sync?token=hs_xxxx` 的地址。

## 方式一：Health Auto Export（推荐）

1. iPhone 安装 App Store 的 **Health Auto Export – JSON API**。
2. 新建一个 **Automation**：
   - Metrics：勾选 体重(Weight & Body Mass)、活动能量(Active Energy)、静息心率(Resting Heart Rate)、HRV、睡眠(Sleep Analysis)、体脂率等。
   - Aggregation：按 **日**（Daily）。
   - Export Format：**JSON**；Destination：**REST API**，URL 填上一步复制的地址，方法 **POST**。
   - 频率：每天自动（例如每天 08:00）。
3. 手动跑一次，回本站卡片点刷新即可看到数据。

它发送的 JSON 形如：

```json
{ "data": { "metrics": [
  { "name": "weight_body_mass", "units": "kg", "data": [ { "date": "2026-07-01 00:00:00 +0800", "qty": 94.5 } ] },
  { "name": "active_energy",    "units": "kcal","data": [ { "date": "2026-07-01 23:59:00 +0800", "qty": 812 } ] }
] } }
```

## 方式二：iOS 快捷指令（不装额外 App）

新建快捷指令，大致步骤：

1. 「查找健康样本」分别取 体重、活动能量、静息心率 的最新值。
2. 用「文本」拼出简单 JSON：

```json
{ "date": "2026-07-01", "weightKg": 94.5, "activeEnergyKcal": 812, "restingHr": 52, "hrv": 61, "sleepHours": 7.5 }
```

3. 「获取 URL 内容」：URL 填同步地址，方法 **POST**，请求体 **JSON**，内容为上面的文本。
4. 用「自动化」设为每天触发。

## 载荷格式（接口约定）

`POST /api/health-sync?token=<令牌>`（或用请求头 `Authorization: Bearer <令牌>` / `X-Sync-Token`）。请求体支持两种：

- **Health Auto Export 格式**：`{ "data": { "metrics": [ { "name", "units", "data": [ { "date", "qty" } ] } ] } }`
- **简单格式**：单个对象或数组，字段名不区分大小写：`date/weightKg/bodyFatPct/activeEnergyKcal/restingHr/hrv/vo2max/sleepHours/steps/exerciseMinutes`

同一天多次上报按 `(user, date)` 覆盖；活动能量/步数/睡眠等分段样本按天累加。睡眠若以分钟上报会自动折算为小时。

## 自测连通性

```bash
# GET 看配置是否就绪
curl "https://你的域名/api/health-sync?token=你的令牌"

# POST 一条测试数据
curl -X POST "https://你的域名/api/health-sync?token=你的令牌" \
  -H "content-type: application/json" \
  -d '{"date":"2026-07-01","weightKg":94.5,"activeEnergyKcal":800,"restingHr":52}'
```

成功返回 `{ "ok": true, "saved": 1, ... }`；随后在「Apple 健康同步」卡片刷新可见，点「应用最新到档案」把体重/活动能量写入档案并自动重算 TDEE 与当日目标。
