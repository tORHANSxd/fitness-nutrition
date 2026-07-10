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

- 营养：每日固定目标 2300 kcal（`targetKcal`，可调）、蛋白 175g 起（`proteinTargetG`，推荐 175–195）、脂肪 62g（`fatTargetG`，推荐 60–65），碳水 = 剩余热量 ÷ 4（约 235–260g）。无碳循环——训练日/休息日同一目标；TDEE 只作赤字监控（默认档案 ≈2895，赤字 ≈595）。热量校准：每 2 周按体重周均降幅手动调 targetKcal ±100–150。
- 训练：周一~周五 PPL+UL 五分化（推 / 拉 / 腿·股四头 / 上肢 / 腿·后链），周六日完全休息；模板 `fiveDayV2`（`lib/training.ts`）为默认。拉长位动作优先、单次每肌群 ≤8 有效组、每肌群每周 2 次。
- CarbDayType 仅为历史数据展示保留：新计划/训练记录一律 `mid`（标签"标准日"）。首页"本周碳水日"按**当周已保存饮食计划**统计（`weeklyCarbDayCounts`），不按训练记录。

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
