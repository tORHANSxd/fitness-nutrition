import { describe, expect, it } from "vitest";
import { applyHealthMetricToProfile, normalizeHealthPayload } from "@/lib/health";
import type { UserProfile } from "@/lib/types";

const fallback = "2026-07-02";

describe("normalizeHealthPayload", () => {
  it("parses Health Auto Export data.metrics format", () => {
    const payload = {
      data: {
        metrics: [
          { name: "weight_body_mass", units: "kg", data: [{ date: "2026-07-01 08:00:00 +0000", qty: 94.53 }] },
          { name: "active_energy", units: "kcal", data: [{ date: "2026-07-01 23:59:00 +0000", qty: 812.4 }] },
          { name: "resting_heart_rate", units: "bpm", data: [{ date: "2026-07-01 06:00:00 +0000", qty: 52 }] },
          { name: "heart_rate_variability", units: "ms", data: [{ date: "2026-07-01 06:00:00 +0000", qty: 61.2 }] }
        ]
      }
    };
    const result = normalizeHealthPayload(payload, fallback);
    expect(result).toHaveLength(1);
    expect(result[0].metricDate).toBe("2026-07-01");
    expect(result[0].weightKg).toBe(94.53);
    expect(result[0].activeEnergyKcal).toBe(812.4);
    expect(result[0].restingHr).toBe(52);
    expect(result[0].hrvMs).toBe(61.2);
  });

  it("accumulates same-day active energy and converts minute-based sleep to hours", () => {
    const payload = {
      data: {
        metrics: [
          { name: "active_energy", data: [{ date: "2026-07-01", qty: 300 }, { date: "2026-07-01", qty: 200 }] },
          { name: "sleep_analysis", data: [{ date: "2026-07-01", qty: 450 }] } // 450 分钟 → 7.5h
        ]
      }
    };
    const result = normalizeHealthPayload(payload, fallback);
    expect(result[0].activeEnergyKcal).toBe(500);
    expect(result[0].sleepHours).toBe(7.5);
  });

  it("parses a simple flat object and array", () => {
    const single = normalizeHealthPayload({ date: "2026-07-01", weightKg: 80, activeEnergyKcal: 600, steps: 12345 }, fallback);
    expect(single[0]).toMatchObject({ metricDate: "2026-07-01", weightKg: 80, activeEnergyKcal: 600, steps: 12345 });

    const many = normalizeHealthPayload(
      [
        { date: "2026-06-30", weight: 80.2 },
        { date: "2026-07-01", weight: 80.0 }
      ],
      fallback
    );
    expect(many).toHaveLength(2);
    expect(many.map((m) => m.metricDate)).toEqual(["2026-06-30", "2026-07-01"]);
  });

  it("falls back to today's date and drops empty payloads", () => {
    const noDate = normalizeHealthPayload({ weightKg: 75 }, fallback);
    expect(noDate[0].metricDate).toBe(fallback);
    expect(normalizeHealthPayload({ data: { metrics: [] } }, fallback)).toHaveLength(0);
    expect(normalizeHealthPayload({}, fallback)).toHaveLength(0);
  });
});

describe("applyHealthMetricToProfile", () => {
  const profile: UserProfile = {
    sex: "male",
    age: 30,
    heightCm: 180,
    weightKg: 80,
    activityFactor: 1.4,
    exerciseKcal: 300,
    workoutType: "legs",
    trainingTime: "afternoon",
    planDate: "2026-07-02"
  };

  it("maps weight and active energy into the profile, leaving other fields intact", () => {
    const next = applyHealthMetricToProfile(profile, { metricDate: "2026-07-01", weightKg: 94.53, activeEnergyKcal: 812.4 });
    expect(next.weightKg).toBe(94.5);
    expect(next.exerciseKcal).toBe(812);
    expect(next.age).toBe(30);
    expect(next.activityFactor).toBe(1.4);
  });

  it("keeps existing values when the metric lacks them", () => {
    const next = applyHealthMetricToProfile(profile, { metricDate: "2026-07-01", restingHr: 52 });
    expect(next.weightKg).toBe(80);
    expect(next.exerciseKcal).toBe(300);
  });
});
