import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import { round } from "@/lib/nutrition";
import type { UserProfile } from "@/lib/types";

// Apple 健康 / Apple Watch 每日身体数据。字段与 supabase/health_metrics.sql 一一对应（camelCase 镜像）。
export interface HealthMetric {
  metricDate: string; // YYYY-MM-DD
  weightKg?: number | null;
  bodyFatPct?: number | null;
  activeEnergyKcal?: number | null;
  restingEnergyKcal?: number | null;
  restingHr?: number | null;
  hrvMs?: number | null;
  vo2max?: number | null;
  sleepHours?: number | null;
  steps?: number | null;
  exerciseMinutes?: number | null;
  source?: string;
}

const numericFields: Array<keyof HealthMetric> = [
  "weightKg",
  "bodyFatPct",
  "activeEnergyKcal",
  "restingEnergyKcal",
  "restingHr",
  "hrvMs",
  "vo2max",
  "sleepHours",
  "steps",
  "exerciseMinutes"
];

// Health Auto Export（App Store 上的「Health Auto Export - JSON API」自动化）指标名 → 本表字段。
// 也兼容部分同义写法，未知指标忽略。
const autoExportMetricMap: Record<string, keyof HealthMetric> = {
  weight_body_mass: "weightKg",
  body_mass: "weightKg",
  body_fat_percentage: "bodyFatPct",
  active_energy: "activeEnergyKcal",
  active_energy_burned: "activeEnergyKcal",
  basal_energy_burned: "restingEnergyKcal",
  resting_energy: "restingEnergyKcal",
  resting_heart_rate: "restingHr",
  heart_rate_variability: "hrvMs",
  heart_rate_variability_sdnn: "hrvMs",
  vo2_max: "vo2max",
  vo2max: "vo2max",
  step_count: "steps",
  steps: "steps",
  apple_exercise_time: "exerciseMinutes",
  exercise_time: "exerciseMinutes",
  sleep_analysis: "sleepHours",
  sleep: "sleepHours"
};

// 简单/自定义载荷字段（快捷指令手写 JSON 时用）→ 本表字段。
const simpleFieldMap: Record<string, keyof HealthMetric> = {
  weightkg: "weightKg",
  weight: "weightKg",
  bodyfatpct: "bodyFatPct",
  bodyfat: "bodyFatPct",
  activeenergykcal: "activeEnergyKcal",
  activeenergy: "activeEnergyKcal",
  activekcal: "activeEnergyKcal",
  restingenergykcal: "restingEnergyKcal",
  restinghr: "restingHr",
  restingheartrate: "restingHr",
  hrv: "hrvMs",
  hrvms: "hrvMs",
  vo2max: "vo2max",
  sleephours: "sleepHours",
  sleep: "sleepHours",
  steps: "steps",
  exerciseminutes: "exerciseMinutes"
};

function toDateKey(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  // Health Auto Export 常见格式 "2026-07-01 00:00:00 +0000"，取前 10 位；否则交给 Date 解析。
  const head = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) {
    return head;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

function coerceNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : null;
}

function assign(target: Record<string, HealthMetric>, dateKey: string, field: keyof HealthMetric, value: number) {
  const existing = target[dateKey] ?? { metricDate: dateKey };
  // 睡眠/活动能量/步数按天累加（一天可能有多段样本）；其余覆盖为最新值。
  if ((field === "sleepHours" || field === "activeEnergyKcal" || field === "steps" || field === "exerciseMinutes") && typeof existing[field] === "number") {
    (existing[field] as number) += value;
  } else {
    (existing[field] as number) = value;
  }
  target[dateKey] = existing;
}

/**
 * 把外部载荷（Health Auto Export 的 data.metrics[] 或简单 {date, weightKg,...} 对象/数组）
 * 归一化为按日期聚合的 HealthMetric[]。纯函数，路由与测试共用。未知字段/无法解析的日期忽略。
 */
export function normalizeHealthPayload(body: unknown, fallbackDate: string): HealthMetric[] {
  const byDate: Record<string, HealthMetric> = {};

  const root = (body ?? {}) as Record<string, unknown>;
  const data = root.data as Record<string, unknown> | undefined;
  const metrics = (data?.metrics ?? root.metrics) as unknown;

  if (Array.isArray(metrics)) {
    // Health Auto Export 格式
    for (const metric of metrics as Array<Record<string, unknown>>) {
      const field = autoExportMetricMap[String(metric.name ?? "").toLowerCase()];
      if (!field) continue;
      const points = Array.isArray(metric.data) ? (metric.data as Array<Record<string, unknown>>) : [];
      for (const point of points) {
        const dateKey = toDateKey(point.date) ?? fallbackDate;
        const qty = coerceNumber(point.qty ?? point.value ?? point.Avg ?? point.avg);
        if (qty == null) continue;
        // 睡眠可能以分钟或小时上报：Health Auto Export 的 sleep 用小时；若明显是分钟(>24)则折算。
        assign(byDate, dateKey, field, field === "sleepHours" && qty > 24 ? qty / 60 : qty);
      }
    }
  }

  // 简单格式：单个对象或对象数组
  const simpleItems: Array<Record<string, unknown>> = Array.isArray(root)
    ? (root as Array<Record<string, unknown>>)
    : Array.isArray(root.samples)
      ? (root.samples as Array<Record<string, unknown>>)
      : metrics == null && typeof root === "object"
        ? [root]
        : [];

  for (const item of simpleItems) {
    const dateKey = toDateKey(item.date ?? item.metricDate ?? item.day) ?? fallbackDate;
    for (const [rawKey, rawValue] of Object.entries(item)) {
      const field = simpleFieldMap[rawKey.toLowerCase()];
      if (!field) continue;
      const value = coerceNumber(rawValue);
      if (value == null) continue;
      assign(byDate, dateKey, field, value);
    }
  }

  return Object.values(byDate)
    .map((metric) => {
      const cleaned: HealthMetric = { metricDate: metric.metricDate, source: "apple_health" };
      for (const field of numericFields) {
        const value = metric[field];
        if (typeof value === "number" && Number.isFinite(value)) {
          (cleaned[field] as number) = field === "steps" ? Math.round(value) : round(value, 2);
        }
      }
      return cleaned;
    })
    .filter((metric) => numericFields.some((field) => metric[field] != null))
    .sort((a, b) => a.metricDate.localeCompare(b.metricDate));
}

