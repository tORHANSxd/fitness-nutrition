"use client";

import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { builtinFoods } from "@/lib/foods";
import { translate } from "@/lib/i18n";
import { preferenceCookieValues, preferencesFromRow, type AppPreferences } from "@/lib/preferences";
import { loadProfilePreferences, saveProfilePreferences } from "@/lib/preferencesStorage";
import { getSupabaseClient } from "@/lib/supabase";
import { loadFoods, loadPlannerTemplates, savePlannerTemplates } from "@/lib/storage";
import type { FoodItem, PlannerTemplates } from "@/lib/types";

export type SyncState = "loading" | "saved" | "schema-required" | "error";

interface AppContextValue {
  user: User;
  foods: FoodItem[];
  templates: PlannerTemplates;
  preferences: AppPreferences;
  syncState: SyncState;
  loadingFoods: boolean;
  refreshFoods: () => Promise<void>;
  persistTemplates: (templates: PlannerTemplates) => void;
  updatePreferences: (preferences: AppPreferences) => Promise<boolean>;
  signOut: () => Promise<void>;
  t: (key: string) => string;
}

const AppContext = createContext<AppContextValue | null>(null);

function writePreferenceCookies(preferences: AppPreferences) {
  const cookieOptions = "Path=/; Max-Age=31536000; SameSite=Lax";
  Object.entries(preferenceCookieValues(preferences)).forEach(([name, value]) => {
    document.cookie = `${name}=${encodeURIComponent(value)}; ${cookieOptions}`;
  });
  document.documentElement.lang = preferences.locale;
  document.documentElement.dataset.theme = preferences.theme;
  document.documentElement.dataset.reduceMotion = preferences.reduceMotion == null ? "system" : String(preferences.reduceMotion);
}

function isMissingPreferenceSchema(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /locale|time_zone|unit_system|energy_unit|reduce_motion/i.test(message)
    && /column|schema cache|does not exist/i.test(message);
}

export function AppProvider({
  children,
  initialPreferences,
  initialUser
}: {
  children: ReactNode;
  initialPreferences: AppPreferences;
  initialUser: User;
}) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [foods, setFoods] = useState<FoodItem[]>(builtinFoods);
  const [templates, setTemplates] = useState<PlannerTemplates>({ mealTemplates: [], dayTemplates: [] });
  const [preferences, setPreferences] = useState(initialPreferences);
  const [syncState, setSyncState] = useState<SyncState>("loading");
  const [loadingFoods, setLoadingFoods] = useState(true);

  const refreshFoods = useCallback(async () => {
    setLoadingFoods(true);
    try {
      setFoods(await loadFoods(user));
    } finally {
      setLoadingFoods(false);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    setSyncState("loading");
    Promise.all([loadFoods(user), loadPlannerTemplates(user), loadProfilePreferences(user)])
      .then(async ([nextFoods, nextTemplates, profilePreferences]) => {
        if (cancelled) {
          return;
        }
        setFoods(nextFoods);
        setTemplates(nextTemplates);
        setPreferences(profilePreferences.preferences);
        writePreferenceCookies(profilePreferences.preferences);
        if (profilePreferences.needsInitialization) {
          await saveProfilePreferences(user, profilePreferences.preferences);
        }
        if (!cancelled) {
          setSyncState("saved");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSyncState(isMissingPreferenceSchema(error) ? "schema-required" : "error");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingFoods(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      if (!nextUser) {
        router.replace("/login");
        router.refresh();
        return;
      }
      setUser((current) => current.id === nextUser.id ? current : nextUser);
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  function persistTemplates(nextTemplates: PlannerTemplates) {
    const previous = templates;
    setTemplates(nextTemplates);
    setSyncState("loading");
    savePlannerTemplates(user, nextTemplates)
      .then((saved) => {
        setTemplates(saved);
        setSyncState("saved");
      })
      .catch(() => {
        setTemplates(previous);
        setSyncState("error");
      });
  }

  async function updatePreferences(nextPreferences: AppPreferences): Promise<boolean> {
    const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const normalized = preferencesFromRow({
      locale: nextPreferences.locale,
      time_zone: nextPreferences.timeZoneMode === "auto" ? detectedTimeZone : nextPreferences.timeZone,
      time_zone_mode: nextPreferences.timeZoneMode,
      week_starts_on: nextPreferences.weekStartsOn,
      unit_system: nextPreferences.unitSystem,
      energy_unit: nextPreferences.energyUnit,
      hour_cycle: nextPreferences.hourCycle,
      theme: nextPreferences.theme,
      reduce_motion: nextPreferences.reduceMotion
    }, nextPreferences);
    setPreferences(normalized);
    writePreferenceCookies(normalized);
    setSyncState("loading");
    try {
      const saved = await saveProfilePreferences(user, normalized);
      setPreferences(saved);
      writePreferenceCookies(saved);
      setSyncState("saved");
      router.refresh();
      return true;
    } catch (error) {
      setSyncState(isMissingPreferenceSchema(error) ? "schema-required" : "error");
      return false;
    }
  }

  async function signOut() {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.replace("/login");
    router.refresh();
  }

  const value: AppContextValue = {
    user,
    foods,
    templates,
    preferences,
    syncState,
    loadingFoods,
    refreshFoods,
    persistTemplates,
    updatePreferences,
    signOut,
    t: (key) => translate(preferences.locale, key)
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used inside AppProvider");
  }
  return context;
}
