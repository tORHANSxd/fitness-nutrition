"use client";

import type { User } from "@supabase/supabase-js";
import { getSupabaseClient, mapWorkoutSessionRow, workoutSessionToRow } from "@/lib/supabase";
import type { WorkoutSession } from "@/lib/types";

const workoutSessionColumns = "*";

/**
 * 训练数据存储层：按用户要求 **仅落 Supabase，不使用 localStorage 回退**。
 * 因此所有操作都要求已登录且 Supabase 已配置，否则抛出明确错误，由 UI 引导登录。
 */

export class TrainingAuthError extends Error {
  constructor() {
    super("请先登录，再保存或查看训练记录。");
    this.name = "TrainingAuthError";
  }
}

function requireClient(user: User | null) {
  const supabase = getSupabaseClient();
  if (!supabase || !user) {
    throw new TrainingAuthError();
  }
  return supabase;
}

export async function loadWorkoutSessions(user: User | null, fromDate?: string, toDate?: string): Promise<WorkoutSession[]> {
  const supabase = requireClient(user);
  let query = supabase.from("workout_sessions").select(workoutSessionColumns).order("session_date", { ascending: false });
  if (fromDate) {
    query = query.gte("session_date", fromDate);
  }
  if (toDate) {
    query = query.lte("session_date", toDate);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return data.map((row) => mapWorkoutSessionRow(row));
}

export async function saveWorkoutSession(session: WorkoutSession, user: User | null): Promise<WorkoutSession> {
  const supabase = requireClient(user);
  const row = workoutSessionToRow(session, user as User);
  if (row.sets.version === 2 || session.revision != null) {
    const { data, error } = await supabase.rpc("save_workout_session_v2", { p_document: { ...row, schedule_id: session.scheduleId ?? null, status: session.status ?? "legacy_unknown" }, p_expected_revision: session.revision ?? null });
    if (error) {
      if (error.code === "40001") throw new Error("训练记录已在另一处修改，请重新载入后再保存。");
      throw error;
    }
    return mapWorkoutSessionRow(data as Record<string, unknown>);
  }
  const { data, error } = await supabase
    .from("workout_sessions")
    .upsert(row, { onConflict: "user_id,session_date" })
    .select(workoutSessionColumns)
    .single();
  if (error) {
    throw error;
  }
  return mapWorkoutSessionRow(data);
}

export async function deleteWorkoutSession(sessionDate: string, user: User | null): Promise<void> {
  const supabase = requireClient(user);
  const { error } = await supabase
    .from("workout_sessions")
    .delete()
    .eq("user_id", (user as User).id)
    .eq("session_date", sessionDate);
  if (error) {
    throw error;
  }
}
