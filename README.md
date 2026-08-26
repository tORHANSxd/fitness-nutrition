# NutriTrain

基于 Next.js 16、React 19、TypeScript 和 Supabase 的训练与营养计划器。应用使用真实 App Router 路由、Supabase Cookie SSR 认证、IANA 时区业务日期，并支持公制/英制、kcal/kJ、周起始日、12/24 小时制和深浅主题偏好。

## 本地运行

```powershell
npm ci
npm run dev
```

打开 `http://localhost:3000`。业务页面需要 Supabase 登录；未配置 Supabase 时只显示管理员配置提示，不会把业务数据写入 `localStorage`。

主要路由：

- `/overview`：总览
- `/today`：目标与分餐
- `/calendar`：训练、饮食安排
- `/training`：逐组训练记录
- `/progress`：体测与历史
- `/resources`：食物库与模板
- `/settings`：地区、单位、主题和账户偏好

旧路径会重定向到对应新页面。

## 环境变量

复制 `.env.example` 为 `.env.local`：

```powershell
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

前端只能使用 anon/publishable key。不要把 `service_role` key 写入 `NEXT_PUBLIC_*`、Git 或 Vercel 客户端环境变量。

`PLAYWRIGHT_BASE_URL` 是可选测试变量，用于让 Playwright 连接已经运行的实例；缺省时测试会自动启动 `http://127.0.0.1:3200`。

## Supabase 初始化与迁移

`supabase/migrations` 是唯一迁移真源；[`supabase/schema.sql`](supabase/schema.sql) 只是本地重建后生成的审阅快照。全新和已有项目都必须按 migration 顺序初始化，不要在远程 Dashboard 中手工补结构。

仓库已恢复线上 5 个真实 migration version，并补充可重建基线与本轮增量迁移：

```text
supabase/migrations/20260607120000_legacy_schema_baseline.sql
supabase/migrations/20260607124646_fitness_system_v2_schema.sql
supabase/migrations/20260607134724_allow_food_weight_basis_none.sql
supabase/migrations/20260607141007_add_daily_checkin_dynamic_target.sql
supabase/migrations/20260724093227_food_ingredient_category.sql
supabase/migrations/20260825234027_global_preferences.sql
supabase/migrations/20260826180000_storage_safety_foundation.sql
```

本轮 migration 增加食物归档、计划/模板版本、独立草稿与减载周、数据库时间戳触发器、收口后的 RLS 和原子 RPC；没有删除旧业务表或旧 check-in 列。

本地完整验证：

```powershell
npm run db:start
npm run verify:db
```

先在本地或隔离的预览项目验证，再由一名发布负责人执行：

```powershell
npx supabase link --project-ref <project-ref>
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

生产执行前必须确认备份、目标 project ref 和发布窗口。不要对生产运行 `supabase db reset --linked`，也不要使用 `--include-seed`。完整步骤见 [`docs/deployment.md`](docs/deployment.md)。

管理员数据审计与回填脚本只读取 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`，默认 dry-run。任何 `--apply` 都强制要求 `--backup` 指向 Git 工作区外的绝对路径；详见 [`docs/database/rollback.md`](docs/database/rollback.md)。

## 验证

```powershell
npm run lint
npm run test
npm run build
npm run test:e2e
```

一次执行全部检查：

```powershell
npm run verify
```

时区测试覆盖 UTC-11、UTC+8、UTC+14、纽约 DST、跨年、闰日和自定义周起始日。视觉基线与验收记录位于 [`artifacts`](artifacts) 和 [`docs/test-matrix.md`](docs/test-matrix.md)。

## 部署边界

仓库代码不依赖 Google Fonts 或第三方 CDN。正式发布仍需单独完成 Vercel Preview、Supabase migration、Auth Redirect URL、自有域名、回滚演练和跨地区网络测试；这些生产操作不会由普通代码提交自动执行。

## 资料来源

- 《训练与营养计划》v2（2026-07-10，用户提供）
- [Supabase Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Vercel: Accessing Vercel-hosted sites from mainland China](https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china)
