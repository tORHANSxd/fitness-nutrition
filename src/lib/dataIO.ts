import { foodCategories, type FoodCategory, type FoodFormState, type FoodItem, type WeightBasis } from "@/lib/types";
import { foodNutritionMetadata, parseFoodNutritionMetadata } from "@/lib/foodNutrition";

// ---------------------------------------------------------------------------
// 通用 CSV 序列化 / 解析（支持引号包裹、字段内逗号与换行）
// ---------------------------------------------------------------------------

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => escapeCsvCell(cell ?? "")).join(",")).join("\r\n");
}

/** 解析 CSV 文本为二维字符串数组（含表头行）。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") {
        i += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ---------------------------------------------------------------------------
// 食物 ↔ CSV / JSON
// ---------------------------------------------------------------------------

const FOOD_CSV_HEADERS = [
  "name",
  "category",
  "kcalPer100g",
  "fatPer100g",
  "carbsPer100g",
  "proteinPer100g",
  "weightBasis",
  "cookedRawRatio", "sourceKcalPer100g", "sourceEnergyMethod", "effectiveEnergyBasis", "sourceQuality",
  "carbohydrateBasis", "sourceCarbsPer100g", "fiberPer100g", "portionPolicy", "servingDescription"
] as const;

export function foodsToCsv(foods: FoodItem[]): string {
  const rows: string[][] = [FOOD_CSV_HEADERS as unknown as string[]];
  for (const food of foods) {
    rows.push([
      food.name,
      food.category,
      String(food.kcalPer100g),
      String(food.fatPer100g),
      String(food.carbsPer100g),
      String(food.proteinPer100g),
      food.weightBasis,
      food.cookedRawRatio == null ? "" : String(food.cookedRawRatio),
      ...FOOD_CSV_HEADERS.slice(8).map(key => {
        const value = ({ ...foodNutritionMetadata(food), servingDescription: food.servingDescription } as Record<string, unknown>)[key];
        return value == null ? "" : String(value);
      })
    ]);
  }
  return toCsv(rows);
}

function normalizeCategory(value: string): FoodCategory {
  const trimmed = value.trim();
  return (foodCategories as readonly string[]).includes(trimmed) ? (trimmed as FoodCategory) : "主食";
}

function toNumber(value: unknown): number {
  if (value == null || (typeof value === "string" && !value.trim())) throw new Error("MISSING_NUTRIENT_DATA：必需营养值缺失");
  if (typeof value !== "number" && typeof value !== "string") throw new Error("INVALID_NUTRIENT_DATA：营养值必须是数字");
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error("INVALID_NUTRIENT_DATA：营养值必须为有限非负数");
  return n;
}

function importMetadata(value: Record<string, unknown>) {
  const raw = Object.fromEntries(Object.entries(value).map(([key, field]) => [key, field === "" ? undefined : field]));
  for (const key of ["sourceKcalPer100g", "sourceCarbsPer100g", "fiberPer100g"])
    if (raw[key] != null) raw[key] = toNumber(raw[key]);
  const metadata = parseFoodNutritionMetadata(raw);
  if (!metadata) throw new Error("来源热量、碳水口径或纤维数据无效");
  if (metadata.effectiveEnergyBasis === "label" && toNumber(raw.kcalPer100g) !== metadata.sourceKcalPer100g) throw new Error("来源热量与食品能量不一致，请保留来源原值");
  return { ...metadata, ...(typeof raw.servingDescription === "string" ? { servingDescription: raw.servingDescription } : {}) };
}

function normalizeWeightBasis(value: unknown): WeightBasis | null {
  return value === "raw" || value === "cooked" || value === "none" ? value : null;
}

export interface ParsedImport {
  foods: FoodFormState[];
  skipped: number;
  errors: Array<{ index: number; message: string }>;
}

/** 从 CSV 文本解析出可保存的食物表单（按表头列名映射，缺名跳过）。 */
export function csvToFoodForms(text: string): ParsedImport {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { foods: [], skipped: 0, errors: [] };
  }
  const header = rows[0].map((h) => h.trim());
  const idx = (key: string) => header.indexOf(key);
  const hasHeader = FOOD_CSV_HEADERS.some((h) => header.includes(h));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const col = hasHeader
    ? {
        name: idx("name"),
        category: idx("category"),
        kcal: idx("kcalPer100g"),
        fat: idx("fatPer100g"),
        carbs: idx("carbsPer100g"),
        protein: idx("proteinPer100g"),
        basis: idx("weightBasis"),
        ratio: idx("cookedRawRatio")
      }
    : { name: 0, category: 1, kcal: 2, fat: 3, carbs: 4, protein: 5, basis: 6, ratio: 7 };

  const foods: FoodFormState[] = [];
  let skipped = 0;
  const errors: ParsedImport["errors"] = [];
  for (const [index, r] of dataRows.entries()) {
    const name = (r[col.name] ?? "").trim();
    if (!name) {
      skipped += 1;
      errors.push({ index: index + 1, message: "食物名称缺失" });
      continue;
    }
    const basisRaw = (r[col.basis] ?? "").trim();
    const ratioRaw = (r[col.ratio] ?? "").trim();
    const weightBasis = normalizeWeightBasis(basisRaw);
    if (!weightBasis) {
      skipped += 1;
      errors.push({ index: index + 1, message: "称重口径无效" });
      continue;
    }
    try {
    const ratio = ratioRaw === "" ? null : toNumber(ratioRaw);
    if (ratio != null && ratio <= 0) throw new Error("熟生比必须为正数");
    foods.push({
      name,
      category: normalizeCategory(r[col.category] ?? ""),
      kcalPer100g: toNumber(r[col.kcal]),
      fatPer100g: toNumber(r[col.fat]),
      carbsPer100g: toNumber(r[col.carbs]),
      proteinPer100g: toNumber(r[col.protein]),
      weightBasis,
      cookedRawRatio: ratio,
      ...importMetadata({ kcalPer100g: r[col.kcal], ...Object.fromEntries(FOOD_CSV_HEADERS.slice(8).map(key => [key, hasHeader ? r[idx(key)] : undefined])) })
    });
    } catch (error) { skipped++; errors.push({ index: index + 1, message: error instanceof Error ? error.message : "食品数值无效" }); }
  }
  return { foods, skipped, errors };
}

