# fitness_nutrition — 项目说明（自 codex AGENTS.md 迁移，2026-06-10）

请始终使用中文回复。

need_git:true

本项目需要 Git 存档。代码修改后必须用 `local-git-remote` skill 提交到本地裸仓库远端：

`D:\Workspace\git\fitness_nutrition.git`

提交信息格式（中文）：`YYYY-MM-DD HH:mm:ss {修改内容}`。每次 Git 保存后，最终总结开头需报告：提交哈希、提交名、远端地址、工作区状态。

## 技术栈

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 3 + Supabase + recharts + lucide-react。Supabase 未配置时自动回退 localStorage（demo 模式）。测试：vitest。

## 计划方针（2026-07-10 起 · v2）

默认方针来自用户文档《训练与营养计划》v2（`D:\Personal\健身\训练与营养计划.md`），**旧的张老师/凯圣王碳循环方针已全部推倒**：

- 营养（2026-07-10 晚间起为公式派生）：目标热量 = TDEE − 赤字（`calorieDeficit` 默认 600，校准入口 ±100–150）；蛋白 = 去脂体重×2.5（体脂<20% ×2.8）向上取整 5g；脂肪 = 体重×0.65；碳水 = 剩余热量 ÷ 4。体重/体脂由**最新体测记录**（body_logs，含 body_fat_pct 列）水合覆盖（`mergeLatestBodyMetrics`）；`targetKcal/proteinTargetG/fatTargetG` 为可选手动覆盖（留空=公式）。新账号档案空白（`emptyProfile`），`isProfileComplete` 不满足时目标为 0 并出引导横幅；demo 档案（93.2kg/26%）公式复现文档 2300/175 数字。无碳循环——训练日/休息日同一目标。
- 训练：周一~周五 PPL+UL 五分化（推 / 拉 / 腿·股四头 / 上肢 / 腿·后链），周六日完全休息；模板 `fiveDayV2`（`lib/training.ts`）为默认。拉长位动作优先、单次每肌群 ≤8 有效组、每肌群每周 2 次。
- 碳循环概念已**整体移除**（2026-07-10 晚）：CarbDayType 类型、workout_sessions.carb_day_type 列（线上已 drop）、全部高/中/低碳 UI 与文案均删除；历史 daily_plans 的 result jsonb 里残留键不读即无害。
- 减载周（v2 文档双触发减载）：`profiles.preferences.deloadWeeks` 存周一起始日数组；训练/安排页"本周减载"开关（`useDeloadWeeks` hook 共享），开着时模板经 `applyDeloadToTemplate` 转减载版——组数砍约一半(≥1)、RIR 抬到 4、splitLabel 带"·减载"；重量 85–90% 与停用 LP/DS 靠提示条执行。

## 功能模块（重构必须全部保留）

- 当天计划 planner：身体/训练表单 → v2 固定每日目标 → 分餐求解器（`lib/nutrition.ts`，克数精确到 0.1g，硬性容忍带亏10g/盈5g）→ 应用推荐 → 保存计划
- 模板管理 templates：单餐模板 / 全天模板
- 食物库 foods：公共+用户食材 CRUD、能量校验
- 历史记录 history：已保存计划
- 登录 login：Supabase 邮箱认证
- 双存储 storage：Supabase / localStorage 回退

## 核心约定

- 求解器逻辑（`lib/nutrition.ts`）与 UI 解耦，重构皮肤不应改动数学；改目标/宏量规则要同步更新 `tests/nutrition.test.ts`。
- 所有克数、营养素展示保留 1 位小数（`round(v, 1)`）。

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **_Workspace_git_fitness_nutrition** (671 symbols, 1834 relationships, 56 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/_Workspace_git_fitness_nutrition/context` | Codebase overview, check index freshness |
| `gitnexus://repo/_Workspace_git_fitness_nutrition/clusters` | All functional areas |
| `gitnexus://repo/_Workspace_git_fitness_nutrition/processes` | All execution flows |
| `gitnexus://repo/_Workspace_git_fitness_nutrition/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
