import { foodCategories, type CustomFoodDraft, type FoodItem, type MealPlan } from "@/lib/types";
import { foodFromSnapshot, parseFoodSnapshot } from "@/lib/foodSnapshots";
import { chinaCompositionFoods } from "@/lib/chinaFoodComposition";

// 分类排序权重：按 foodCategories 声明顺序。
const categoryOrder = new Map<string, number>(foodCategories.map((category, index) => [category, index]));

/**
 * 全站统一的食物排序：先按分类（foodCategories 顺序），同类内再按食物名称拼音升序。
 * 名称用 zh-CN 本地化比较（按拼音，而非 Unicode 码点）。未知分类排到最后。
 */
export function compareFoodsByCategoryThenName(
  a: Pick<FoodItem, "category" | "name">,
  b: Pick<FoodItem, "category" | "name">
): number {
  const categoryDiff =
    (categoryOrder.get(a.category) ?? foodCategories.length) - (categoryOrder.get(b.category) ?? foodCategories.length);
  if (categoryDiff !== 0) {
    return categoryDiff;
  }
  return a.name.localeCompare(b.name, "zh-CN", { numeric: true });
}

/** 返回按「分类→拼音名」排好序的新数组（不改动入参）。 */
export function sortFoods<T extends Pick<FoodItem, "category" | "name">>(foods: T[]): T[] {
  return [...foods].sort(compareFoodsByCategoryThenName);
}

// ---------------------------------------------------------------------------
// 临时自定义食物：只存在于分餐条目内嵌的 customFood 里（随计划/草稿 jsonb 落库），
// 不写入食物库。热量一律由三大营养素按 4/4/9 推导。
// ---------------------------------------------------------------------------

function customFoodKcal(draft: Pick<CustomFoodDraft, "carbsPer100g" | "proteinPer100g" | "fatPer100g">) {
  return draft.carbsPer100g * 4 + draft.proteinPer100g * 4 + draft.fatPer100g * 9;
}

/** 把自定义营养定义物化为 FoodItem（id 前缀 custom-，仅在当前计划内有效）。 */
export function createCustomFood(draft: CustomFoodDraft, id?: string): FoodItem {
  return {
    id: id ?? `custom-${crypto.randomUUID()}`,
    name: draft.name.trim() || "自定义食物",
    category: draft.category,
    kcalPer100g: customFoodKcal(draft),
    carbsPer100g: draft.carbsPer100g,
    proteinPer100g: draft.proteinPer100g,
    fatPer100g: draft.fatPer100g,
    weightBasis: "none",
    cookedRawRatio: null,
    source: "user"
  };
}

/** 提取整份计划里内嵌的全部自定义食物，供求解器/总量计算与常规食物同链使用。 */
export function customFoodsFromMeals(meals: MealPlan[]): FoodItem[] {
  const byId = new Map<string, FoodItem>();
  for (const meal of meals) {
    for (const entry of meal.entries) {
      if (entry.customFood && !byId.has(entry.foodId)) {
        byId.set(entry.foodId, createCustomFood(entry.customFood, entry.foodId));
      } else if (!byId.has(entry.foodId)) {
        const snapshot = parseFoodSnapshot(entry.foodSnapshot);
        if (snapshot) byId.set(entry.foodId, foodFromSnapshot(entry.foodId, snapshot));
      }
    }
  }
  return Array.from(byId.values());
}

