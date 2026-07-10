"use client";

import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import { StorageAuthError } from "@/lib/storage";

// 体测记录：复用线上已有的 body_logs 表（user_id + plan_date 唯一），体重 + 体脂率 + 7 项围度。
// 所有字段可空——只记当天量过的项。体重/体脂是计划页目标公式的输入（见 mergeLatestBodyMetrics）。

export interface BodyLog {
  logDate: string; // YYYY-MM-DD（对应 body_logs.plan_date）
  weightKg?: number | null;
  bodyFatPct?: number | null;
  waistCm?: number | null;
  chestCm?: number | null;
  hipCm?: number | null;
  shoulderCm?: number | null;
  upperArmCm?: number | null;
  thighCm?: number | null;
  calfCm?: number | null;
}

export type BodyMetricKey = Exclude<keyof BodyLog, "logDate">;

export interface BodyMetricField {
  key: BodyMetricKey;
  label: string;
  unit: string;
  /** 折线颜色（Claude 风低饱和数据色）。 */
  color: string;
}

export const bodyMetricFields: BodyMetricField[] = [
  { key: "weightKg", label: "体重", unit: "kg", color: "#D97757" },
  { key: "bodyFatPct", label: "体脂率", unit: "%", color: "#8C6E54" },
  { key: "waistCm", label: "腰围", unit: "cm", color: "#8A7BBE" },
  { key: "chestCm", label: "胸围", unit: "cm", color: "#5E8B7E" },
  { key: "hipCm", label: "臀围", unit: "cm", color: "#B08968" },
  { key: "shoulderCm", label: "肩宽", unit: "cm", color: "#6E8CA8" },
  { key: "upperArmCm", label: "臂围", unit: "cm", color: "#C15F5F" },
  { key: "thighCm", label: "大腿围", unit: "cm", color: "#7C8B64" },
  { key: "calfCm", label: "小腿围", unit: "cm", color: "#9A8FA6" }
];

const rowFieldByKey: Record<BodyMetricKey, string> = {
  weightKg: "weight_kg",
  bodyFatPct: "body_fat_pct",
  waistCm: "waist_cm",
  chestCm: "chest_cm",
  hipCm: "hip_cm",
  shoulderCm: "shoulder_cm",
  upperArmCm: "upper_arm_cm",
  thighCm: "thigh_cm",
  calfCm: "calf_cm"
};

function toNumberOrNull(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapBodyLogRow(row: Record<string, unknown>): BodyLog {
  const log: BodyLog = { logDate: String(row.plan_date ?? "") };
  for (const field of bodyMetricFields) {
    log[field.key] = toNumberOrNull(row[rowFieldByKey[field.key]]);
  }
  return log;
}

export function bodyLogToRow(userId: string, log: BodyLog) {
  const row: Record<string, unknown> = {
    user_id: userId,
    plan_date: log.logDate,
    updated_at: new Date().toISOString()
  };
  for (const field of bodyMetricFields) {
    row[rowFieldByKey[field.key]] = log[field.key] ?? null;
  }
  return row;
}

/**
 * 体测 → 计划档案联动：用最新一条非空体重/体脂覆盖档案对应字段（体测是这两项的真源）。
 * 两个字段各自独立取"最新非空"——最近一次只称了体重时，体脂沿用更早的记录。
 */
export function mergeLatestBodyMetrics<T extends { weightKg: number; bodyFatPct?: number | null }>(profile: T, logs: BodyLog[]): T {
  const newestFirst = [...logs].sort((a, b) => b.logDate.localeCompare(a.logDate));
  const latestWeight = newestFirst.find((log) => log.weightKg != null && log.weightKg > 0)?.weightKg;
  const latestBodyFat = newestFirst.find((log) => log.bodyFatPct != null && log.bodyFatPct > 0)?.bodyFatPct;
  if (latestWeight == null && latestBodyFat == null) {
    return profile;
  }
  return {
    ...profile,
    ...(latestWeight != null ? { weightKg: latestWeight } : {}),
    ...(latestBodyFat != null ? { bodyFatPct: latestBodyFat } : {})
  };
}

/** 日期范围过滤（纯函数）：rangeDays 为向前含当日的天数窗口，"all" 返回全部；结果按日期升序。 */
export function filterLogsByRange(logs: BodyLog[], rangeDays: number | "all", today: string): BodyLog[] {
  const sorted = [...logs].sort((a, b) => a.logDate.localeCompare(b.logDate));
  if (rangeDays === "all") {
    return sorted;
  }
  const end = new Date(`${today}T00:00:00Z`).getTime();
  const start = end - (rangeDays - 1) * 24 * 60 * 60 * 1000;
  return sorted.filter((log) => {
    const time = new Date(`${log.logDate}T00:00:00Z`).getTime();
    return time >= start && time <= end;
  });
}

// ---------------------------------------------------------------------------
// Supabase 存取（登录门禁与 lib/storage.ts 一致）
// ---------------------------------------------------------------------------

function requireClient(user: User | null) {
  const supabase = getSupabaseClient();
  if (!supabase || !user) {
    throw new StorageAuthError();
  }
  return { supabase, user } as const;
}

export async function loadBodyLogs(user: User | null, limit = 400): Promise<BodyLog[]> {
  const { supabase, user: authedUser } = requireClient(user);
  const { data, error } = await supabase
    .from("body_logs")
    .select("*")
    .eq("user_id", authedUser.id)
    .order("plan_date", { ascending: false })
    .limit(limit);
  if (error) {
    throw error;
  }
  return (data ?? []).map((row) => mapBodyLogRow(row as Record<string, unknown>));
}

export async function saveBodyLog(log: BodyLog, user: User | null): Promise<BodyLog> {
  const { supabase, user: authedUser } = requireClient(user);
  const { data, error } = await supabase
    .from("body_logs")
    .upsert(bodyLogToRow(authedUser.id, log), { onConflict: "user_id,plan_date" })
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  return mapBodyLogRow(data as Record<string, unknown>);
}

export async function deleteBodyLog(logDate: string, user: User | null): Promise<void> {
  const { supabase, user: authedUser } = requireClient(user);
  const { error } = await supabase.from("body_logs").delete().eq("user_id", authedUser.id).eq("plan_date", logDate);
  if (error) {
    throw error;
  }
}
