# 蔬菜营养数据审计：可利用碳水口径

> 审计日期：2026-07-24  
> 审计对象：`lib/foods.ts` 中的内置食物库，重点为全部 5 个“蔬菜”条目  
> 数据单位：除特别注明外，均为每 100 g 可食部

## 结论摘要

1. 当前 5 个蔬菜条目的 `carbsPer100g` 均可解释为“可利用碳水（估算）＝总碳水（差减法）－总膳食纤维”，符合产品要求，不建议修改：
   - 西兰花 3.88 g
   - 菠菜 1.35 g
   - 生菜 1.57 g
   - 番茄 2.72 g
   - 黄瓜 3.13 g
2. 原“生菜”条目的脂肪、蛋白质和碳水组合实际对应 USDA 的 **绿叶生菜（green leaf lettuce）**，不是不分品种的普通生菜；本轮已将显示名改为“绿叶生菜”。
3. 原“黄瓜”条目对应 **带皮生黄瓜**；本轮已将显示名改为“黄瓜（带皮）”，避免与去皮条目混用。
4. 当前蔬菜 `kcalPer100g` 是把可利用碳水、蛋白质和脂肪按 4/4/9 重算后的值，不是 FatSecret／USDA 条目中的来源热量。若该字段语义是“来源标示热量”，现值不正常；若产品明确把它定义为“宏量营养素估算热量”，则内部计算一致，但应避免宣称是 USDA/FatSecret 原始热量。
5. 本次只核验仓库中的 32 个内置条目及其中全部 5 个蔬菜。Supabase 中用户自行添加或覆盖的在线食物记录不在仓库数据文件内，因此不属于本报告的逐项审计范围。

## 口径：总碳水、膳食纤维与可利用碳水

### 总碳水（差减法）

