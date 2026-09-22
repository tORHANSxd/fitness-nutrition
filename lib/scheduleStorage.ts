"use client";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import { assertDocument, record, validTime, validZone } from "@/lib/planProtocol";
import { isDateKey } from "@/lib/dateTime";
import type { WorkoutSchedule } from "@/lib/types";

export function parseWorkoutSchedule(value: unknown): WorkoutSchedule {
  assertDocument(value);
  const s = record(value);
  if (!isDateKey(String(s.sessionDate)) || !["training", "rest"].includes(String(s.dayKind)) || !["planned", "skipped", "cancelled"].includes(String(s.status)) || !Number.isInteger(s.revision) || Number(s.revision) < 0 || typeof s.manuallyEdited !== "boolean") throw new Error("训练排期格式无效。");
  if (s.plannedStart != null) validTime(s.plannedStart);
  validZone(s.timeZone);
  if (s.dayKind === "rest" && s.prescription != null) throw new Error("休息日不能含训练处方。");
  if (s.dayKind === "training" && (!s.prescription || !Array.isArray(record(s.prescription).exercises))) throw new Error("训练处方缺失。");
  return s as unknown as WorkoutSchedule;
}

function client(user: User | null) { const c = getSupabaseClient(); if (!c || !user) throw new Error("请登录后使用训练排期。"); return c; }
function fromRow(row: Record<string, unknown>): WorkoutSchedule {
  return parseWorkoutSchedule({ id: row.id, sessionDate: row.session_date, dayKind: row.day_kind, protocolId: row.protocol_id, prescription: row.prescription, plannedStart: row.planned_start, timeZone: row.time_zone, status: row.status, revision: Number(row.revision), manuallyEdited: row.manually_edited });
}
export async function loadWorkoutSchedules(user: User | null, from: string, to: string): Promise<WorkoutSchedule[]> {
  const { data, error } = await client(user).from("workout_schedules")
    .select("id,session_date,day_kind,protocol_id,prescription,planned_start,time_zone,status,revision,manually_edited")
    .eq("user_id", user!.id).gte("session_date", from).lte("session_date", to).order("session_date");
  if (error) { if (["42P01", "PGRST205"].includes(error.code)) return []; throw error; }
  return data.map(fromRow);
}
/** 整个预览一次事务；模式 generate 遇占用只跳过，replace 按每行 revision 比较。 */
export async function saveWorkoutSchedules(user: User | null, schedules: WorkoutSchedule[], mode: "generate" | "replace"): Promise<WorkoutSchedule[]> {
  const { data, error } = await client(user).rpc("save_workout_schedules_v1", { p_schedules: schedules.map(parseWorkoutSchedule), p_mode: mode });
  if (error) { if (error.code === "40001") throw new Error("排期已变化，请重新预览后确认。"); throw error; }
  return (data as Record<string, unknown>[]).map(fromRow);
}
