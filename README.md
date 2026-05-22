# 健身营养计划网页程序

`Next.js + TypeScript + Supabase + Vercel` 饮食计划器。用户可维护在线食物库，展示 BMR/TDEE 参考，并按凯圣王碳循环每周总量分配公式编辑当天餐次，锁定已完成餐，实时预览推荐克重，并手动保存计划。

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

- [凯圣王碳循环公开整理](https://design.liyao.sbs/posts/tanxunhuan)
- [凯圣王碳循环上集 BV1Gh411479A](https://www.bilibili.com/video/BV1Gh411479A/)
- [凯圣王碳循环下集 BV1Di4y1o7KF](https://www.bilibili.com/video/BV1Di4y1o7KF/)
- [Mifflin-St Jeor 公式来源](https://www.ncbi.nlm.nih.gov/books/NBK278991/table/diet-treatment-obes.table12est/)
- [Supabase Pricing](https://supabase.com/pricing)
- [Vercel Pricing](https://vercel.com/pricing)
