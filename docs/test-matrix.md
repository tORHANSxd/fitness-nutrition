# 测试与截图矩阵

## 自动检查

| 检查 | 命令 | 当前覆盖 |
|---|---|---|
| 静态检查 | `npm run lint` | TypeScript/React/Next ESLint 规则 |
| 类型检查 | `npx tsc --noEmit` | 应用、运行时 JSON parser 与管理员脚本 |
| 单元与组件 | `npm run test` | 营养、训练、存储、日期时区、偏好转换、关键组件 |
| Migration 重建 | `npm run verify:db` | 迁移哈希、空库 reset、DB lint、双用户 RLS 与事务 RPC |
| 生产构建 | `npm run build` | App Router、proxy、SSR/CSR 边界 |
| 浏览器 E2E | `npm run test:e2e` | 未配置云端认证门禁、深链、移动/平板/桌面、axe |

完整认证业务流程需要隔离的 Supabase 测试项目和专用账号，禁止对生产用户数据执行自动化写入。待测试环境可用后补跑：计划创建/恢复、添加食物、训练逐组保存、日历跳转、体测趋势、导入导出、模板删除确认、偏好切换与跨午夜业务日期。

## 视口

仓库自动和人工验收至少覆盖：

| 类别 | 视口 | 截图目录 |
|---|---:|---|
| 移动 | 360 x 800 | `artifacts/baseline/mobile.png`、`artifacts/final/mobile.png` |
| 平板 | 768 x 1024 | `artifacts/baseline/tablet.png`、`artifacts/final/tablet.png` |
| 桌面 | 1440 x 900 | `artifacts/baseline/desktop.png`、`artifacts/final/desktop.png` |

补充人工矩阵：390 x 844、430 x 932、1024 x 768、1280 x 800、1920 x 1080；浏览器缩放 200% 和 400%；light、dark、system、forced-colors、reduced-motion。

## 日期与时区

- UTC-11、UTC+8、UTC+14 同一 Instant 的日期边界。
- America/New_York DST 春季与秋季边界。
- 跨月、跨年、闰日、周一/周日/周六起始日。
- 历史 `plan_date`、`session_date`、`body_logs.plan_date` 切换时区后不漂移。
- URL 中非法 `date` 参数回退到用户时区的今天。

## 无障碍

- 页面允许浏览器缩放，关键操作高度至少 44 CSS px。
- 图标按钮有 accessible name；状态使用 `role=status` / `aria-live`。
- More sheet 与食物选择 dialog 支持初始焦点、Tab 圈闭、Escape 和焦点恢复。
- 图表同时提供文本数据表，不以颜色作为唯一信息通道。
- axe 的 serious / critical violation 作为 E2E 失败条件。

## 当前限制

未配置 Supabase 测试凭据时，浏览器自动化只能验证公开认证门禁和深链重定向。生产 migration、Preview URL、正式域名、真实运营商网络、VoiceOver/TalkBack 需要发布负责人在对应环境人工验收。
