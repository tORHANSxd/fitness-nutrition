"use client";

import type { User } from "@supabase/supabase-js";
import { defaultPreferences, preferencesFromRow, preferencesToRow, type AppPreferences } from "@/lib/preferences";
import { getSupabaseClient } from "@/lib/supabase";

const preferenceColumns = "locale,time_zone,time_zone_mode,week_starts_on,unit_system,energy_unit,hour_cycle,theme,reduce_motion";

export async function loadProfilePreferences(user: User): Promise<{ preferences: AppPreferences; needsInitialization: boolean }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const detected = defaultPreferences({ language: navigator.language, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  const { data, error } = await supabase.from("profiles").select(preferenceColumns).eq("id", user.id).maybeSingle();
  if (error) {
    throw error;
  }

  const row = (data ?? {}) as Record<string, unknown>;
  const preferences = preferencesFromRow(row, detected);
  return {
    preferences,
    needsInitialization: data == null
      || row.locale == null
      || row.time_zone == null
      || (preferences.timeZoneMode === "auto" && row.time_zone !== preferences.timeZone)
  };
}

export async function saveProfilePreferences(user: User, preferences: AppPreferences): Promise<AppPreferences> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, ...preferencesToRow(preferences), updated_at: new Date().toISOString() }, { onConflict: "id" })
    .select(preferenceColumns)
    .single();
  if (error) {
    throw error;
  }
  return preferencesFromRow(data as Record<string, unknown>, preferences);
}
