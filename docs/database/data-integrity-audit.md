# 数据完整性只读审计基线

审计时间：2026-08-26。审计仅执行只读查询，未写入生产 Supabase；本文不包含邮箱、Token、食物内容或其他个人数据。

## 生产基线

- `daily_plans`：33 行，共 422 个餐食条目；审计时全部条目缺少 `foodSnapshot`。
- 失效用户食物引用：24 个条目、4 个缺失 UUID，影响 12 个计划。这些数据无法自动重建，只能标记 unresolved。
- `daily_checkins`：3 行，其中 1 行为 version 1，2 行缺少 version。
- 旧偏好键出现次数：`plannerDraft=3`、`heatmapPalette=2`、`deloadWeeks=1`、`healthSyncToken=1`；未读取或记录 Token 值。
- 已恢复 5 个线上 migration 文件，校验和由 `npm run db:verify-migrations` 固定验证。

## Advisor 基线

- Security：`set_updated_at` 可变 `search_path`、`food_import_cache` 启用 RLS 但无 policy、Dashboard 未启用 Leaked Password Protection。
- Performance：裸 `auth.uid()`、`daily_plans` 重复 permissive policy、缺失的 `foods.user_id` / 模板索引，以及需要 EXPLAIN 后才能判断的重复或未使用索引。

本轮 migration 修复函数 `search_path`、浏览器权限、RLS 初始化、重复 policy 和明确缺失索引。Dashboard 密码保护仍需管理员手动启用；未经过真实 EXPLAIN 和稳定观察期的索引、旧表和旧列没有删除。

## 本地验证基线

- 空库可从全部 migrations 重建。
- `supabase db lint --local --level warning`：0 项。
- Supabase 集成测试：9 项通过，覆盖 anon/跨用户 RLS、私有凭据隔离、体脂列契约、revision 冲突、原子完成日记录、原子导入、模板 CRUD、减载周并发、归档快照、第 31 条历史分页和热力图轻量投影。
- 本地 dry-run 审计与三个回填脚本均不需要生产写入即可运行。
