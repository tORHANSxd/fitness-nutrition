import { describe, expect, it } from "vitest";
import { bodyLogToRow, bodyMetricFields, filterLogsByRange, mapBodyLogRow, mergeLatestBodyMetrics, type BodyLog } from "@/lib/bodyLogs";
import { defaultProfile } from "@/lib/demoState";

describe("mergeLatestBodyMetrics（体测 → 计划档案联动）", () => {
  const log = (logDate: string, weightKg: number | null, bodyFatPct: number | null): BodyLog => ({ logDate, weightKg, bodyFatPct });

  it("用最新一条非空体重/体脂覆盖档案（体测是体重的真源）", () => {
    const logs = [log("2026-07-09", 91.8, null), log("2026-07-04", 93.2, 26), log("2026-06-20", 94.5, 27.5)];
    const merged = mergeLatestBodyMetrics(defaultProfile, logs);
    expect(merged.weightKg).toBe(91.8); // 最新体重（07-09）
    expect(merged.bodyFatPct).toBe(26); // 最新非空体脂（07-04，07-09 没量体脂）
  });

  it("没有体测记录时档案原样返回", () => {
    expect(mergeLatestBodyMetrics(defaultProfile, [])).toEqual(defaultProfile);
  });

  it("记录里既无体重也无体脂时不覆盖对应字段", () => {
    const merged = mergeLatestBodyMetrics(defaultProfile, [log("2026-07-09", null, null)]);
    expect(merged.weightKg).toBe(defaultProfile.weightKg);
    expect(merged.bodyFatPct).toBe(defaultProfile.bodyFatPct);
  });

  it("体脂率字段已注册进体测字段表（表单/折线自动生成）", () => {
    expect(bodyMetricFields.some((field) => field.key === "bodyFatPct" && field.unit === "%")).toBe(true);
  });
});

describe("body log row mapping (Supabase body_logs)", () => {
  it("maps a row to camelCase and back without losing measurements", () => {
    const row = {
      log_date: undefined,
      plan_date: "2026-07-09",
      weight_kg: "94.5",
      waist_cm: 92,
      chest_cm: 108,
      hip_cm: null,
      shoulder_cm: null,
      upper_arm_cm: 38.5,
      thigh_cm: 62,
      calf_cm: null
    };

    const log = mapBodyLogRow(row);
    expect(log.logDate).toBe("2026-07-09");
    expect(log.weightKg).toBe(94.5);
    expect(log.upperArmCm).toBe(38.5);
    expect(log.hipCm).toBeNull();

    const back = bodyLogToRow("user-1", log);
    expect(back.user_id).toBe("user-1");
    expect(back.plan_date).toBe("2026-07-09");
    expect(back.weight_kg).toBe(94.5);
    expect(back.hip_cm).toBeNull();
  });

  it("defines chart series for weight plus all circumference fields", () => {
    const keys = bodyMetricFields.map((field) => field.key);
    expect(keys).toContain("weightKg");
    expect(keys).toContain("waistCm");
    expect(keys).toContain("thighCm");
    expect(bodyMetricFields.every((field) => field.label.length > 0 && field.unit.length > 0)).toBe(true);
  });
});

describe("date range filtering for the chart", () => {
  const logs: BodyLog[] = [
    { logDate: "2026-01-01", weightKg: 100 },
    { logDate: "2026-06-20", weightKg: 96 },
    { logDate: "2026-07-05", weightKg: 95 },
    { logDate: "2026-07-09", weightKg: 94.5 }
  ];

  it("keeps only logs within the requested trailing window (inclusive)", () => {
    const last30 = filterLogsByRange(logs, 30, "2026-07-09");
    expect(last30.map((log) => log.logDate)).toEqual(["2026-06-20", "2026-07-05", "2026-07-09"]);

    const last7 = filterLogsByRange(logs, 7, "2026-07-09");
    expect(last7.map((log) => log.logDate)).toEqual(["2026-07-05", "2026-07-09"]);
  });

  it("returns everything sorted ascending for the 全部 range", () => {
    const all = filterLogsByRange([...logs].reverse(), "all", "2026-07-09");
    expect(all.map((log) => log.logDate)).toEqual(["2026-01-01", "2026-06-20", "2026-07-05", "2026-07-09"]);
  });
});
