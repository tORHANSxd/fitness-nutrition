import catalog from "@/lib/data/china-food-catalog.json";
import type { FoodCategory, FoodItem } from "@/lib/types";
import { isEdiblePercent } from "@/lib/foodWeights";

export const chinaFoodSource = {
  repository: "https://github.com/Sanotsu/china-food-composition-data",
  commit: "d15675c27582748307023b7ee7aca2a63fc52756",
  foodCount: 1677,
  giCount: 259,
} as const;

export interface ChinaFoodSummary {
  group: string;
  category: FoodCategory;
  foodCode: string;
  foodName: string;
  englishName: string;
  edible: string;
  energyKCal: string;
  CHO: string;
  dietaryFiber: string;
  protein: string;
  fat: string;
}

export type ChinaFoodRecord = Record<string, string> & Pick<ChinaFoodSummary, "foodCode" | "foodName" | "group">;
export interface ChinaGiGroup { foodGroup: string; list: { index: number; foodName: string; GI: number }[] }

export const chinaFoodCatalog = catalog as ChinaFoodSummary[];
export const chinaFoodId = (code: string) => `public-cfcd6-${code}`;
const summariesById = new Map(chinaFoodCatalog.map((row) => [chinaFoodId(row.foodCode), row]));
export const getChinaFoodSummary = (id: string) => summariesById.get(id);

/** Tr is a trace approximation for computation; missing/unrecognized values stay unknown. */
export function parseChinaNutrient(value: string): number | null {
  if (value === "Tr") return 0;
  return /^\d+(\.\d+)?\*?$/.test(value) ? Number(value.replace(/\*$/, "")) : null;
}

export function chinaFoodUnavailableReason(row: ChinaFoodSummary): string | null {
  const names = { protein: "蛋白质", fat: "脂肪", CHO: "总碳水", dietaryFiber: "膳食纤维" } as const;
  const missing = (Object.keys(names) as (keyof typeof names)[]).filter((key) => parseChinaNutrient(row[key]) === null);
  if (missing.length) return `缺少${missing.map((key) => names[key]).join("、")}`;
  if (parseChinaNutrient(row.CHO)! < parseChinaNutrient(row.dietaryFiber)!) return "膳食纤维大于总碳水，需核对";
  return null;
}

export function chinaFoodToFoodItem(row: ChinaFoodSummary): FoodItem | null {
  if (chinaFoodUnavailableReason(row)) return null;
  const carbs = Math.round((parseChinaNutrient(row.CHO)! - parseChinaNutrient(row.dietaryFiber)!) * 100) / 100;
  const protein = parseChinaNutrient(row.protein)!;
  const fat = parseChinaNutrient(row.fat)!;
  const ediblePercent = parseChinaNutrient(row.edible);
  return {
    id: chinaFoodId(row.foodCode), name: row.foodName, category: row.category,
    carbsPer100g: carbs, proteinPer100g: protein, fatPer100g: fat,
    kcalPer100g: Math.round((carbs * 4 + protein * 4 + fat * 9) * 10) / 10,
    // The source gives food state in its name, not a universal raw/cooked conversion.
    weightBasis: "none", cookedRawRatio: null, source: "public",
    ...(isEdiblePercent(ediblePercent) ? { ediblePercent } : {}),
  };
}

export const chinaCompositionFoods: FoodItem[] = chinaFoodCatalog.flatMap((row) => {
  const food = chinaFoodToFoodItem(row);
  return food ? [food] : [];
});

const normalizeSearch = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[\s\[\]［］()（）·,，、-]/g, "");
const searchById = new Map(chinaFoodCatalog.map((row) => [chinaFoodId(row.foodCode), normalizeSearch(`${row.foodName} ${row.englishName} ${row.foodCode} ${row.group}`)]));
export function matchesFoodSearch(food: Pick<FoodItem, "id" | "name">, term: string): boolean {
  const search = normalizeSearch(term);
  return !search || normalizeSearch(food.name).includes(search) || (searchById.get(food.id)?.includes(search) ?? false);
}

let compositionRequest: Promise<ChinaFoodRecord[]> | undefined;
export function loadChinaFoodRecords(): Promise<ChinaFoodRecord[]> {
  compositionRequest ??= fetch(`/data/china-food-composition.json?v=${chinaFoodSource.commit}`)
    .then(async (response) => {
      if (!response.ok) throw new Error("原始营养数据读取失败，请重试。");
      const data = await response.json();
      if (data.commit !== chinaFoodSource.commit || !Array.isArray(data.records) || data.records.length !== chinaFoodSource.foodCount) throw new Error("食物数据版本不一致，请刷新页面。");
      return data.records as ChinaFoodRecord[];
    }).catch((error) => { compositionRequest = undefined; throw error; });
  return compositionRequest;
}

export async function loadChinaGiGroups(): Promise<ChinaGiGroup[]> {
  const response = await fetch(`/data/china-food-gi.json?v=${chinaFoodSource.commit}`);
  if (!response.ok) throw new Error("GI 数据读取失败，请重试。");
  const data = await response.json();
  if (data.commit !== chinaFoodSource.commit || !Array.isArray(data.groups)) throw new Error("GI 数据版本不一致，请刷新页面。");
  return data.groups;
}
