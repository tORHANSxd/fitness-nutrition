import { Temporal } from "@js-temporal/polyfill";
import { addDays, isDateKey } from "@/lib/dateTime";
import { parseMealSchedule, validTime, validZone } from "@/lib/planProtocol";
import type { MealEvent, MealPlan, MealSchedule, PlanProtocol, UserProfile } from "@/lib/types";

export function localInstant(date: string, time: string, timeZone: string): Temporal.Instant {
  if (!isDateKey(date)) throw new Error("业务日期无效。");
  validTime(time); validZone(timeZone);
  try {
    return Temporal.PlainDateTime.from(`${date}T${time}`).toZonedDateTime(timeZone, { disambiguation: "reject" }).toInstant();
  } catch { throw new Error("该本地钟点因夏令时不存在或重复，请选择明确、无歧义的时间。"); }
}

export function scheduleInstants(date: string, schedule: MealSchedule, timeZone: string) {
  const valid = parseMealSchedule(schedule);
  const start = localInstant(date, valid.start, timeZone);
  const end = localInstant(addDays(date, valid.endDayOffset), valid.end, timeZone);
  return { start, end, durationMinutes: start.until(end).total("minutes") };
}

export function plannedWindowMinutes(schedule: MealSchedule): number {
  const valid = parseMealSchedule(schedule);
  return Temporal.PlainTime.from(valid.start).until(Temporal.PlainTime.from(valid.end)).total("minutes") + valid.endDayOffset * 1440;
}

export function formatLocalClock(value: string, hourCycle: "h12" | "h23" = "h23", locale = "zh-CN"): string {
  validTime(value);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", hourCycle, timeZone: "UTC" }).format(new Date(`2000-01-01T${value}:00Z`));
}

export function actualFastingMinutes(previous: MealEvent[], current: MealEvent[]): number | null {
  const before = previous.filter((event) => event.containsCalories);
  const after = current.filter((event) => event.containsCalories);
  if (!before.length || !after.length || before.some((e) => !e.endedAt) || after.some((e) => !e.startedAt)) return null;
  const end = before.map((e) => Temporal.Instant.from(e.endedAt!)).sort(Temporal.Instant.compare).at(-1)!;
  const start = after.map((e) => Temporal.Instant.from(e.startedAt!)).sort(Temporal.Instant.compare)[0];
  const minutes = end.until(start).total("minutes");
  return minutes >= 0 ? minutes : null;
}

export function trainingIntakeGap(trainingStart: Temporal.Instant, events: MealEvent[]): { minutes: number | null; unknown: boolean } {
  const calories = events.filter((e) => e.containsCalories);
  if (calories.some((e) => !e.endedAt)) return { minutes: null, unknown: true };
  const preceding = calories.filter((e) => {
    const start = e.startedAt ? Temporal.Instant.from(e.startedAt) : Temporal.Instant.from(e.endedAt!);
    return Temporal.Instant.compare(start, trainingStart) <= 0;
  });
  if (!preceding.length) return { minutes: null, unknown: true };
  const last = preceding.map((e) => Temporal.Instant.from(e.endedAt!)).sort(Temporal.Instant.compare).at(-1)!;
  return { minutes: last.until(trainingStart).total("minutes"), unknown: false };
}

export function evaluateEatingSchedule(protocol: PlanProtocol, profile: UserProfile, meals: MealPlan[], events: MealEvent[], now: Temporal.Instant) {
  const date = profile.planDate;
  const window = profile.scheduleOverride?.eatingWindow ?? protocol.eatingWindow;
  const windowTimes = scheduleInstants(date, window, protocol.timeZone);
  const training = profile.trainingTime === "rest" ? null : localInstant(date, profile.scheduleOverride?.trainingStartLocal ?? protocol.trainingStartLocal, protocol.timeZone);
  const preference = profile.scheduleOverride?.preTrainingNoIntakeMinutes ?? protocol.preTrainingNoIntakeMinutes;
  const cutoff = training?.subtract({ minutes: preference }) ?? null;
  const conflicts: string[] = [];
  const planned = meals.flatMap((meal) => meal.schedule ? [{ meal, ...scheduleInstants(date, meal.schedule, protocol.timeZone) }] : []);
  for (const item of planned) {
    if (Temporal.Instant.compare(item.start, windowTimes.start) < 0 || Temporal.Instant.compare(item.end, windowTimes.end) > 0) conflicts.push(`${item.meal.name} 的计划餐时超出进食窗口。`);
    if (training && cutoff && Temporal.Instant.compare(item.start, training) < 0 && Temporal.Instant.compare(item.end, cutoff) > 0) conflicts.push(`${item.meal.name} 与训练前 ${preference} 分钟不进食偏好冲突。`);
  }
  for (const event of events.filter((e) => e.containsCalories)) {
    if ((event.startedAt && Temporal.Instant.compare(Temporal.Instant.from(event.startedAt), windowTimes.start) < 0)
      || (event.endedAt && Temporal.Instant.compare(Temporal.Instant.from(event.endedAt), windowTimes.end) > 0)) conflicts.push("有实际进食超出计划窗口，已保留真实记录。");
  }
  const gap = training ? trainingIntakeGap(training, events) : null;
  if (gap?.minutes != null && gap.minutes < preference) conflicts.push(`实际训练前间隔 ${gap.minutes} 分钟，短于个人偏好；允许如实记录额外进食。`);
  const nextMeal = planned.filter((m) => Temporal.Instant.compare(m.end, now) >= 0).sort((a, b) => Temporal.Instant.compare(a.start, b.start))[0]?.meal ?? null;
  const afternoon = planned.find((item) => item.meal.id === "afternoon-main");
  let afternoonPreview: MealSchedule | null = null;
  if (afternoon && cutoff && training && Temporal.Instant.compare(afternoon.start, training) < 0 && Temporal.Instant.compare(afternoon.end, cutoff) > 0) {
    const end = cutoff.toZonedDateTimeISO(protocol.timeZone);
    const start = cutoff.subtract({ minutes: afternoon.durationMinutes }).toZonedDateTimeISO(protocol.timeZone);
    if (start.toPlainDate().toString() === date && end.toPlainDate().toString() === date) afternoonPreview = { start: start.toPlainTime().toString({ smallestUnit: "minute" }), end: end.toPlainTime().toString({ smallestUnit: "minute" }), endDayOffset: 0 };
  }
  return { window, windowMinutes: plannedWindowMinutes(window), plannedNightMinutes: 1440 - plannedWindowMinutes(window), training, cutoff, gap, nextMeal, afternoonPreview, conflicts: [...new Set(conflicts)] };
}
