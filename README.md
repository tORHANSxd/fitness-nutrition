# NutriTrain — 健身营养计划网页程序

`Next.js + TypeScript + Supabase + Vercel` 训练与营养计划器。默认方针为 **v2 计划（2026-07-10《训练与营养计划》）**：每日固定目标 2300 kcal / 蛋白 175–195g / 脂肪 60–65g / 碳水吃掉剩余热量（约 235–260g），无碳循环，训练为周一~周五 PPL+UL 五分化（周六日休息）。用户可维护在线食物库，展示 BMR/TDEE 与赤字参考，编辑当天餐次，锁定已完成餐，实时预览推荐克重，并手动保存计划。

## 本地运行

```powershell
npm install
npm run dev
```

打开 `http://localhost:3000`。

## Supabase 配置

1. 在 Supabase 创建项目。
2. 执行 `supabase/schema.sql`。
3. 复制 `.env.example` 为 `.env.local`，填写：

```powershell
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

未配置 Supabase 时，应用使用浏览器本地演示数据；配置后使用邮箱密码登录并保存到在线数据库。

## 验证

```powershell
npm run lint
npm run test
npm run build
```

## 资料来源

- 《训练与营养计划》v2（2026-07-10，用户自备最新证据版；训练/营养目标与校准规则均以该文档为准）
- [Mifflin-St Jeor 公式来源](https://www.ncbi.nlm.nih.gov/books/NBK278991/table/diet-treatment-obes.table12est/)
- [Supabase Pricing](https://supabase.com/pricing)
- [Vercel Pricing](https://vercel.com/pricing)