/** 从 JSON 文本解析食物（容忍 FoodItem 数组或 {foods:[...]}）。 */
export function jsonToFoodForms(text: string): ParsedImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { foods: [], skipped: 0, errors: [{ index: 0, message: "JSON 格式无效" }] };
  }
  const list: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { foods?: unknown[] })?.foods)
      ? (parsed as { foods: unknown[] }).foods
      : [];
  const foods: FoodFormState[] = [];
  let skipped = 0;
  const errors: ParsedImport["errors"] = [];
  if (!list.length && !Array.isArray(parsed)) errors.push({ index: 0, message: "不是食物导入文档；营养标准应在饮食目标页面导入" });
  for (const [index, item] of list.entries()) {
    const obj = item as Record<string, unknown>;
    const name = typeof obj?.name === "string" ? obj.name.trim() : "";
    if (!name) {
      skipped += 1;
      errors.push({ index: index + 1, message: "食物名称缺失" });
      continue;
    }
    const weightBasis = normalizeWeightBasis(obj.weightBasis);
    if (!weightBasis) {
      skipped += 1;
      errors.push({ index: index + 1, message: "称重口径无效" });
      continue;
    }
    try {
    const ratio = obj.cookedRawRatio == null || obj.cookedRawRatio === "" ? null : toNumber(obj.cookedRawRatio);
    if (ratio != null && ratio <= 0) throw new Error("熟生比必须为正数");
    foods.push({
      name,
      category: normalizeCategory(String(obj.category ?? "")),
      kcalPer100g: toNumber(obj.kcalPer100g),
      fatPer100g: toNumber(obj.fatPer100g),
      carbsPer100g: toNumber(obj.carbsPer100g),
      proteinPer100g: toNumber(obj.proteinPer100g),
      weightBasis,
      cookedRawRatio: ratio,
      ...importMetadata(obj)
    });
    } catch (error) { skipped++; errors.push({ index: index + 1, message: error instanceof Error ? error.message : "食品数值无效" }); }
  }
  return { foods, skipped, errors };
}