USDA FoodData Central 将 `Carbohydrate, by difference` 定义为 100 减去水、蛋白质、总脂肪、灰分和酒精，并明确指出这个值 **包含总膳食纤维**。因此不能把 USDA/FatSecret 页面中的 `Total Carbohydrate` 直接当作人体可消化吸收的碳水。[USDA Foundation Foods Documentation](https://fdc.nal.usda.gov/Foundation_Foods_Documentation/)

### 可利用／可消化碳水

FAO 将可利用碳水定义为可被人体酶消化、吸收并进入中间代谢的碳水部分；普通食物可以用下式做差减估算：[FAO, Methods of Food Analysis](https://www.fao.org/4/y5022e/y5022e03.htm)

```text
估算可利用碳水 = 总碳水（差减法）− 总膳食纤维
```

中国国家卫生健康委员会 2025 年发布的现行标准问答也明确：差减法先得到“总碳水化合物”；同时标示膳食纤维时，再减去膳食纤维即为“可利用碳水化合物”。[国家卫生健康委员会：《食品安全国家标准 预包装食品营养标签通则》（GB 28050-2025）问答](https://www.nhc.gov.cn/sps/c100087/202509/470fa4ff5de14dd38619223cce9da4e7.shtml)

本报告中的“净碳水”是面向产品的简写，严谨名称应为 **估算可利用碳水（available carbohydrate by difference）**。它不是人体试验直接测得的“实际吸收量”，仍会受到品种、成熟度、烹调失水、纤维检测方法及差减法累计误差影响。FAO 更偏好直接分析并加总各个可利用碳水组分；但对于本报告中的完整、未添加糖醇蔬菜，用“总碳水－膳食纤维”是合理、可追溯的实用估算。

## 当前条目与建议值

| 项目条目 | 形态／来源匹配 | 当前脂肪 | 当前蛋白质 | 当前 `carbsPer100g` | FatSecret 总碳水 / 纤维 / 推导净碳水 | USDA 总碳水 / 纤维 / 推导可利用碳水 | 建议 | 不确定性 |
|---|---|---:|---:|---:|---:|---:|---|---|
| 西兰花 `public-broccoli-cooked` | 熟；水煮、沥干、无盐／无油 | 0.41 | 2.38 | **3.88** | 7.14 / 3.30 / 3.84 | 7.18 / 3.30 / **3.88** | 保留 3.88；当前脂肪和蛋白质与 USDA FDC 169967 同一组数据完全对应 | 低；两来源净碳水仅差 0.04 g |
| 菠菜 `public-spinach-cooked` | 熟；水煮、沥干、无盐、无油 | 0.26 | 2.97 | **1.35** | 3.75 / 2.40 / **1.35** | 3.75 / 2.40 / **1.35** | 保留 1.35，并明确烹调状态 | 很低 |
| 绿叶生菜 `public-lettuce-raw` | 生；匹配绿叶生菜 | 0.15 | 1.36 | **1.57** | 2.79 / 1.30 / 1.49 | 2.87 / 1.30 / **1.57** | 保留 1.57；优先采用与现有脂肪、蛋白质同组的 USDA FDC 169249；显示名已改为“绿叶生菜” | 低 |
| 番茄 `public-tomato-raw` | 生；红色成熟番茄 | 0.20 | 0.88 | **2.72** | 3.92 / 1.20 / **2.72** | 3.89 / 1.20 / 2.69 | 保留 2.72，符合用户要求的 FatSecret 优先；与 USDA 仅差 0.03 g | 低 |
| 黄瓜（带皮） `public-cucumber-raw` | 生；带皮 | 0.11 | 0.65 | **3.13** | 3.63 / 0.50 / **3.13** | 3.63 / 0.50 / **3.13** | 保留 3.13；显示名已注明“带皮” | 很低 |

注：FatSecret 的“熟西兰花（烹饪中不加油）”泛型条目与 USDA 的“水煮、沥干、无盐”条目在总碳水上相差 0.04 g/100 g；项目当前的脂肪 0.41 g、蛋白质 2.38 g 与 USDA FDC 169967 一致，因此建议使用同一条目算出的 3.88 g，避免拼接不同来源的宏量营养素。

## 逐项来源与理由

### 1. 西兰花（熟）

- 项目：脂肪 0.41 g、蛋白质 2.38 g、可利用碳水 3.88 g。
- FatSecret 泛型熟西兰花：总碳水 7.14 g、膳食纤维 3.30 g，推导净碳水 3.84 g。[FatSecret：煮熟的西兰花（烹饪中不加油）](https://www.fatsecret.cn/%E7%83%AD%E9%87%8F%E8%90%A5%E5%85%BB/%E6%99%AE%E9%80%9A%E7%9A%84/%E7%85%AE%E7%86%9F%E7%9A%84%E8%A5%BF%E5%85%B0%E8%8A%B1%EF%BC%88%E7%83%B9%E9%A5%AA%E4%B8%AD%E4%B8%8D%E5%8A%A0%E6%B2%B9%EF%BC%89)
- USDA SR Legacy FDC 169967：总碳水 7.18 g、膳食纤维 3.30 g、脂肪 0.41 g、蛋白质 2.38 g，推导可利用碳水 3.88 g。[USDA FDC 169967](https://fdc.nal.usda.gov/food-details/169967/nutrients)
- FatSecret 也提供对应 USDA 条目，显示总碳水 7.18 g、膳食纤维 3.30 g。[FatSecret：Broccoli (Without Salt, Drained, Cooked, Boiled)](https://foods.fatsecret.com/calories-nutrition/usda/broccoli-%28without-salt-drained-cooked-boiled%29?frc=True&portionamount=100.000&portionid=59023)

**建议：** 保留 3.88 g。该值能保证脂肪、蛋白质、碳水来自同一 USDA 食物定义。

### 2. 菠菜（熟）

- 项目：脂肪 0.26 g、蛋白质 2.97 g、可利用碳水 1.35 g。
- FatSecret 与 USDA FDC 168463 均给出：总碳水 3.75 g、膳食纤维 2.40 g、脂肪 0.26 g、蛋白质 2.97 g，推导可利用碳水 1.35 g。[FatSecret：Spinach (Without Salt, Drained, Cooked, Boiled)](https://androidembeddedregional.fatsecret.com/calories-nutrition/usda/spinach-%28without-salt-drained-cooked-boiled%29%3Fportionid%3D59309%26portionamount%3D100.000)、[USDA FDC 168463](https://fdc.nal.usda.gov/food-details/168463/nutrients)

**建议：** 保留 1.35 g。需保持“水煮、沥干、无盐、无油”的食物定义；炒菠菜或加油菠菜不能套用本条目。

### 3. 生菜（生）

- 项目：脂肪 0.15 g、蛋白质 1.36 g、可利用碳水 1.57 g。这组值对应绿叶生菜，而不是泛称的所有生菜。
- FatSecret 绿叶生菜：总碳水 2.79 g、脂肪 0.15 g、蛋白质 1.36 g；其明细膳食纤维为 1.30 g，推导净碳水约 1.49 g。[FatSecret：Green Leaf Lettuce](https://foods.fatsecret.com/calories-nutrition/usda/green-leaf-lettuce)
- USDA SR Legacy FDC 169249：总碳水 2.87 g、膳食纤维 1.30 g、脂肪 0.15 g、蛋白质 1.36 g，推导可利用碳水 1.57 g。[USDA FDC 169249](https://fdc.nal.usda.gov/food-details/169249/nutrients)
- FatSecret 的不分品种“普通生菜”是另一条目，不能用来替换绿叶生菜资料。[FatSecret：普通生菜](https://foods.fatsecret.com/calories-nutrition/generic/lettuce-raw?portionamount=100.000&portionid=54930)

**建议：** 保留 1.57 g，并将名称明确为“绿叶生菜”。如果产品坚持让“生菜”泛指任意品种，就不应声称只有一个权威固定值，而应拆分绿叶、罗马、球生菜等条目。

### 4. 番茄（生）

- 项目：脂肪 0.20 g、蛋白质 0.88 g、可利用碳水 2.72 g。
- FatSecret 红番茄：总碳水 3.92 g、膳食纤维 1.20 g，推导净碳水 2.72 g。[FatSecret：Red Tomatoes](https://foods.fatsecret.com/calories-nutrition/usda/red-tomatoes?portionamount=100&portionid=59364)
- USDA SR Legacy FDC 170457：总碳水 3.89 g、膳食纤维 1.20 g，推导可利用碳水 2.69 g；脂肪与蛋白质仍为 0.20 g 和 0.88 g。[USDA FDC 170457](https://fdc.nal.usda.gov/food-details/170457/nutrients)

**建议：** 保留 2.72 g。它符合 FatSecret 优先的要求，且相对 USDA 只高 0.03 g/100 g，营养与求解结果上的影响可忽略。

### 5. 黄瓜（生）

- 项目：脂肪 0.11 g、蛋白质 0.65 g、可利用碳水 3.13 g。
- FatSecret 与 USDA FDC 168409 均给出带皮生黄瓜总碳水 3.63 g、膳食纤维 0.50 g，推导可利用碳水 3.13 g。[FatSecret：Cucumber (with Peel)](https://mobile.fatsecret.com/calories-nutrition/usda/cucumber-%28with-peel%29)、[USDA FDC 168409](https://fdc.nal.usda.gov/food-details/168409/nutrients)

**建议：** 保留 3.13 g，并注明“带皮”。FatSecret 的去皮黄瓜是单独条目，不能与本条混用。

## 热量字段审计

| 条目 | 当前 `kcalPer100g` | FatSecret / USDA 条目热量（约） | 当前值的计算结果 |
|---|---:|---:|---|
| 西兰花 | 28.7 | 35 | `3.88×4 + 2.38×4 + 0.41×9 = 28.73` |
| 菠菜 | 19.6 | 23 | `1.35×4 + 2.97×4 + 0.26×9 = 19.62` |
| 绿叶生菜 | 13.1 | 15 | `1.57×4 + 1.36×4 + 0.15×9 = 13.07` |
| 番茄 | 16.2 | 18 | `2.72×4 + 0.88×4 + 0.20×9 = 16.20` |
| 黄瓜（带皮） | 16.1 | 15 | `3.13×4 + 0.65×4 + 0.11×9 = 16.11` |

USDA 说明食物能量表示代谢可利用能，并可能使用食物特异 Atwater 因子；不能要求它必须等于页面中三个宏量营养素经四舍五入后机械代入 4/4/9 的结果。[USDA Foundation Foods Documentation](https://fdc.nal.usda.gov/Foundation_Foods_Documentation/) 中国 GB 28050-2025 问答还为单独参与能量计算的膳食纤维规定了 8 kJ/g 折算系数，因此把纤维从碳水中扣除后直接当作 0 能量，也不等同于标准营养标签能量算法。[国家卫生健康委员会：GB 28050-2025 问答](https://www.nhc.gov.cn/sps/c100087/202509/470fa4ff5de14dd38619223cce9da4e7.shtml)

因此应先确定字段语义：

- 若 `kcalPer100g` 表示 **来源营养数据**，建议分别改为约 35 / 23 / 15 / 18 / 15 kcal，并保留本报告建议的可利用碳水值。
- 若 `kcalPer100g` 表示产品内部的 **宏量营养素估算热量**，当前 28.7 / 19.6 / 13.1 / 16.2 / 16.1 在数学上自洽，但必须明确其不是 FatSecret/USDA 的原始热量。
- 当前应用代码会从碳水、蛋白质、脂肪重新计算展示与存储热量；因此只修改静态 `kcalPer100g` 而不统一字段语义，无法真正解决来源热量与估算热量并存的问题。

## 实施结果与后续建议

1. 保留五个蔬菜的 `carbsPer100g`：`3.88 / 1.35 / 1.57 / 2.72 / 3.13`。
2. 已把“生菜”明确为“绿叶生菜”，把“黄瓜”明确为“黄瓜（带皮）”；后续可视 UI 空间为菠菜、西兰花补充更细的熟制方式。
3. 在类型、界面说明或数据文档中把 `carbsPer100g` 明确写为“估算可利用碳水”，不要与 FatSecret 页面上的 `Total Carbohydrate` 混称。
4. 若未来需要同时展示营养标签与求解器口径，建议分别保存 `totalCarbsPer100g`、`fiberPer100g`、`availableCarbsPer100g`，不要让一个 `carbsPer100g` 字段同时承担三种含义。
5. 单独决定 `kcalPer100g` 是来源热量还是求解器估算热量，并在应用内保持一致；不要因把碳水改成净碳水，就默认同步下调权威来源热量。

## 来源清单

- [USDA FoodData Central：数据下载（本报告用 SR Legacy 2018 CSV 复核 FDC ID 与数值）](https://fdc.nal.usda.gov/download-datasets/)
- [USDA Foundation Foods Documentation：碳水差减法与能量口径](https://fdc.nal.usda.gov/Foundation_Foods_Documentation/)
- [FAO：Methods of Food Analysis——总碳水与可利用碳水](https://www.fao.org/4/y5022e/y5022e03.htm)
- [国家卫生健康委员会：《食品安全国家标准 预包装食品营养标签通则》（GB 28050-2025）问答](https://www.nhc.gov.cn/sps/c100087/202509/470fa4ff5de14dd38619223cce9da4e7.shtml)
- 各食物的 FatSecret 与 USDA 直达链接见上文逐项条目。