// HealthMetric → Supabase 行（snake_case）。
export function healthMetricToRow(userId: string, metric: HealthMetric) {
  return {
    user_id: userId,
    metric_date: metric.metricDate,
    weight_kg: metric.weightKg ?? null,
    body_fat_pct: metric.bodyFatPct ?? null,
    active_energy_kcal: metric.activeEnergyKcal ?? null,
    resting_energy_kcal: metric.restingEnergyKcal ?? null,
    resting_hr: metric.restingHr ?? null,
    hrv_ms: metric.hrvMs ?? null,
    vo2max: metric.vo2max ?? null,
    sleep_hours: metric.sleepHours ?? null,
    steps: metric.steps ?? null,
    exercise_minutes: metric.exerciseMinutes ?? null,
    source: metric.source ?? "apple_health",
    raw: metric as unknown,
    updated_at: new Date().toISOString()
  };
}

export function mapHealthMetricRow(row: Record<string, unknown>): HealthMetric {
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    metricDate: String(row.metric_date),
    weightKg: num(row.weight_kg),
    bodyFatPct: num(row.body_fat_pct),
    activeEnergyKcal: num(row.active_energy_kcal),
    restingEnergyKcal: num(row.resting_energy_kcal),
    restingHr: num(row.resting_hr),
    hrvMs: num(row.hrv_ms),
    vo2max: num(row.vo2max),
    sleepHours: num(row.sleep_hours),
    steps: row.steps == null ? null : Number(row.steps),
    exerciseMinutes: num(row.exercise_minutes),
    source: row.source == null ? "apple_health" : String(row.source)
  };
}

// 读取最近若干天的健康数据（登录态，按 RLS 只返回自己的行）。
export async function loadRecentHealthMetrics(user: User | null, limit = 14): Promise<HealthMetric[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !user) {
    return [];
  }
  const { data, error } = await supabase
    .from("health_metrics")
    .select("*")
    .eq("user_id", user.id)
    .order("metric_date", { ascending: false })
    .limit(limit);
  if (error || !data) {
    return [];
  }
  return data.map(mapHealthMetricRow);
}

export async function loadLatestHealthMetric(user: User | null): Promise<HealthMetric | null> {
  const [latest] = await loadRecentHealthMetrics(user, 1);
  return latest ?? null;
}

// 同步令牌存在 profiles.preferences.healthSyncToken（jsonb，无需新增列）。读取/生成时合并保留其余偏好（如草稿）。
export async function getHealthSyncToken(user: User | null): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !user) {
    return null;
  }
  const { data } = await supabase.from("profiles").select("preferences").eq("id", user.id).maybeSingle();
  const preferences = (data?.preferences ?? {}) as Record<string, unknown>;
  const token = preferences.healthSyncToken;
  return typeof token === "string" && token.length > 0 ? token : null;
}

export async function ensureHealthSyncToken(user: User | null): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !user) {
    return null;
  }
  const existing = await getHealthSyncToken(user);
  if (existing) {
    return existing;
  }
  const token = `hs_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const { data } = await supabase.from("profiles").select("preferences").eq("id", user.id).maybeSingle();
  const preferences = { ...((data?.preferences ?? {}) as Record<string, unknown>), healthSyncToken: token };
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, preferences, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) {
    return null;
  }
  return token;
}

// 把最新健康数据映射进档案：体重→weightKg（喂 BMR/TDEE/全部目标），活动能量→exerciseKcal（喂 TDEE）。
export function applyHealthMetricToProfile(profile: UserProfile, metric: HealthMetric): UserProfile {
  return {
    ...profile,
    weightKg: metric.weightKg != null ? round(metric.weightKg, 1) : profile.weightKg,
    exerciseKcal: metric.activeEnergyKcal != null ? Math.round(metric.activeEnergyKcal) : profile.exerciseKcal
  };
}

// 供档案面板显示的字段说明（含单位与用途）。
export const healthMetricDisplay: Array<{ field: keyof HealthMetric; label: string; unit: string; use: string }> = [
  { field: "weightKg", label: "体重", unit: "kg", use: "喂 BMR/TDEE/全部目标" },
  { field: "activeEnergyKcal", label: "活动能量", unit: "kcal", use: "喂 TDEE 运动消耗" },
  { field: "restingHr", label: "静息心率", unit: "bpm", use: "恢复参考" },
  { field: "hrvMs", label: "HRV", unit: "ms", use: "恢复参考" },
  { field: "sleepHours", label: "睡眠", unit: "h", use: "恢复参考" },
  { field: "bodyFatPct", label: "体脂率", unit: "%", use: "去脂体重参考" },
  { field: "vo2max", label: "VO₂Max", unit: "", use: "有氧趋势" },
  { field: "steps", label: "步数", unit: "", use: "活动量参考" }
];
