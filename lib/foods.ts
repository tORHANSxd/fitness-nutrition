import { foodCategories, type FoodItem } from "@/lib/types";

// 分类排序权重：按 foodCategories 声明顺序（主食→蔬菜→水果→肉类→补剂→坚果）。
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

// carbsPer100g 记录净碳水/可利用碳水；蔬菜不把不可供能的碳水组分计入三大营养素。
export const builtinFoods: FoodItem[] = [
  {
    id: "public-rice-cooked",
    name: "白米饭",
    category: "主食",
    kcalPer100g: 129,
    fatPer100g: 0.28,
    carbsPer100g: 27.9,
    proteinPer100g: 2.66,
    weightBasis: "cooked",
    cookedRawRatio: 2.5,
    source: "public"
  },
  {
    id: "public-brown-rice-cooked",
    name: "糙米饭",
    category: "主食",
    kcalPer100g: 110,
    fatPer100g: 0.89,
    carbsPer100g: 22.78,
    proteinPer100g: 2.56,
    weightBasis: "cooked",
    cookedRawRatio: 2.5,
    source: "public"
  },
  {
    id: "public-oats-raw",
    name: "燕麦片",
    category: "主食",
    kcalPer100g: 389,
    fatPer100g: 6.9,
    carbsPer100g: 66.27,
    proteinPer100g: 16.89,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-sweet-potato-cooked",
    name: "红薯",
    category: "主食",
    kcalPer100g: 86,
    fatPer100g: 0.05,
    carbsPer100g: 20.12,
    proteinPer100g: 1.57,
    weightBasis: "cooked",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-potato-cooked",
    name: "土豆",
    category: "主食",
    kcalPer100g: 87,
    fatPer100g: 0.1,
    carbsPer100g: 20.13,
    proteinPer100g: 1.87,
    weightBasis: "cooked",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-noodle-cooked",
    name: "面条",
    category: "主食",
    kcalPer100g: 138,
    fatPer100g: 2.07,
    carbsPer100g: 25.16,
    proteinPer100g: 4.54,
    weightBasis: "cooked",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-broccoli-cooked",
    name: "西兰花",
    category: "蔬菜",
    kcalPer100g: 28.7,
    fatPer100g: 0.41,
    carbsPer100g: 3.88,
    proteinPer100g: 2.38,
    weightBasis: "cooked",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-spinach-cooked",
    name: "菠菜",
    category: "蔬菜",
    kcalPer100g: 19.6,
    fatPer100g: 0.26,
    carbsPer100g: 1.35,
    proteinPer100g: 2.97,
    weightBasis: "cooked",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-lettuce-raw",
    name: "生菜",
    category: "蔬菜",
    kcalPer100g: 13.1,
    fatPer100g: 0.15,
    carbsPer100g: 1.57,
    proteinPer100g: 1.36,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-tomato-raw",
    name: "番茄",
    category: "蔬菜",
    kcalPer100g: 16.2,
    fatPer100g: 0.2,
    carbsPer100g: 2.72,
    proteinPer100g: 0.88,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-cucumber-raw",
    name: "黄瓜",
    category: "蔬菜",
    kcalPer100g: 16.1,
    fatPer100g: 0.11,
    carbsPer100g: 3.13,
    proteinPer100g: 0.65,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-banana-raw",
    name: "香蕉",
    category: "水果",
    kcalPer100g: 89,
    fatPer100g: 0.33,
    carbsPer100g: 22.84,
    proteinPer100g: 1.09,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-apple-raw",
    name: "苹果",
    category: "水果",
    kcalPer100g: 52,
    fatPer100g: 0.17,
    carbsPer100g: 13.81,
    proteinPer100g: 0.26,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-orange-raw",
    name: "橙子",
    category: "水果",
    kcalPer100g: 47,
    fatPer100g: 0.12,
    carbsPer100g: 11.75,
    proteinPer100g: 0.94,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-blueberry-raw",
    name: "蓝莓",
    category: "水果",
    kcalPer100g: 57,
    fatPer100g: 0.33,
    carbsPer100g: 14.49,
    proteinPer100g: 0.74,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-kiwi-raw",
    name: "猕猴桃",
    category: "水果",
    kcalPer100g: 61,
    fatPer100g: 0.52,
    carbsPer100g: 14.66,
    proteinPer100g: 1.14,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-chicken-breast-cooked",
    name: "鸡胸肉",
    category: "肉类",
    kcalPer100g: 164,
    fatPer100g: 3.54,
    carbsPer100g: 0,
    proteinPer100g: 30.76,
    weightBasis: "cooked",
    cookedRawRatio: 0.75,
    source: "public"
  },
  {
    id: "public-lean-beef-cooked",
    name: "瘦牛肉",
    category: "肉类",
    kcalPer100g: 217,
    fatPer100g: 11.8,
    carbsPer100g: 0,
    proteinPer100g: 26.1,
    weightBasis: "cooked",
    cookedRawRatio: 0.75,
    source: "public"
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
    source: "public"
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
    source: "public"
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
    source: "public"
  },
  {
    id: "public-whey",
    name: "乳清蛋白粉",
    category: "补剂",
    kcalPer100g: 390,
    fatPer100g: 6,
    carbsPer100g: 8,
    proteinPer100g: 76,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-creatine",
    name: "肌酸",
    category: "补剂",
    kcalPer100g: 0,
    fatPer100g: 0,
    carbsPer100g: 0,
    proteinPer100g: 0,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-casein",
    name: "酪蛋白粉",
    category: "补剂",
    kcalPer100g: 370,
    fatPer100g: 2,
    carbsPer100g: 10,
    proteinPer100g: 78,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-electrolyte",
    name: "电解质粉",
    category: "补剂",
    kcalPer100g: 120,
    fatPer100g: 0,
    carbsPer100g: 30,
    proteinPer100g: 0,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-fish-oil",
    name: "鱼油",
    category: "补剂",
    kcalPer100g: 900,
    fatPer100g: 100,
    carbsPer100g: 0,
    proteinPer100g: 0,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-cooking-oil",
    name: "食用油",
    category: "补剂",
    kcalPer100g: 884,
    fatPer100g: 100,
    carbsPer100g: 0,
    proteinPer100g: 0,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-almond",
    name: "杏仁",
    category: "坚果",
    kcalPer100g: 578,
    fatPer100g: 50.64,
    carbsPer100g: 19.74,
    proteinPer100g: 21.26,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-walnut",
    name: "核桃",
    category: "坚果",
    kcalPer100g: 654,
    fatPer100g: 65.21,
    carbsPer100g: 13.71,
    proteinPer100g: 15.23,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-cashew",
    name: "腰果",
    category: "坚果",
    kcalPer100g: 553,
    fatPer100g: 43.85,
    carbsPer100g: 30.19,
    proteinPer100g: 18.22,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-peanut",
    name: "花生",
    category: "坚果",
    kcalPer100g: 567,
    fatPer100g: 49.24,
    carbsPer100g: 16.13,
    proteinPer100g: 25.8,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  },
  {
    id: "public-pistachio",
    name: "开心果",
    category: "坚果",
    kcalPer100g: 560,
    fatPer100g: 45.32,
    carbsPer100g: 27.17,
    proteinPer100g: 20.16,
    weightBasis: "raw",
    cookedRawRatio: null,
    source: "public"
  }
];