// carbsPer100g 记录净碳水/可利用碳水；蔬菜不把不可供能的碳水组分计入三大营养素。
export const builtinFoods: FoodItem[] = [
  {
    id: "public-rice-cooked",
    name: "白米饭",
    category: "主食",
    kcalPer100g: 130,
    fatPer100g: 0.28,
    carbsPer100g: 27.77,
    proteinPer100g: 2.69,
    weightBasis: "cooked",
    cookedRawRatio: 2.5,
    source: "public",
    sourceKcalPer100g: 130, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 28.17, fiberPer100g: 0.4,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 168878（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。白米长粒米饭，熟重；熟生比2.5仅为估算。https://fdc.nal.usda.gov/portal-data/external/168878"
  },
  {
    id: "public-brown-rice-cooked",
    name: "糙米饭",
    category: "主食",
    kcalPer100g: 123,
    fatPer100g: 0.97,
    carbsPer100g: 23.98,
    proteinPer100g: 2.74,
    weightBasis: "cooked",
    cookedRawRatio: 2.5,
    source: "public",
    sourceKcalPer100g: 123, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 25.58, fiberPer100g: 1.6,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 169704（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。长粒糙米饭，熟重；熟生比2.5仅为估算。https://fdc.nal.usda.gov/portal-data/external/169704"
  },
  {
    id: "public-oats-raw",
    name: "燕麦片",
    category: "主食",
    kcalPer100g: 389,
    fatPer100g: 6.9,
    carbsPer100g: 55.67,
    proteinPer100g: 16.89,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 389, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 66.27, fiberPer100g: 10.6,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 169705（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。普通干燕麦；按干品重，不适用于加糖即食麦片。https://fdc.nal.usda.gov/portal-data/external/169705"
  },
  {
    id: "public-sweet-potato-cooked",
    name: "红薯",
    category: "主食",
    kcalPer100g: 76,
    fatPer100g: 0.14,
    carbsPer100g: 15.22,
    proteinPer100g: 1.37,
    weightBasis: "cooked",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 76, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 17.72, fiberPer100g: 2.5,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 168484（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。去皮水煮红薯，熟重。https://fdc.nal.usda.gov/portal-data/external/168484"
  },
  {
    id: "public-potato-cooked",
    name: "土豆",
    category: "主食",
    kcalPer100g: 87,
    fatPer100g: 0.1,
    carbsPer100g: 18.33,
    proteinPer100g: 1.87,
    weightBasis: "cooked",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 87, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 20.13, fiberPer100g: 1.8,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 170438（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。带皮煮熟、只取薯肉，无盐，熟重。https://fdc.nal.usda.gov/portal-data/external/170438"
  },
  {
    id: "public-noodle-cooked",
    name: "鸡蛋面条（熟）",
    category: "主食",
    kcalPer100g: 138,
    fatPer100g: 2.07,
    carbsPer100g: 23.96,
    proteinPer100g: 4.54,
    weightBasis: "cooked",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 138, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 25.16, fiberPer100g: 1.2,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 168919（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。熟鸡蛋面、强化营养、加盐；不是通用普通面条。https://fdc.nal.usda.gov/portal-data/external/168919"
  },
  {
    id: "public-broccoli-cooked",
    name: "西兰花",
    category: "蔬菜",
    kcalPer100g: 35,
    fatPer100g: 0.41,
    carbsPer100g: 3.88,
    proteinPer100g: 2.38,
    weightBasis: "cooked",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 35, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 7.18, fiberPer100g: 3.3,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 169967（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。水煮西兰花、沥干、无盐，熟重。https://fdc.nal.usda.gov/portal-data/external/169967"
  },
  {
    id: "public-spinach-cooked",
    name: "菠菜",
    category: "蔬菜",
    kcalPer100g: 23,
    fatPer100g: 0.26,
    carbsPer100g: 1.35,
    proteinPer100g: 2.97,
    weightBasis: "cooked",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 23, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 3.75, fiberPer100g: 2.4,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 168463（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。水煮菠菜、沥干、无盐，熟重。https://fdc.nal.usda.gov/portal-data/external/168463"
  },
  {
    id: "public-lettuce-raw",
    name: "绿叶生菜",
    category: "蔬菜",
    kcalPer100g: 15,
    fatPer100g: 0.15,
    carbsPer100g: 1.57,
    proteinPer100g: 1.36,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 15, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 2.87, fiberPer100g: 1.3,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 169249（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。生绿叶生菜，可食部。https://fdc.nal.usda.gov/portal-data/external/169249"
  },
  {
    id: "public-tomato-raw",
    name: "番茄",
    category: "蔬菜",
    kcalPer100g: 18,
    fatPer100g: 0.2,
    carbsPer100g: 2.69,
    proteinPer100g: 0.88,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 18, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 3.89, fiberPer100g: 1.2,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 170457（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。成熟红番茄，生重。https://fdc.nal.usda.gov/portal-data/external/170457"
  },
  {
    id: "public-cucumber-raw",
    name: "黄瓜（带皮）",
    category: "蔬菜",
    kcalPer100g: 15,
    fatPer100g: 0.11,
    carbsPer100g: 3.13,
    proteinPer100g: 0.65,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 15, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 3.63, fiberPer100g: 0.5,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 168409（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。带皮黄瓜，生重。https://fdc.nal.usda.gov/portal-data/external/168409"
  },
  {
    id: "public-banana-raw",
    name: "香蕉",
    category: "水果",
    kcalPer100g: 89,
    fatPer100g: 0.33,
    carbsPer100g: 20.24,
    proteinPer100g: 1.09,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 89, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 22.84, fiberPer100g: 2.6,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 173944（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。生香蕉，可食果肉重。https://fdc.nal.usda.gov/portal-data/external/173944"
  },
  {
    id: "public-apple-raw",
    name: "苹果",
    category: "水果",
    kcalPer100g: 52,
    fatPer100g: 0.17,
    carbsPer100g: 11.41,
    proteinPer100g: 0.26,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 52, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 13.81, fiberPer100g: 2.4,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 171688（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。带皮生苹果，去果核可食部。https://fdc.nal.usda.gov/portal-data/external/171688"
  },
  {
    id: "public-orange-raw",
    name: "橙子",
    category: "水果",
    kcalPer100g: 47,
    fatPer100g: 0.12,
    carbsPer100g: 9.35,
    proteinPer100g: 0.94,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 47, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 11.75, fiberPer100g: 2.4,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 169097（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。生橙，可食果肉重。https://fdc.nal.usda.gov/portal-data/external/169097"
  },
  {
    id: "public-blueberry-raw",
    name: "蓝莓",
    category: "水果",
    kcalPer100g: 57,
    fatPer100g: 0.33,
    carbsPer100g: 12.09,
    proteinPer100g: 0.74,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 57, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 14.49, fiberPer100g: 2.4,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 171711（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。生蓝莓，可食部。https://fdc.nal.usda.gov/portal-data/external/171711"
  },
  {
    id: "public-kiwi-raw",
    name: "猕猴桃",
    category: "水果",
    kcalPer100g: 61,
    fatPer100g: 0.52,
    carbsPer100g: 11.66,
    proteinPer100g: 1.14,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 61, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 14.66, fiberPer100g: 3,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 168153（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。绿心猕猴桃，生的可食果肉。https://fdc.nal.usda.gov/portal-data/external/168153"
  },
  {
    id: "public-chicken-breast-cooked",
    name: "鸡胸肉",
    category: "肉类",
    kcalPer100g: 165,
    fatPer100g: 3.57,
    carbsPer100g: 0,
    proteinPer100g: 31.02,
    weightBasis: "cooked",
    cookedRawRatio: 0.75,
    source: "public",
    sourceKcalPer100g: 165, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 0, fiberPer100g: 0,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 171477（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。去皮鸡胸肉、烤熟，可食熟肉；熟生比0.75仅为估算，可用实测值覆盖。https://fdc.nal.usda.gov/portal-data/external/171477"
  },
  {
    id: "public-lean-beef-cooked",
    name: "牛肉饼（90%瘦，烤熟）",
    category: "肉类",
    kcalPer100g: 217,
    fatPer100g: 11.75,
    carbsPer100g: 0,
    proteinPer100g: 26.11,
    weightBasis: "cooked",
    cookedRawRatio: 0.73,
    source: "public",
    sourceKcalPer100g: 217, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 0, fiberPer100g: 0,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 174031（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。90%瘦绞牛肉饼、烤熟；对应USDA出成率约0.73，不代表所有牛肉部位。https://fdc.nal.usda.gov/portal-data/external/174031"
  },
  {
    id: "public-salmon-cooked",
    name: "三文鱼",
    category: "肉类",
    kcalPer100g: 206,
    fatPer100g: 12.35,
    carbsPer100g: 0,
    proteinPer100g: 22.1,
    weightBasis: "cooked",
    cookedRawRatio: 0.8,
    source: "public",
    sourceKcalPer100g: 206, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 0, fiberPer100g: 0,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 175168（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。养殖大西洋三文鱼、干热熟制；熟生比0.8仅为估算。https://fdc.nal.usda.gov/portal-data/external/175168"
  },
  {
    id: "public-egg-whole",
    name: "鸡蛋",
    category: "肉类",
    kcalPer100g: 143,
    fatPer100g: 9.51,
    carbsPer100g: 0.72,
    proteinPer100g: 12.56,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 143, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 0.72, fiberPer100g: 0,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 171287（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。生全蛋，去壳可食部。https://fdc.nal.usda.gov/portal-data/external/171287"
  },
  {
    id: "public-shrimp-cooked",
    name: "虾仁",
    category: "肉类",
    kcalPer100g: 99,
    fatPer100g: 0.28,
    carbsPer100g: 0.2,
    proteinPer100g: 23.98,
    weightBasis: "cooked",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 99, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 0.2, fiberPer100g: null,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 175180（2026-10-15核对），熟虾仁，每100g可食部。营养素及能量采用来源值；未提供纤维，保留未知，不扣减碳水。https://fdc.nal.usda.gov/portal-data/external/175180"
  },
  {
    id: "public-whey",
    name: "乳清蛋白粉",
    category: "补剂",
    kcalPer100g: 390,
    fatPer100g: 6,
    carbsPer100g: 8,
    proteinPer100g: 76,
    weightBasis: "none",
    cookedRawRatio: null,
    source: "public",
    servingDescription: "乳清蛋白粉示例配方；按干粉重，以实际产品标签为准。"
  },
  {
    id: "public-creatine",
    name: "肌酸",
    category: "补剂",
    kcalPer100g: 0,
    fatPer100g: 0,
    carbsPer100g: 0,
    proteinPer100g: 0,
    weightBasis: "none",
    cookedRawRatio: null,
    source: "public",
    servingDescription: "仅适用于无糖、无其他营养辅料的纯肌酸；按粉重，以实际包装为准。"
  },
  {
    id: "public-casein",
    name: "酪蛋白粉",
    category: "补剂",
    kcalPer100g: 370,
    fatPer100g: 2,
    carbsPer100g: 10,
    proteinPer100g: 78,
    weightBasis: "none",
    cookedRawRatio: null,
    source: "public",
    servingDescription: "酪蛋白粉示例配方；按干粉重，以实际产品标签为准。"
  },
  {
    id: "public-electrolyte",
    name: "电解质粉",
    category: "补剂",
    kcalPer100g: 120,
    fatPer100g: 0,
    carbsPer100g: 30,
    proteinPer100g: 0,
    weightBasis: "none",
    cookedRawRatio: null,
    source: "public",
    servingDescription: "含糖电解质粉示例配方，每100g碳水30g；不能用于无糖产品。按干粉重，以实际标签为准。"
  },
  {
    id: "public-fish-oil",
    name: "鱼油",
    category: "补剂",
    kcalPer100g: 900,
    fatPer100g: 100,
    carbsPer100g: 0,
    proteinPer100g: 0,
    weightBasis: "none",
    cookedRawRatio: null,
    source: "public",
    servingDescription: "纯鱼油内容物，每100g脂肪100g；不包含胶囊壳，按油体重计算。"
  },
  {
    id: "public-cooking-oil",
    name: "食用油",
    category: "食物配料",
    kcalPer100g: 884,
    fatPer100g: 100,
    carbsPer100g: 0,
    proteinPer100g: 0,
    weightBasis: "none",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 884, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 0, fiberPer100g: 0,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 171413（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。纯油体，参考橄榄油；来源能量884kcal与4/4/9估算900kcal分别保留。https://fdc.nal.usda.gov/portal-data/external/171413"
  },
  {
    id: "public-almond",
    name: "巴旦木（扁桃仁）",
    category: "坚果",
    kcalPer100g: 579,
    fatPer100g: 49.93,
    carbsPer100g: 9.05,
    proteinPer100g: 21.15,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 579, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 21.55, fiberPer100g: 12.5,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 170567（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。扁桃仁/巴旦木，可食果仁；不是杏核仁。https://fdc.nal.usda.gov/portal-data/external/170567"
  },
  {
    id: "public-walnut",
    name: "核桃",
    category: "坚果",
    kcalPer100g: 654,
    fatPer100g: 65.21,
    carbsPer100g: 7.01,
    proteinPer100g: 15.23,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 654, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 13.71, fiberPer100g: 6.7,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 170187（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。核桃，可食果仁，不含壳。https://fdc.nal.usda.gov/portal-data/external/170187"
  },
  {
    id: "public-cashew",
    name: "腰果",
    category: "坚果",
    kcalPer100g: 553,
    fatPer100g: 43.85,
    carbsPer100g: 26.89,
    proteinPer100g: 18.22,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 553, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 30.19, fiberPer100g: 3.3,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 170162（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。未进一步烘烤的腰果仁，不含壳。https://fdc.nal.usda.gov/portal-data/external/170162"
  },
  {
    id: "public-peanut",
    name: "花生",
    category: "坚果",
    kcalPer100g: 567,
    fatPer100g: 49.24,
    carbsPer100g: 7.63,
    proteinPer100g: 25.8,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 567, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 16.13, fiberPer100g: 8.5,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 172430（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。生花生仁，不含壳。https://fdc.nal.usda.gov/portal-data/external/172430"
  },
  {
    id: "public-pistachio",
    name: "开心果",
    category: "坚果",
    kcalPer100g: 560,
    fatPer100g: 45.32,
    carbsPer100g: 16.57,
    proteinPer100g: 20.16,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public",
    sourceKcalPer100g: 560, sourceEnergyMethod: "food_composition", effectiveEnergyBasis: "label", sourceQuality: "matched_reference",
    carbohydrateBasis: "total_including_fiber", sourceCarbsPer100g: 27.17, fiberPer100g: 10.6,
    servingDescription: "USDA FoodData Central / SR Legacy，FDC 170184（2026-10-15核对）。每100g可食部，保留来源能量；来源碳水含纤维，仅在纤维已知时差减一次，4/4/9单列。生开心果仁，不含壳。https://fdc.nal.usda.gov/portal-data/external/170184"
  },
  ...chinaCompositionFoods
];
