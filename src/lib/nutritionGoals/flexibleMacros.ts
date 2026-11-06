import type { MacroTotals } from "@/lib/types";
import type { MacroMethods } from "./types";

export interface DailyMacroInputs extends MacroMethods {
  version: 1;
  weightKg: number | null;
  bodyFatPct: number | null;
  ffmInput?: "body_fat" | "direct";
  ffmKg?: number | null;
}

export const dailyFfmKg = (input: DailyMacroInputs) => input.ffmInput === "direct" ? input.ffmKg : input.weightKg != null && input.bodyFatPct != null ? input.weightKg * (1 - input.bodyFatPct / 100) : null;

const names = { protein: "蛋白质", fat: "脂肪", carbs: "碳水" };
const factors = { protein: 4, fat: 9, carbs: 4 };

/** Exact user formulas; historical presets retain their own rounding and fat floor. */
export function resolveFlexibleMacros(kcal: number, methods: MacroMethods, body: { weightKg?: number | null; ffmKg?: number | null }): MacroTotals {
  const number = (value: unknown, label: string, positive = false): number => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1e9 || (positive && value === 0)) throw new Error(`${label}须为${positive ? "正数" : "非负有限数字"}。`);
    return value;
  };
  number(kcal, "目标热量", true);
  const target = { kcal, protein: 0, fat: 0, carbs: 0 };
  let residual: keyof MacroMethods | undefined;
  for (const key of ["protein", "fat", "carbs"] as const) {
    const method = methods[key], label = names[key];
    if (!method || typeof method !== "object") throw new Error(`请选择${label}计算方法。`);
    switch (method.kind) {
      case "fixed_grams": target[key] = number(method.grams, `${label}克数`); break;
      case "body_weight": target[key] = number(body.weightKg, "计算体重", true) * number(method.coefficient, `${label}倍数`); break;
      case "ffm": target[key] = number(body.ffmKg, "去脂体重（需填写体脂率或直接去脂体重）", true) * number(method.coefficient, `${label}倍数`); break;
      case "reference_weight":
        if (key !== "protein" || typeof method.sourceLabel !== "string" || !method.sourceLabel.trim() || method.sourceLabel.length > 200) throw new Error("请填写蛋白质参考体重依据。");
        target[key] = number(method.weightKg, "参考体重", true) * number(method.coefficient, "蛋白质倍数"); break;
      case "energy_share":
        if (key !== "fat" || number(method.share, "脂肪供能份额") > 1) throw new Error("脂肪供能份额须在0–100%之间。");
        target[key] = kcal * method.share / 9; break;
      case "residual":
        if (residual) throw new Error("最多只能选择一项营养素按剩余热量计算。");
        residual = key; break;
      default: throw new Error(`不支持的${label}计算方法。`);
    }
    number(target[key], `${label}计算结果`);
  }
  const remaining = kcal - target.protein * 4 - target.fat * 9 - target.carbs * 4;
  if (residual) {
    if (remaining < -1e-6) throw new Error("已指定的营养素超过热量预算，请调整热量或克数、倍数。");
    target[residual] = Math.max(0, remaining) / factors[residual];
  } else if (Math.abs(remaining) > 1e-6) throw new Error("三项营养素的热量与目标不一致；请选择一项按剩余热量计算，或调整输入。");
  return target;
}

export function parseDailyMacroInputs(value: unknown, kcal: number): DailyMacroInputs {
  const input = value as DailyMacroInputs;
  if (!input || typeof input !== "object" || Array.isArray(input) || input.version !== 1
    || (input.weightKg !== null && (typeof input.weightKg !== "number" || !Number.isFinite(input.weightKg) || input.weightKg <= 0 || input.weightKg > 1e9))
    || (input.bodyFatPct !== null && (typeof input.bodyFatPct !== "number" || !Number.isFinite(input.bodyFatPct) || input.bodyFatPct < 0 || input.bodyFatPct >= 100))
    || (input.ffmInput !== undefined && input.ffmInput !== "body_fat" && input.ffmInput !== "direct")
    || (input.ffmKg != null && (typeof input.ffmKg !== "number" || !Number.isFinite(input.ffmKg) || input.ffmKg <= 0 || input.weightKg == null || input.ffmKg > input.weightKg))) throw new Error("当天体重或体脂率输入无效；未知请留空。");
  resolveFlexibleMacros(kcal, input, { weightKg: input.weightKg, ffmKg: dailyFfmKg(input) });
  return structuredClone({ version: 1, weightKg: input.weightKg, bodyFatPct: input.bodyFatPct, protein: input.protein, fat: input.fat, carbs: input.carbs, ...(input.ffmInput !== undefined ? { ffmInput: input.ffmInput } : {}), ...(input.ffmKg !== undefined ? { ffmKg: input.ffmKg } : {}) });
}
