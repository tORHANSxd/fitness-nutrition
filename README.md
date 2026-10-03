# NutriTrain

把每日营养目标落到每餐食物和克重，再记录实际饮食、训练与体测变化。

[打开应用](https://nutritrain.vercel.app) · [发布手册](docs/deployment.md) · [测试矩阵](docs/test-matrix.md)

项目使用 Next.js 16 App Router、React 19、TypeScript 和 Supabase，部署于 Vercel。Supabase 提供 Cookie SSR 认证和数据库；日期按用户选择的 IANA 时区计算。

## 功能与入口

| 页面 | 路径 | 可以做什么 |
| --- | --- | --- |
| 今日饮食 | `/today` | 查看目标、安排餐食、修改当前克重、预览推荐分量、复制其他日期 |
| 每日记录 | `/records` | 记录实际摄入和训练，与餐食计划分别保存 |
| 趋势 | `/progress` | 查看历史记录和体测变化 |
| 食物库 | `/resources` | 管理食物、个人食物及餐食模板 |
| 饮食目标 | `/goals` | 设置目标，预览并确认生效版本 |
| 日历 | `/calendar` | 查看和安排不同日期的饮食、训练 |
| 偏好设置 | `/settings` | 设置时区、单位、主题、周起始日及时间显示格式 |

`/overview` 会重定向到 `/today`；训练记录也可通过 `/training` 进入。

餐食支持自定义餐数、餐名、营养分配和跨午夜餐时。食物支持快照、临时自定义营养值、可食部换算、克重上下限及锁定。锁定用于保留推荐过程中的分量，术语说明见 [营养术语](docs/domain/nutrition-terminology.md)。

### 复制其他日期的餐食

1. 打开**目标日期**的「今日饮食」，在「餐食安排」点击「复制其他日期」。
2. 选择来源日期，点击「预览」。来源必须有通过「保存计划」保存的每日计划；只有自动草稿或实际摄入记录时，不会作为来源。
3. 核对餐食后点击「确认替换餐食」。确认前不会修改当前餐食。
4. 确认后可撤销；点击「保存计划」将餐食保存到目标日期，刷新后可继续使用。

复制保留食物克重、快照、可食部设置、锁定和餐时，生成独立的餐次与条目 ID。旧计划的比例会转换为可用的宏量份额，每餐目标按**目标日期的每日目标**计算。来源计划、目标日期的执行协议和实际记录不会被复制操作改写。

草稿仍在载入、存在版本冲突或数字输入无效时，替换会被拒绝并显示原因。关闭弹窗、切换目标日期或账号后，尚未完成的旧读取不会再应用到当前页面。

## 本地运行

需要 Node.js 22.12+（22.x）或 Node.js 24+、npm，以及已初始化的 Supabase 项目。运行本地 Supabase 集成测试还需要 Docker 和 Supabase CLI。

```bash
git clone https://github.com/tORHANSxd/fitness-nutrition.git
cd fitness-nutrition
npm ci
```

将 [`.env.example`](.env.example) 复制到仓库外的 `../fitness-nutrition.local/config/.env.local`（先创建 `config` 目录），填写项目的公开连接信息：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
NEXT_PUBLIC_ENABLE_SIGNUP=false
```

```bash
node --env-file=../fitness-nutrition.local/config/.env.local node_modules/next/dist/bin/next dev
```

已在终端设置环境变量时，也可直接运行 `npm run dev`。

打开 [localhost:3000](http://localhost:3000)，使用该 Supabase 项目的账号登录。注册入口默认关闭；如需开放，须同时开启 Supabase 公开注册、将 `NEXT_PUBLIC_ENABLE_SIGNUP` 设为 `true` 并重新构建。未配置 Supabase 时，页面显示配置提示。

浏览器只使用 publishable/anon key，数据访问由 RLS 限制到当前账号。`service_role` key 只能用于受控管理员操作，禁止写入 `NEXT_PUBLIC_*`、浏览器或 Git。

## 数据与迁移

| 数据 | 保存方式 |
| --- | --- |
| 正在编辑的餐食 | 自动保存到 `planner_drafts`，使用 revision 检查并发冲突 |
| 某日计划 | 点击「保存计划」写入 `daily_plans`，保留该日目标快照 |
| 实际饮食和训练 | 独立记录，不由复制计划自动完成 |
| 食物及模板 | 存于 Supabase；历史食物保留快照用于解析 |

计划和记录以 Supabase 为真源，不把 `localStorage` 当作离线保存兜底。常用食物等界面快捷设置可按账号保存在本地。旧计划读取保留兼容；未知版本或无效快照会明确报错。

[`supabase/migrations`](supabase/migrations) 是数据库结构的唯一迁移真源，包含历史基线、草稿与权限保护、执行协议、营养目标、食物分类和教程偏好等迁移。[`supabase/schema.sql`](supabase/schema.sql) 是审阅快照，不替代迁移序列。

## 验证

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:e2e:tre
```

`npm run verify` 顺序执行以上 lint、类型检查、Vitest、构建及两套浏览器测试。浏览器安装只需在首次使用或 Playwright 版本更新后执行。

| 命令 | 验证范围 |
| --- | --- |
| `npm run test` | 计算、组件、存储契约及 PGlite 数据库用例 |
| `npm run test:e2e` | 基础路由和登录门禁 |
| `npm run test:e2e:tre` | 餐食、目标、协议、复制与保存刷新；使用本机合成 Supabase fixture |
| `npm run test:e2e:tutorial` | 教程交互，需另行运行 |
| `npm run test:e2e:food` | 食物库浏览器测试，需另行运行 |
| `npm run db:verify-migrations` | 核对受保护的历史迁移校验和，不代表数据库已重建 |
| `npm run verify:db` | 本地迁移重建、数据库 lint 和真实 Supabase 集成测试 |

基础浏览器测试默认使用 `127.0.0.1:3200`，可通过 `PLAYWRIGHT_BASE_URL` 指向已有实例。TRE 测试使用应用端口 `3300` 和合成 fixture 端口 `45432`，不会连接生产账号。PGlite 和 HTTP fixture 测试不能替代真实 Supabase Auth、PostgREST、RLS 的集成验证。

本地数据库验证会重建**本机**测试数据库：

```bash
npm run db:start
npm run verify:db
```

复制功能的回归入口是 [`tests/unit/copyMeals.test.tsx`](tests/unit/copyMeals.test.tsx)、[`tests/unit/usePlanner.test.tsx`](tests/unit/usePlanner.test.tsx) 和 [`tests/e2e/custom-meals.spec.ts`](tests/e2e/custom-meals.spec.ts)。

## 发布到 GitHub、Vercel 与 Supabase

当前 Vercel 项目通过 Git 集成部署 `main`。GitHub 推送和 Vercel 部署成功是两个不同状态，发布后应核对部署的提交 SHA、`READY` 状态及正式域名。

1. 完成相关测试和生产构建，检查差异及环境变量。
2. 如果有数据库变更，先在隔离环境验证，再核对备份、目标项目和发布窗口，由一名负责人执行迁移。
3. 推送经过验证的提交到 GitHub，等待 Vercel 完成部署；没有数据库变更的客户端修复无需新增迁移。
4. 在正式应用核对受影响流程，并确认 Supabase 迁移版本与客户端一致。

远程数据库迁移须单独执行；Vercel 构建不会自动推送 Supabase 迁移：

```bash
npx supabase link --project-ref <project-ref>
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

禁止对生产执行 `supabase db reset --linked` 或使用 `--include-seed`。管理员数据审计和回填默认 dry-run；`--apply` 要求 `--backup` 指向 Git 工作区外的绝对路径。具体恢复步骤见 [数据库回滚说明](docs/database/rollback.md)。

## 目录与本地文件

| 目录 | 内容 |
| --- | --- |
| `src/app/`、`src/proxy.ts` | 页面路由、登录与服务端入口 |
| `src/components/`、`src/hooks/` | 页面组件、工作区和编辑状态 |
| `src/lib/`、`src/messages/` | 计算、存储、内置数据与翻译 |
| `public/` | 浏览器静态资源与公开食物数据 |
| `supabase/` | 数据库迁移、结构快照和本地数据库配置 |
| `tests/unit/`、`tests/database/` | 单元、组件与 PGlite 测试 |
| `tests/integration/`、`tests/e2e/` | 真实 Supabase 集成和浏览器测试 |
| `tests/fixtures/`、`tests/config/` | 合成数据、HTTP fixture 和测试配置 |
| `scripts/database/`、`scripts/data/` | 数据库维护与公开数据生成 |
| `scripts/runtime/` | 测试产物与审计文件的外部路径 |
| `docs/` | 发布、测试、领域术语、数据库设计与资料审计 |

根目录保留 npm、Next.js、TypeScript、Tailwind、PostCSS、ESLint 和 Git 需要的入口配置。`@/` 指向 `src/`。

`node_modules/`、`.next/`、`.gitnexus/` 等运行时目录允许留在项目内，由 `.gitignore` 排除，不提交到 GitHub。TypeScript 增量缓存放在 `node_modules/.cache/typescript/`。`.vercelignore` 进一步限制 Vercel CLI 上传内容。

本机资料、环境文件、截图、报告及运维记录放在 Git 工作目录外。默认位置是同级 `<仓库目录名>.local/`：

```text
fitness-nutrition.local/
├── artifacts/      # Playwright 报告、截图与数据库测试证据
├── cache/          # Vitest 等测试缓存
├── config/         # 本机环境文件
├── tooling/        # 本机工具资料
└── project-notes/  # 历史任务与运维记录
```

测试产物目录可通过绝对路径环境变量 `NUTRITRAIN_RUNTIME_DIR` 更换，但必须位于仓库外。迁出的历史资料保留在本机，当前操作以本 README 和 `docs/` 为准。Git 自身的 `.git/` 元数据仍在原位，不是上传内容。

## 资料与许可

- 《训练与营养计划》v2（2026-07-10，用户提供）
- [Supabase Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Vercel: Accessing Vercel-hosted sites from mainland China](https://vercel.com/kb/guide/accessing-vercel-hosted-sites-from-mainland-china)

本项目采用 [MIT 许可证](LICENSE)。
