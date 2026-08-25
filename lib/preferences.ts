import { DEFAULT_LOCALE, DEFAULT_TIME_ZONE, resolveTimeZone } from "@/lib/dateTime";

export type AppLocale = "zh-CN" | "en";
export type TimeZoneMode = "auto" | "fixed";
export type UnitSystem = "metric" | "imperial";
export type EnergyUnit = "kcal" | "kj";
export type HourCycle = "h12" | "h23";
export type ThemePreference = "system" | "light" | "dark";

export interface AppPreferences {
  locale: AppLocale;
  timeZone: string;
  timeZoneMode: TimeZoneMode;
  weekStartsOn: number;
  unitSystem: UnitSystem;
  energyUnit: EnergyUnit;
  hourCycle: HourCycle;
  theme: ThemePreference;
  reduceMotion: boolean | null;
}

export const preferenceCookieNames = {
  locale: "nt-locale",
  timeZone: "nt-time-zone",
  timeZoneMode: "nt-time-zone-mode",
  weekStartsOn: "nt-week-starts-on",
  unitSystem: "nt-unit-system",
  energyUnit: "nt-energy-unit",
  hourCycle: "nt-hour-cycle",
  theme: "nt-theme",
  reduceMotion: "nt-reduce-motion"
} as const;

export type PreferenceCookieName = (typeof preferenceCookieNames)[keyof typeof preferenceCookieNames];

export function detectLocale(language?: string | null): AppLocale {
  return language?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function defaultPreferences(input: { language?: string | null; timeZone?: string | null } = {}): AppPreferences {
  return {
    locale: input.language ? detectLocale(input.language) : DEFAULT_LOCALE,
    timeZone: resolveTimeZone(input.timeZone ?? DEFAULT_TIME_ZONE),
    timeZoneMode: "auto",
    weekStartsOn: 1,
    unitSystem: "metric",
    energyUnit: "kcal",
    hourCycle: "h23",
    theme: "system",
    reduceMotion: null
  };
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && options.includes(value as T) ? value as T : fallback;
}

export function preferencesFromRow(row: Record<string, unknown>, detected = defaultPreferences()): AppPreferences {
  const timeZoneMode = oneOf(row.time_zone_mode, ["auto", "fixed"] as const, detected.timeZoneMode);
  const savedTimeZone = typeof row.time_zone === "string" ? row.time_zone : detected.timeZone;
  const timeZone = timeZoneMode === "auto" ? resolveTimeZone(detected.timeZone) : resolveTimeZone(savedTimeZone);
  const weekStartsOn = Number(row.week_starts_on);

  return {
    locale: oneOf(row.locale, ["zh-CN", "en"] as const, detected.locale),
    timeZone,
    timeZoneMode,
    weekStartsOn: Number.isInteger(weekStartsOn) && weekStartsOn >= 0 && weekStartsOn <= 6 ? weekStartsOn : 1,
    unitSystem: oneOf(row.unit_system, ["metric", "imperial"] as const, detected.unitSystem),
    energyUnit: oneOf(row.energy_unit, ["kcal", "kj"] as const, detected.energyUnit),
    hourCycle: oneOf(row.hour_cycle, ["h12", "h23"] as const, detected.hourCycle),
    theme: oneOf(row.theme, ["system", "light", "dark"] as const, detected.theme),
    reduceMotion: typeof row.reduce_motion === "boolean" ? row.reduce_motion : null
  };
}

export function preferencesToRow(preferences: AppPreferences) {
  return {
    locale: preferences.locale,
    time_zone: preferences.timeZone,
    time_zone_mode: preferences.timeZoneMode,
    week_starts_on: preferences.weekStartsOn,
    unit_system: preferences.unitSystem,
    energy_unit: preferences.energyUnit,
    hour_cycle: preferences.hourCycle,
    theme: preferences.theme,
    reduce_motion: preferences.reduceMotion
  };
}

export function preferencesFromCookies(values: Partial<Record<PreferenceCookieName, string>>): AppPreferences {
  const fallback = defaultPreferences();
  const cookieTimeZone = resolveTimeZone(values[preferenceCookieNames.timeZone] ?? fallback.timeZone);
  const reduceMotionValue = values[preferenceCookieNames.reduceMotion];
  return preferencesFromRow(
    {
      locale: values[preferenceCookieNames.locale],
      time_zone: values[preferenceCookieNames.timeZone],
      time_zone_mode: values[preferenceCookieNames.timeZoneMode],
      week_starts_on: values[preferenceCookieNames.weekStartsOn],
      unit_system: values[preferenceCookieNames.unitSystem],
      energy_unit: values[preferenceCookieNames.energyUnit],
      hour_cycle: values[preferenceCookieNames.hourCycle],
      theme: values[preferenceCookieNames.theme],
      reduce_motion: reduceMotionValue == null || reduceMotionValue === "system"
        ? null
        : reduceMotionValue === "true"
          ? true
          : reduceMotionValue === "false"
            ? false
            : null
    },
    { ...fallback, timeZone: cookieTimeZone }
  );
}

export function preferenceCookieValues(preferences: AppPreferences): Record<PreferenceCookieName, string> {
  return {
    [preferenceCookieNames.locale]: preferences.locale,
    [preferenceCookieNames.timeZone]: preferences.timeZone,
    [preferenceCookieNames.timeZoneMode]: preferences.timeZoneMode,
    [preferenceCookieNames.weekStartsOn]: String(preferences.weekStartsOn),
    [preferenceCookieNames.unitSystem]: preferences.unitSystem,
    [preferenceCookieNames.energyUnit]: preferences.energyUnit,
    [preferenceCookieNames.hourCycle]: preferences.hourCycle,
    [preferenceCookieNames.theme]: preferences.theme,
    [preferenceCookieNames.reduceMotion]: preferences.reduceMotion == null ? "system" : String(preferences.reduceMotion)
  };
}

export function displayWeight(kg: number, unitSystem: UnitSystem): number {
  return unitSystem === "imperial" ? kg * 2.2046226218 : kg;
}

export function canonicalWeight(value: number, unitSystem: UnitSystem): number {
  return unitSystem === "imperial" ? value / 2.2046226218 : value;
}

export function displayLength(cm: number, unitSystem: UnitSystem): number {
  return unitSystem === "imperial" ? cm / 2.54 : cm;
}

export function canonicalLength(value: number, unitSystem: UnitSystem): number {
  return unitSystem === "imperial" ? value * 2.54 : value;
}

export function displayEnergy(kcal: number, energyUnit: EnergyUnit): number {
  return energyUnit === "kj" ? kcal * 4.184 : kcal;
}

export function canonicalEnergy(value: number, energyUnit: EnergyUnit): number {
  return energyUnit === "kj" ? value / 4.184 : value;
}
