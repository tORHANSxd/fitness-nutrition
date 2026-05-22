# Progress

- 2026-05-22 17:08:00 修复每餐热量和三大营养素目标显示异常：展示用餐次目标与求解器内部迭代目标分离，避免全天推荐贴合过程把每餐目标扭曲到两三百克碳水或一两克蛋白。验证 npm run test、npm run lint、npm run build、npm audit --json 通过，浏览器复测默认 1.4g/kg 蛋白场景四餐目标合计等于日目标且控制台 error=0。
- 2026-05-22 16:55:00 优化当日营养盈亏显示和推荐贴合：首屏新增热量、碳水、蛋白、脂肪的当前/推荐后全天盈亏柱状图；求解先按餐次计算，再把推荐总量与日目标差额重新分配到可调整餐次。验证 npm run test、npm run lint、npm run build、npm audit --json 通过，浏览器首屏显示四项盈亏柱状图且控制台 error=0。
- 2026-05-22 14:15:00 优化热量目标逻辑：维持热量与目标热量分离，新增目标类型和每周体重变化率；默认减脂按 0.5% 体重/周计算缺口，并增加实际缺口过大提醒。验证 npm run lint、npm run test、npm run build 通过，浏览器首屏新字段渲染正常且控制台 error=0。
- 2026-05-22 11:29:00 食物库支持网页端编辑公共食物和本人自定义食物：公共食物保存为当前用户覆盖值，可重置；本人食物可更新原记录。验证 npm run lint、npm run test、npm run build、npm audit --json 通过，浏览器公共食物编辑/重置控制台 error=0。
- 2026-05-22 11:10:00 复核 FatSecret.cn 直接条目后再次校准白米饭、鸡胸肉、杏仁的每 100g 数据；验证 npm run lint、npm run test、npm run build 通过，浏览器控制台 error=0。
- 2026-05-22 11:07:00 npm audit --json 通过：0 个漏洞。
- 2026-05-22 11:05:00 优化公共食物库和求解约束：按 FatSecret.cn 常见每 100g 条目校准主食/蔬菜/水果/肉类/坚果数据，新增分类默认克重、默认最大克重和份量软约束；验证 npm run lint、npm run test、npm run build 通过，桌面与 390px 移动浏览器控制台 error=0。

- 2026-05-22 09:37:47 Initialized Trellis Lite at D:\Workspace\Windows\fitness_page\.trellis-lite
- 2026-05-22 09:40:00 初始化 Git 仓库和本地远端 fitness_nutrition。
- 2026-05-22 09:45:00 写入 Next.js 项目骨架、Supabase schema、营养计算核心、食物库、计划编辑界面和测试。
- 2026-05-22 09:52:00 验证通过：npm run lint、npm run test、npm run build、npm audit。
- 2026-05-22 09:56:00 浏览器验证通过：桌面与 390px 移动视口渲染正常，食物库切换和应用推荐可操作，控制台错误 0。
- 2026-05-22 09:59:00 GitNexus analyze --force 完成，索引 299 symbols、567 relationships、24 flows。
- 2026-05-22 10:07:00 修复浏览器扩展注入 html 属性造成的 hydration mismatch 提示；验证 lint、test、build 和浏览器控制台 error=0。
- 2026-05-22 10:28:00 优先补齐三大营养素需求：每日显示目标/当前比例，每餐显示碳水、蛋白、脂肪目标、当前和盈亏；验证 lint、test、build 通过。
