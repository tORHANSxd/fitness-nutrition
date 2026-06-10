# 完全重构 v2 — 精致深色·单强调色（去 slop）

## Design Read
数据密集型产品 UI（训练营养指挥台），非落地页。用户=跟张老师五分化的训练者。
语言=克制高级（Linear/Whoop/Oura）。Dial: VARIANCE 4 / MOTION 4 / DENSITY 6。

## 设计系统（taste-skill 纪律）
- 背景：off-black（非纯黑），冷调炭灰；表面分层 base/elevated/raised。
- 单一强调色：refined emerald（健康/表现感，非 AI 蓝紫）；饱和<80%。
- 禁：霓虹外发光、渐变大标题字、纯黑、多强调色、AI紫。
- 圆角统一一套；阴影=背景同色微染，无纯黑投影。
- 数字用 tabular-nums；密度偏高用细线/留白分组而非到处卡片。
- 图标沿用 lucide（项目已依赖，taste 允许）。

## 信息架构重构
- 桌面：固定左侧边栏导航（logo+竖向导航+状态/登出）替代顶+底双栏。
- 主区：顶部细 bar（页标题+日期+主操作）→ 今日指挥台 stat tiles → bento 内容。
- planner 分段化；移动端保留底部导航（精致化）。

## 步骤
1. [tokens] tailwind.config + globals.css 重定义为精致深色单强调；把 neon 工具类(text-gradient/bg-neon-grad/shadow-glow/glow-pulse)就地降级为雅致等价 → 旧组件自动去霓虹。
2. [shell] AppShell 重构为左侧栏 IA + 顶部 bar；移动底栏精致化；relative z。
3. [planner] NutritionPlanner 顶部重构为指挥台 stat tiles + bento + 分段；去霓虹；保留全部逻辑（委托 subagent）。
4. [secondary] FoodLibrary/Template/History/Auth/MacroBars/MetricCard 跟随令牌；必要处微调（委托）。
5. [verify] next build + vitest 通过；代码审查（Preview MCP 已断，无法截图）。
6. [archive] local-git-remote 提交 + 推 GitHub 触发 Vercel。

## 铁律
功能 100% 保留：计划/模板/食物库/历史/登录/双存储/求解器。lib/* 数学不动。
