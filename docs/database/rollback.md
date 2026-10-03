# 数据库回滚说明

## 原则

优先回滚应用，不立即反向删除数据库结构。本轮新增表、列、索引、trigger 和 RPC 均可在旧客户端运行期间保留；旧表和旧 check-in 列没有被删除。

## Migration 回滚

- 客户端故障：回退 Vercel 部署，保留 additive schema。
- RPC 故障：回退客户端到兼容读取路径，修复后追加新 migration；不要编辑已应用 migration。
- RLS 故障：先停止发布并用两个隔离用户复现，再追加修复 policy 的 migration。
- `healthSyncToken` 旧明文键不会恢复；需要用户重新授权，不能把旧 Token 放回浏览器可读 JSON。

## 回填回滚

所有 `--apply` 命令都要求 `--backup` 指向 Git 工作区外的新 NDJSON 文件。每行第一条是格式元数据，后续行保存更新前记录或将插入的草稿。

- 食物快照：按备份中的 `id + user_id` 恢复 `daily_plans.meals` 和 `integrity_flags`。
- Check-in V2：按 `id + user_id` 恢复备份行的 `actual`；旧习惯列从未删除。
- 草稿回填：删除备份中 `operation=insert` 对应的 `planner_drafts.user_id` 行；旧 `profiles.preferences.plannerDraft` 仍在兼容期保留。

恢复必须在事务中按批次执行，并同时限定主键和 `user_id`。先在隔离环境验证备份格式和恢复计数，禁止无 `WHERE` 更新。

## 不可回滚边界

已缺失且没有 snapshot 的旧食物无法凭空重建。回填只会保留条目并增加 unresolved flag；必须由用户选择替代食物。Dashboard 的 Leaked Password Protection 也应单独管理，不随应用回滚关闭。
