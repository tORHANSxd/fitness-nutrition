import { describe, expect, it } from "vitest";
import { syntheticGoalProtocol, syntheticPolicy } from "./helpers/nutritionGoalFixture";
import { reviewProgress } from "@/lib/progressReview";
import { emptyActualV3 } from "@/lib/actualIntake";
import { addDays } from "@/lib/dateTime";
import type { GoalPresetId } from "@/lib/nutritionGoals/types";
import type { BodyLog } from "@/lib/bodyLogs";
import type { DailyCheckin } from "@/lib/types";

function data(preset: GoalPresetId, days: number, weeklyPct = 0) {
  const protocol = syntheticGoalProtocol({ policy: syntheticPolicy(preset) });
  const logs: BodyLog[] = [], checkins: DailyCheckin[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(protocol.effectiveFrom, i);
    logs.push({ logDate: date, weightKg: 80 * (1 + weeklyPct / 100) ** Math.floor(i / 7), waistCm: 90 });
    checkins.push({ id: `synthetic-${i}`, planDate: date, target: protocol.dailyTarget, completed: true, createdAt: "", updatedAt: "", actual: {
      ...emptyActualV3({ version: 2, foods: [], exercises: [], bmrKcal: 0, activityKcal: 0, totalsSnapshot: protocol.dailyTarget }),
      targetProtocolSnapshot: protocol, intakeComplete: true, habits: { sleepHours: 8 }, recovery: { fatigue: 1, footPain: 0, trainingTolerance: "good", persistentSymptoms: false },
    } });
  }
  return { protocol, logs, checkins, end: addDays(protocol.effectiveFrom, days - 1) };
}
const review = (d: ReturnType<typeof data>) => reviewProgress(d.protocol, d.end, d.logs, d.checkins);

describe("v5 goal-aware reviews", () => {
  it("S01 recomp preserves energy with stable weight and falling waist", () => {
    const d = data("recomp", 28); d.logs.forEach((l, i) => { l.waistCm = 90 - i * .1; });
    expect(review(d)).toMatchObject({ status: "maintain", adjustmentKcal: null });
  });
  it("S02/S09 require long enough observation and do not count 14 days as two comparisons", () => {
    expect(review(data("lean_gain", 3)).status).toBe("insufficient_data");
    expect(review(data("lean_gain", 21)).status).toBe("insufficient_data");
    const r = review(data("cut_recomp", 14)); expect(r.status).toBe("insufficient_data"); expect(r.adjustmentKcal).toBeNull(); expect(r.windows).toHaveLength(2);
  });
  it("S03 incomplete and foreign-version actuals are not zero-calorie or reliable evidence", () => {
    const d = data("cut_recomp", 21);
    d.checkins[0].completed = false;
    const a = d.checkins[1].actual; if (a.version === 3) a.targetProtocolSnapshot = { ...d.protocol, id: "different-protocol" };
    const r = review(d); expect(r.status).toBe("review_intake"); expect(r.windows[0].intakeDays).toBe(5); expect(r.windows[0].meanIntake).toBe(d.protocol.dailyTarget.kcal);
  });
  it("S04 unknown recovery or symptoms never enlarge a deficit", () => {
    const d = data("cut_lean", 28);
    d.checkins.forEach(c => { if (c.actual.version === 3) delete c.actual.recovery; });
    expect(review(d)).toMatchObject({ status: "review_intake", recovery: "unknown", adjustmentKcal: null });
    const a = d.checkins.at(-1)!.actual; if (a.version === 3) a.recovery = { persistentSymptoms: true };
    expect(review(d)).toMatchObject({ status: "recovery_first", adjustmentKcal: null });
  });
  it("cut scenarios use percentage trends, preserve falling waist, require waist before reduction", () => {
    expect(review(data("cut_recomp", 28, -1))).toMatchObject({ status: "consider_increase", adjustmentKcal: 100 });
    expect(review(data("cut_lean", 28, -.35))).toMatchObject({ status: "maintain", adjustmentKcal: null });
    const d = data("cut_recomp", 21); d.logs.forEach(l => { l.waistCm = null; });
    expect(review(d)).toMatchObject({ status: "review_intake", adjustmentKcal: null });
    d.logs.forEach((l, i) => { l.waistCm = 90 - i * .1; }); expect(review(d).status).toBe("maintain");
  });
  it("lean gain needs 28 days; fast gain is not automatically called muscle", () => {
    expect(review(data("lean_gain", 28, 0))).toMatchObject({ status: "consider_increase", adjustmentKcal: 100 });
    expect(review(data("lean_gain", 28, .2))).toMatchObject({ status: "maintain", adjustmentKcal: null });
    expect(review(data("lean_gain", 28, .5))).toMatchObject({ status: "review_intake", adjustmentKcal: null });
  });
  it("maintenance does not continue the old cut step", () => {
    expect(review(data("maintain", 21, 0))).toMatchObject({ status: "maintain", adjustmentKcal: null });
  });
});
