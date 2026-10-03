"use client";

import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
import { parsePlanProtocol } from "@/lib/planProtocol";
import type { PlanProtocol } from "@/lib/types";

function clientFor(user: User | null) {
  const client = getSupabaseClient();
  if (!client || !user) throw new Error("请登录后使用执行协议。");
  return client;
}

export function schemaUnavailable(error: { code?: string; message?: string }): boolean {
  return ["42P01", "42703", "PGRST202", "PGRST205"].includes(error.code ?? "");
}

export async function loadPlanProtocols(user: User | null): Promise<PlanProtocol[]> {
  const { data, error } = await clientFor(user).from("user_plan_protocols").select("config").eq("user_id", user!.id).order("effective_from", { ascending: true });
  if (error && schemaUnavailable(error)) return [];
  if (error) throw error;
  return (data ?? []).map((row) => parsePlanProtocol(row.config));
}

export async function protocolSchemaReady(user: User | null, version: 1 | 2 = 1): Promise<boolean> {
  const { data, error } = await clientFor(user).rpc(version === 2 ? "nutrition_goals_capabilities_v1" : "tre_rpt_capabilities_v1");
  if (error && schemaUnavailable(error)) return false;
  if (error) throw error;
  return data === version;
}

export async function activatePlanProtocol(protocol: PlanProtocol, user: User | null): Promise<PlanProtocol> {
  const config = parsePlanProtocol(protocol);
  if (config.schemaVersion === 2 && !(await protocolSchemaReady(user, 2))) throw new Error("v5 数据库迁移尚未就绪，自动目标未应用。");
  const { data, error } = await clientFor(user).rpc("activate_plan_protocol_v1", { p_config: config, p_expected_id: config.supersedesId });
  if (error) {
    if (schemaUnavailable(error)) throw new Error("新版本数据库迁移尚未就绪，执行协议未应用。");
    if (error.code === "40001" || error.code === "23505") throw new Error("协议版本冲突或该生效日已有版本，请刷新后选择新的生效日。");
    throw error;
  }
  return parsePlanProtocol(data);
}
