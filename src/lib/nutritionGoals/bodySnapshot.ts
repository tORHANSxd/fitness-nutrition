import { Temporal } from "@js-temporal/polyfill";
import type { CalculationBodySnapshot } from "./types";
import type { BodyLog } from "@/lib/bodyLogs";
import { nutritionRules } from "./presets";

/** Dates and morning-weight confirmation are supplied by the caller, never inferred from the clock. */
export function resolveCalculationBodySnapshot(body: CalculationBodySnapshot, logs: BodyLog[], morningWeightsConfirmed: boolean): CalculationBodySnapshot {
  const snapshot = structuredClone(body);
  if (!morningWeightsConfirmed) return snapshot;
  const from = Temporal.PlainDate.from(body.calculationDate).subtract({ days: 6 }).toString();
  const byDate = new Map<string, number>();
  for (const log of logs) if (log.logDate >= from && log.logDate <= body.calculationDate && typeof log.weightKg === "number" && Number.isFinite(log.weightKg) && log.weightKg > 0) {
    try { Temporal.PlainDate.from(log.logDate); } catch { continue; }
    byDate.set(log.logDate, log.weightKg);
  }
  if (byDate.size >= nutritionRules.minWeightDays) {
    snapshot.weightKg = [...byDate.values()].reduce((a, b) => a + b, 0) / byDate.size;
    snapshot.weightDates = [...byDate.keys()].sort();
    snapshot.weightSource = "seven_day_mean";
  }
  return snapshot;
}
