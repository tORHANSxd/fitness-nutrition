# NutriTrain 发布与回滚手册

本文只描述发布步骤。本次代码交付不自动修改生产 Supabase、Vercel、DNS 或域名。

## 1. 发布前门禁

- `npm ci`、`npm run lint`、`npm run test`、`npm run build`、`npm run test:e2e` 全部通过。
- 确认待发布提交、GitHub 分支和目标 Supabase project ref。
- 在 Supabase Dashboard 的 Database > Backups 确认可用备份；免费项目另行执行受控的逻辑备份。
- 确认 Vercel Preview 使用独立或可安全测试的 Supabase 环境。
- 禁止将 `service_role` key 放入客户端环境变量。
- 指定一名 migration 执行人，避免并发 `db push`。

## 2. 数据库迁移

本次待应用文件：

```text
supabase/migrations/20260825075937_global_preferences.sql
```

迁移是 additive：只为 `public.profiles` 增加偏好列、约束和注释，保留现有 `preferences jsonb` 与 RLS policy。

先在预览项目执行：

```powershell
npx supabase link --project-ref <preview-project-ref>
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

验证：

1. `profiles` 存在 `locale`、`time_zone`、`time_zone_mode`、`week_starts_on`、`unit_system`、`energy_unit`、`hour_cycle`、`theme`、`reduce_motion`。
2. 已有用户初始化为 `zh-CN` / `Asia/Shanghai`，`time_zone_mode=auto` 登录后会更新为设备检测时区。
3. 新用户首次登录能够创建 profile 偏好行。
4. 用户只能读取和更新自己的 profile；匿名请求无法访问业务数据。
5. 设置页保存后刷新，cookie 与 profile 值一致。

预览验收后，在生产维护窗口重复 `migration list`、`--dry-run` 和 `db push`。不要在生产运行 `db reset --linked` 或 `--include-seed`。

官方参考：[Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations)、[Database Backups](https://supabase.com/docs/guides/platform/backups)。

## 3. Vercel Preview

1. 从功能分支创建 Preview Deployment。
2. 配置 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
3. 在 Supabase Auth 中加入 Preview 与正式域名的允许 Redirect URL。
4. 验证未登录深链、登录、刷新 session、退出登录和旧路由重定向。
5. 按 `docs/test-matrix.md` 验证移动、平板、桌面、深浅主题、reduced motion、键盘和 200% 缩放。
6. Preview 通过且数据库迁移完成后，才可提升到 Production。

## 4. 回滚

优先回滚应用部署。偏好列是 additive，旧版本不会读取它们，因此应用回滚时可暂时保留数据库列，避免在故障窗口执行破坏性 DDL。

只有在确认没有已发布客户端继续读写新列、已经完成备份并通过维护窗口审批后，才考虑删除列和约束。不要通过修改 migration history 冒充数据库回滚；`migration repair` 只修正历史记录，不执行反向 SQL。

## 5. 中国大陆与全球访问

Vercel 当前不在中国大陆提供服务器或 CDN 节点，`.vercel.app` 及境外路由可能出现延迟、限流或不可访问。正式发布至少需要：

- 使用自有域名，不把 `.vercel.app` 当正式入口。
- 保持字体、图标和关键资源自托管；本仓库当前没有 Google Fonts 或第三方 CDN 运行时依赖。
- 在中国移动、中国联通、中国电信及东京、洛杉矶、法兰克福进行真实网络测量。
- 记录页面加载、Supabase Auth/REST 请求延迟、失败率和超时状态。
- 若部署到中国大陆基础设施，先完成 ICP 与数据合规评审；不要在 Vercel 前简单套一层代理。

用户时区与 Supabase 物理区域无直接关系。不要只因为增加 IANA 时区支持就迁移数据库区域。

官方参考：[Accessing Vercel-hosted sites from mainland China](https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china)。

## 6. 本次状态

| 项目 | 状态 |
|---|---|
| Migration 文件 | 已生成，未应用到生产 |
| Vercel Preview | 未创建 |
| Production 发布 | 未执行 |
| 正式域名 / DNS | 未修改 |
| ICP / 大陆部署 | 未执行 |
| 运营商与跨地区实测 | 未执行 |

## 7. 远端只读审计基线（2026-08-25）

- 生产项目当前有 4 条已应用 migration，最新为 `20260724093227_food_ingredient_category`；本次 `20260825075937_global_preferences` 尚未应用。
- `public.profiles` 当前有 2 行且已启用 RLS，但尚无本次新增的 9 个偏好列，所以上线前必须按第 2 节执行 migration。
- Security Advisor 的既有基线为 2 个 warning 和 1 个 info：`set_updated_at` 的 mutable `search_path`、未启用 leaked password protection，以及 `food_import_cache` 启用 RLS 但没有 policy。参考：[function search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)、[leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)、[RLS without policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)。
- Performance Advisor 的既有基线为 47 个 warning 和 5 个 info，主要来自逐行求值的 `auth.uid()`、重复 permissive policy、未使用索引和未覆盖的外键索引；这些问题早于本次 migration，不在本次时区与界面重构范围内。
- 本机 Docker daemon 未运行，因此没有执行本地 `supabase db reset`。不得拿生产库代替本地临时库做 DDL 试跑。
