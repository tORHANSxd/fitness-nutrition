import { describe, expect, it } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { createTreProtocol } from "@/lib/planPresets";
import { protocolMeals } from "@/lib/planProtocol";
import { emptyProfile } from "@/lib/demoState";
import { actualFastingMinutes, evaluateEatingSchedule, localInstant, plannedWindowMinutes, scheduleInstants, trainingIntakeGap } from "@/lib/eatingSchedule";
import type { MealEvent } from "@/lib/types";

const protocol = createTreProtocol({ id: "11111111-1111-4111-8111-111111111111", effectiveFrom: "2030-01-01", cycleAnchorDate: "2030-01-01", timeZone: "Asia/Shanghai" });
const event = (time?: string): MealEvent => ({ id: "synthetic", timeZone: "Asia/Shanghai", endedAt: time ? localInstant("2030-01-01", time, "Asia/Shanghai").toString() : undefined, actualFoodEntries: [], containsCalories: true, entryMethod: "estimated" });
describe("餐时与实际间隔", () => {
  it("T01/T02: 570分钟窗口、870分钟计划夜间与边界", () => {
    expect(plannedWindowMinutes(protocol.eatingWindow)).toBe(570);
    expect(1440 - plannedWindowMinutes(protocol.eatingWindow)).toBe(870);
    const start = localInstant("2030-01-01", "18:00", protocol.timeZone);
    expect(["14:59", "15:00", "15:01"].map((t) => trainingIntakeGap(start, [event(t)]).minutes)).toEqual([181, 180, 179]);
  });
  it("T03/T04: 改开练时间只生成预览；额外饮料重算间隔", () => {
    const meals = protocolMeals(protocol);
    const profile = { ...emptyProfile, planDate: "2030-01-01", trainingTime: "evening" as const, scheduleOverride: { trainingStartLocal: "17:30" } };
    const result = evaluateEatingSchedule(protocol, profile, meals, [event("15:00"), event("16:30")], Temporal.Instant.from("2030-01-01T00:00Z"));
    expect(result.cutoff?.toZonedDateTimeISO(protocol.timeZone).hour).toBe(14);
    expect(result.afternoonPreview).toEqual({ start: "14:00", end: "14:30", endDayOffset: 0 });
    expect(result.gap?.minutes).toBe(60);
    expect(meals[1].schedule?.end).toBe("15:00");
  });
  it("T05/T06/T07: 休息日无判断、缺失时间未知，超窗口事件保留", () => {
    const actual = [event("22:00")];
    const result = evaluateEatingSchedule(protocol, { ...emptyProfile, planDate: "2030-01-01", trainingTime: "rest" }, protocolMeals(protocol), actual, Temporal.Instant.from("2030-01-01T00:00Z"));
    expect(result.gap).toBeNull();
    expect(result.conflicts.join()).toContain("保留真实记录");
    expect(actual).toHaveLength(1);
    expect(actualFastingMinutes([event()], [event("11:30")])).toBeNull();
  });
  it("T08/T09: 跨午夜用显式偏移；DST重复/缺失钟点拒绝", () => {
    expect(scheduleInstants("2030-01-01", { start: "22:00", end: "02:00", endDayOffset: 1 }, "Pacific/Kiritimati").durationMinutes).toBe(240);
    expect(() => scheduleInstants("2030-01-01", { start: "22:00", end: "02:00", endDayOffset: 0 }, "Pacific/Kiritimati")).toThrow();
    expect(() => localInstant("2026-03-08", "02:30", "America/New_York")).toThrow("夏令时");
    expect(() => localInstant("2026-11-01", "01:30", "America/New_York")).toThrow("夏令时");
  });
});
