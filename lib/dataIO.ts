import { foodCategories, type FoodCategory, type FoodFormState, type FoodItem } from "@/lib/types";

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
  "cookedRawRatio"
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
      food.cookedRawRatio == null ? "" : String(food.cookedRawRatio)
    ]);
  }
  return toCsv(rows);
}

function normalizeCategory(value: string): FoodCategory {
  const trimmed = value.trim();
  return (foodCategories as readonly string[]).includes(trimmed) ? (trimmed as FoodCategory) : "主食";
}

function toNumber(value: string | undefined): number {
  const n = Number((value ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

export interface ParsedImport {
  foods: FoodFormState[];
  skipped: number;
}

/** 从 CSV 文本解析出可保存的食物表单（按表头列名映射，缺名跳过）。 */
export function csvToFoodForms(text: string): ParsedImport {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { foods: [], skipped: 0 };
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
  for (const r of dataRows) {
    const name = (r[col.name] ?? "").trim();
    if (!name) {
      skipped += 1;
      continue;
    }
    const basisRaw = (r[col.basis] ?? "").trim();
    const ratioRaw = (r[col.ratio] ?? "").trim();
    foods.push({
      name,
      category: normalizeCategory(r[col.category] ?? ""),
      kcalPer100g: toNumber(r[col.kcal]),
      fatPer100g: toNumber(r[col.fat]),
      carbsPer100g: toNumber(r[col.carbs]),
      proteinPer100g: toNumber(r[col.protein]),
      weightBasis: basisRaw === "raw" ? "raw" : "cooked",
      cookedRawRatio: ratioRaw === "" ? null : toNumber(ratioRaw)
    });
  }
  return { foods, skipped };
}

/** 从 JSON 文本解析食物（容忍 FoodItem 数组或 {foods:[...]}）。 */
export function jsonToFoodForms(text: string): ParsedImport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { foods: [], skipped: 0 };
  }
  const list: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { foods?: unknown[] })?.foods)
      ? (parsed as { foods: unknown[] }).foods
      : [];
  const foods: FoodFormState[] = [];
  let skipped = 0;
  for (const item of list) {
    const obj = item as Record<string, unknown>;
    const name = typeof obj?.name === "string" ? obj.name.trim() : "";
    if (!name) {
      skipped += 1;
      continue;
    }
    foods.push({
      name,
      category: normalizeCategory(String(obj.category ?? "")),
      kcalPer100g: toNumber(String(obj.kcalPer100g ?? "")),
      fatPer100g: toNumber(String(obj.fatPer100g ?? "")),
      carbsPer100g: toNumber(String(obj.carbsPer100g ?? "")),
      proteinPer100g: toNumber(String(obj.proteinPer100g ?? "")),
      weightBasis: String(obj.weightBasis ?? "") === "raw" ? "raw" : "cooked",
      cookedRawRatio: obj.cookedRawRatio == null || obj.cookedRawRatio === "" ? null : toNumber(String(obj.cookedRawRatio))
    });
  }
  return { foods, skipped };
}
