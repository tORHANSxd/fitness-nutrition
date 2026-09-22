"use client";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase";
export interface TutorialPreferences { seenVersion: number; everyVisit: boolean }
export async function loadTutorialPreferences(user: User): Promise<TutorialPreferences> {
  const client = getSupabaseClient();
  if (!client) throw new Error("教程设置暂时无法读取。");
  const { data, error } = await client.from("profiles").select("tutorial_seen_version,tutorial_every_visit").eq("id", user.id).maybeSingle();
  if (error) throw error;
  return { seenVersion: data?.tutorial_seen_version ?? 0, everyVisit: data?.tutorial_every_visit === true };
}
export async function saveTutorialPreferences(user: User, patch: Partial<TutorialPreferences>): Promise<void> {
  const client = getSupabaseClient();
  if (!client) throw new Error("教程设置暂时无法保存。");
  const { error } = await client.from("profiles").upsert({ id: user.id,
    ...(patch.seenVersion === undefined ? {} : { tutorial_seen_version: patch.seenVersion }),
    ...(patch.everyVisit === undefined ? {} : { tutorial_every_visit: patch.everyVisit }),
  }, { onConflict: "id" });
  if (error) throw error;
}
