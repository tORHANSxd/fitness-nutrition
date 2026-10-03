import { Temporal } from "@js-temporal/polyfill";

export const DEFAULT_LOCALE = "zh-CN";
export const DEFAULT_TIME_ZONE = "Asia/Shanghai";

export type DateKey = `${number}-${number}-${number}`;

export function resolveTimeZone(timeZone?: string | null): string {
  if (timeZone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone }).format();
      return timeZone;
    } catch {
      // Fall through to the runtime zone when a stale profile value is invalid.
    }
  }

  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
}

export function toPlainDate(value: string | Temporal.PlainDate): Temporal.PlainDate {
  return typeof value === "string" ? Temporal.PlainDate.from(value) : value;
}

export function toDateKey(value: string | Temporal.PlainDate): DateKey {
  return toPlainDate(value).toString() as DateKey;
}

export function isDateKey(value: string | null | undefined): value is DateKey {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  try {
    return toDateKey(value) === value;
  } catch {
    return false;
  }
}

export function dateKeyFromInstant(
  value: Date | string | Temporal.Instant,
  timeZone = resolveTimeZone()
): DateKey {
  const instant = value instanceof Date
    ? Temporal.Instant.fromEpochMilliseconds(value.getTime())
    : typeof value === "string"
      ? Temporal.Instant.from(value)
      : value;
  return instant.toZonedDateTimeISO(resolveTimeZone(timeZone)).toPlainDate().toString() as DateKey;
}

export function todayKey(
  timeZone = resolveTimeZone(),
  now: Temporal.Instant = Temporal.Now.instant()
): DateKey {
  return now.toZonedDateTimeISO(resolveTimeZone(timeZone)).toPlainDate().toString() as DateKey;
}

export function addDays(dateKey: string, days: number): DateKey {
  return toPlainDate(dateKey).add({ days }).toString() as DateKey;
}

export function addMonths(dateKey: string, months: number): DateKey {
  return toPlainDate(dateKey).add({ months }).toString() as DateKey;
}

export function startOfWeek(dateKey: string, weekStartsOn = 1): DateKey {
  const date = toPlainDate(dateKey);
  const isoStart = weekStartsOn === 0 ? 7 : weekStartsOn;
  const daysSinceStart = (date.dayOfWeek - isoStart + 7) % 7;
  return date.subtract({ days: daysSinceStart }).toString() as DateKey;
}

export function endOfWeek(dateKey: string, weekStartsOn = 1): DateKey {
  return addDays(startOfWeek(dateKey, weekStartsOn), 6);
}

export function monthKey(dateKey: string): DateKey {
  const date = toPlainDate(dateKey);
  return date.with({ day: 1 }).toString() as DateKey;
}

export function monthGrid(dateKey: string, weekStartsOn = 1): DateKey[] {
  const monthStart = monthKey(dateKey);
  const gridStart = startOfWeek(monthStart, weekStartsOn);
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export function weekdayLabels(locale = DEFAULT_LOCALE, weekStartsOn = 1): string[] {
  const monday = "2026-08-24";
  const isoStart = weekStartsOn === 0 ? 7 : weekStartsOn;
  return Array.from({ length: 7 }, (_, index) => {
    const dayOfWeek = ((isoStart - 1 + index) % 7) + 1;
    return formatDateKey(addDays(monday, dayOfWeek - 1), locale, { weekday: "short" });
  });
}

export function dateKeyInRange(dateKey: string, from: string, to: string): boolean {
  const date = toPlainDate(dateKey);
  return Temporal.PlainDate.compare(date, toPlainDate(from)) >= 0
    && Temporal.PlainDate.compare(date, toPlainDate(to)) <= 0;
}

export function daysBetween(from: string, to: string): number {
  return toPlainDate(from).until(toPlainDate(to), { largestUnit: "day" }).days;
}

export function formatDateKey(
  dateKey: string,
  locale = DEFAULT_LOCALE,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" }
): string {
  const date = toPlainDate(dateKey);
  const utcDate = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(utcDate);
}

export function formatInstant(
  value: Date | string | Temporal.Instant,
  locale = DEFAULT_LOCALE,
  timeZone = resolveTimeZone(),
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }
): string {
  const date = value instanceof Date
    ? value
    : new Date(typeof value === "string" ? value : value.epochMilliseconds);
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: resolveTimeZone(timeZone) }).format(date);
}
