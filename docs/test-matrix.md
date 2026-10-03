# 测试矩阵

## 自动检查

| 检查 | 命令 | 覆盖 |
| --- | --- | --- |
| 静态检查 | `npm run lint` | TypeScript、React、Next.js 及测试配置 |
| 类型检查 | `npm run typecheck` | 应用、测试、配置和管理员脚本 |
| 单元与组件 | `npm run test` | `tests/unit/` 与 `tests/database/`，包含 PGlite |
| 历史迁移 | `npm run db:verify-migrations` | 受保护历史迁移的校验和 |
| 真实数据库 | `npm run verify:db` | 本机空库 reset、DB lint、双用户 RLS 和事务 RPC |
| 生产构建 | `npm run build` | App Router、Proxy、SSR/CSR 边界 |
| 基础浏览器 | `npm run test:e2e` | 认证门禁、深链和 axe |
| 餐食与目标 | `npm run test:e2e:tre` | 复制、保存刷新、目标、协议和并发冲突 |
| 食物库浏览器 | `npm run test:e2e:food` | 食物搜索、分页、个人编辑与计划快照 |
| 教程浏览器 | `npm run test:e2e:tutorial` | 教程交互与偏好保存 |

`npm run verify` 包含 lint、类型、全部 Vitest、构建和基础/TRE 浏览器测试。食物库与教程套件按改动范围另外运行。PGlite 索引测试会创建 9,000 条合成记录；资源紧张时使用 `npm run test -- --maxWorkers=1`，保持原断言与数据规模。

测试配置统一位于 `tests/config/`；`tests/fixtures/` 保存独立公式向量、合成营养目标及 HTTP Supabase fixture。正式公式向量和迁移快照属于版本控制内容。

## 浏览器环境与产物

默认使用 Playwright Chromium，首次运行执行 `npx playwright install chromium`。本机已安装 Edge 时可设置 `PLAYWRIGHT_CHANNEL=msedge`；无需录像时设置 `PLAYWRIGHT_VIDEO=off`。这些变量不改变 CI 的默认浏览器配置。

三种自动化视口为 360×800、768×1024 和 1440×900。基础套件默认启动 `127.0.0.1:3200`，也可用 `PLAYWRIGHT_BASE_URL` 指向已有实例。其他套件使用应用端口 `3300` 与合成 fixture 端口 `45432`，不得将 fixture 测试指向生产账号。

截图、trace、报告和数据库查询计划写入仓库外：

- `<runtime>/artifacts/playwright/{base,tre,food,tutorial}/{results,report}/`
- `<runtime>/artifacts/database/local-query-plans.json`

`<runtime>` 默认是同级 `<仓库目录名>.local/`，可通过 `NUTRITRAIN_RUNTIME_DIR` 设置仓库外绝对路径。静态报告无需提交 Git。

## 复制餐食的回归点

- `tests/unit/copyMeals.test.tsx`：读取失败、确认失败、重复点击和过期请求。
- `tests/unit/usePlanner.test.tsx`：旧 ratio 计划转换、目标布局、独立 ID 和撤销。
- `tests/unit/storage.test.ts`、`tests/unit/recordSafety.test.tsx`：版本契约、保存和完成记录。
- `tests/e2e/custom-meals.spec.ts`：旧日期复制、撤销、保存及刷新。

目录整理另有 `tests/unit/runtimePaths.test.ts`，验证报告与审计文件的外部路径限制，包括符号链接绕过保护。

## 日期、无障碍与验证边界

日期测试覆盖 UTC-11/UTC+8/UTC+14、纽约 DST、跨午夜、跨月年、闰日与周起始日。历史业务日期不得因切换时区而漂移。

交互验收检查键盘焦点、Tab 圈闭、Escape、焦点恢复、状态播报和图表文本数据。axe 的 serious/critical 问题会使对应浏览器测试失败。补充人工检查 200%/400% 缩放、明暗主题、forced-colors、reduced-motion 及屏幕阅读器。

PGlite 与 HTTP fixture 验证合成场景，不能代替 Supabase Auth、PostgREST 和真实 RLS。`verify:db` 需要本机 Docker/Supabase；生产迁移、正式域名和真实账号流程需在对应环境分别核验，不能由本地测试结果推断。
