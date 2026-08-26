# NutriTrain 发布手册

本手册只描述发布流程。代码交付不会自动写入生产 Supabase、推送 GitHub 或部署 Vercel。

生产数据库执行记录（2026-08-26）：项目 `fitness-nutrition` 已应用
`20260607120000` 与 `20260826180000`，并完成草稿、食物快照和签到 v2 回填。
回填后复跑 dry-run 均为零待变更；24 条无法可靠还原的旧食物引用保留
`unresolved_food_ref:*` 完整性标记，没有伪造营养数据。发布前备份及前后审计保存在
`D:\Secure\NutriTrain-20260826`，文件由 Windows EFS 加密。GitHub 与 Vercel 的实时状态
以对应平台历史为准，不在本手册中硬编码。

## 1. 发布门禁

```powershell
npm ci
npm run verify:db
npm run verify
```

发布负责人还必须确认：

- 当前 Git 提交、目标 Supabase project ref 和 Vercel project 均正确；
- Supabase 可用备份已经完成，且恢复方式经过确认；
- `SUPABASE_SERVICE_ROLE_KEY` 只存在于受控管理员终端，不在 Git、浏览器或 `NEXT_PUBLIC_*` 中；
- 生产维护窗口内只有一名 migration 执行人；
- Supabase Dashboard 已启用 Leaked Password Protection（该设置不能由 migration 代办）。

## 2. Migration 真源

`supabase/migrations` 是唯一真源。线上已存在的 5 个历史版本已按真实 version 和校验和恢复；本轮新增：

```text
20260607120000_legacy_schema_baseline.sql
20260826180000_storage_safety_foundation.sql
```

基线 migration 使用幂等 DDL 补齐早于线上 migration history 的旧表；安全基线 migration 只做增量结构、兼容写入和权限收口，不删除旧表或旧列。

## 3. 预览环境

```powershell
npx supabase link --project-ref <preview-project-ref>
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

应用 migration 后验证：

1. `planner_drafts`、`deload_weeks` 可由登录用户访问自己的行，跨用户和 anon 均被拒绝。
2. `private.health_sync_credentials` 对浏览器角色不可见。
3. `save_planner_draft_v2` 能检测 revision 冲突。
4. `complete_daily_record_v2` 和 `import_user_foods_v1` 失败时不留下半成功数据。
5. `updated_at` 由触发器更新，客户端无需提交时间。
6. `food_import_cache` 无浏览器权限且有显式 deny policy。
7. Security/Performance Advisor 不再报告 mutable `search_path`、裸 `auth.uid()` 或重复 `daily_plans` policy。
8. 体测可写入并读回 `body_fat_pct`，总览加载体测时不会连带丢弃计划摘要。

## 4. 数据审计与回填

先在管理员终端设置服务端变量：

```powershell
$env:SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service-role-key>"
```

所有脚本默认只读：

```powershell
npm run db:audit -- --output D:\Secure\nutritrain-audit.json
npm run db:backfill:drafts
npm run db:backfill:food-snapshots
npm run db:migrate:checkins-v2
```

若 dry-run 的未知 schema、跨用户错误或 unresolved 数量高于审计基线，停止发布。确认结果后逐个执行，且每个命令使用新的仓库外备份文件：

```powershell
npm run db:backfill:drafts -- --apply --backup D:\Secure\drafts-before.ndjson
npm run db:backfill:food-snapshots -- --apply --backup D:\Secure\plans-before.ndjson
npm run db:migrate:checkins-v2 -- --apply --backup D:\Secure\checkins-before.ndjson
```

完成后再次运行 `db:audit`，核对版本、快照、unresolved 和行数。备份文件包含用户数据，必须加密保存并按内部留存策略删除，禁止提交 Git。

## 5. 应用与 Vercel

数据库增量 migration 先于新客户端发布。Vercel Preview 配置的浏览器变量只能是 URL 与 anon/publishable key。验证登录、今日计划、草稿冲突、模板 CRUD、食物归档/恢复、历史分页、热力图、体测和训练保存后，再提升到 Production。

不要在生产运行 `db reset --linked`、`--include-seed` 或修改 migration history 来伪造回滚。

## 6. 发布顺序

1. Release A：增量 migration。
2. Release B：双读/兼容客户端。
3. Release C：逐脚本 dry-run、备份和回填。
4. Release D：确认稳定后停止旧 preference 写入。
5. Release E：至少经过一个稳定发布周期和独立审批后，才讨论旧表/旧列清理。

本轮只实现 A-D 的兼容基础，不执行 Release E 的破坏性清理。回滚见 [`database/rollback.md`](database/rollback.md)。
