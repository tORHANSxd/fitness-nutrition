# NutriTrain 发布手册

应用由 GitHub 的 `main` 分支发布到 Vercel，数据存于 Supabase。应用部署与数据库迁移分别执行；没有数据库变更时，无需新增迁移或改写用户数据。

## 发布前验证

```bash
npm ci
npm run db:verify-migrations
npm run verify
```

数据库结构或权限有变化时，在本地 Docker/Supabase 环境运行 `npm run db:start` 和 `npm run verify:db`，再在隔离项目验证。浏览器 fixture 和 PGlite 用例的覆盖范围见 [测试矩阵](test-matrix.md)。

确认目标仓库、分支、Supabase project ref、Vercel project 和环境变量。管理员凭据、备份、审计结果及现场记录放在仓库外；公共文档只保留可重复执行的操作说明。

## Supabase 迁移

`supabase/migrations/` 是结构变更的唯一真源，`schema.sql` 和 `schema.nutrition-v5.sql` 是审阅快照。新增迁移按时间排序，已发布迁移不改写。

先在隔离项目验证迁移、双用户 RLS、草稿 revision 冲突，以及每日完成记录和食物导入 RPC 的事务行为。涉及数据变更时确认备份和恢复方式，由一名负责人执行：

```bash
npx supabase link --project-ref <project-ref>
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

新增结构应兼容当前线上客户端；需要新结构的客户端随后发布。禁止对生产运行 `db reset --linked`、使用 `--include-seed` 或篡改迁移历史伪造回滚。恢复步骤见 [数据库回滚说明](database/rollback.md)。

## 数据审计与回填

管理员终端通过服务端环境变量 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 连接目标项目。服务端密钥不得进入 `NEXT_PUBLIC_*`、浏览器或 Git。

```bash
npm run db:audit -- --output <仓库外审计文件的绝对路径>
npm run db:backfill:drafts
npm run db:backfill:food-snapshots
npm run db:migrate:checkins-v2
```

审计只读；回填默认 dry-run。核对未知 schema、跨用户引用、未解析食物及待变更数量。需要实际回填时，为每次执行指定新的仓库外备份文件：

```bash
npm run db:backfill:drafts -- --apply --backup <仓库外备份文件的绝对路径>
npm run db:backfill:food-snapshots -- --apply --backup <仓库外备份文件的绝对路径>
npm run db:migrate:checkins-v2 -- --apply --backup <仓库外备份文件的绝对路径>
```

完成后复跑审计与 dry-run，核对行数和剩余变更。备份包含用户数据，应按自身保管策略加密保存。

## GitHub 与 Vercel

1. 检查本次 diff 和实际暂存文件，确认没有凭据、本机配置、导出或测试产物。
2. 提交并推送经过验证的代码。当前 Git 集成监听 `main`。
3. 核对 Vercel 部署的提交 SHA、Production 环境和 `READY` 状态。
4. 打开正式域名，检查登录与受影响功能。涉及餐食复制时，验证来源预览、确认替换、撤销、保存和刷新，并确认目标日期与每日目标保持正确。
5. 有迁移时再核对 Supabase 线上版本；GitHub 推送或 Vercel 构建成功不表示数据库迁移已经执行。

Vercel 使用 Next.js 根目录配置，从 `src/` 构建。本地与生产构建均使用框架默认依赖和构建目录。`.vercelignore` 只允许应用源码、公开资源及构建配置进入 CLI 上传包。Supabase URL 和 publishable/anon key 在 Vercel 对应环境设置，认证回调地址与正式域名保持一致。
