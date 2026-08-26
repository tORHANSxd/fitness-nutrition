import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { mapWorkoutSessionRow, workoutSessionToRow } from "@/lib/supabase";
import type { WorkoutSession, WorkoutSet } from "@/lib/types";

const set: WorkoutSet = {
  id: "set-1",
  exercise: "深蹲",
  muscleGroup: "quads",
  weightKg: 100,
  reps: 5,
  rir: 2,
  isWarmup: false
};

const session: WorkoutSession = {
  id: "session-1",
  sessionDate: "2026-08-26",
  splitLabel: "腿",
  sets: [set],
  createdAt: "2026-08-26T00:00:00Z"
};

describe("workout session JSON documents", () => {
  it("writes v1 sets documents without a client timestamp", () => {
    const row = workoutSessionToRow(session, { id: "user-1" } as User);
    expect(row.sets).toEqual({ version: 1, sets: [set] });
    expect(row).not.toHaveProperty("updated_at");
  });

  it("reads both legacy arrays and current v1 documents", () => {
    const baseRow = {
      id: "session-1",
      session_date: "2026-08-26",
      split_label: "腿",
      bodyweight_kg: null,
      recovery: null,
      note: "",
      created_at: "2026-08-26T00:00:00Z"
    };
    expect(mapWorkoutSessionRow({ ...baseRow, sets: [set] }).sets).toEqual([set]);
    expect(mapWorkoutSessionRow({ ...baseRow, sets: { version: 1, sets: [set], ignored: true } }).sets).toEqual([set]);
  });

  it("rejects unsupported or damaged sets documents", () => {
    const row = { id: "session-1", session_date: "2026-08-26", split_label: "腿", created_at: "", sets: { version: 2, sets: [] } };
    expect(() => mapWorkoutSessionRow(row)).toThrow("不支持的训练组文档版本");
  });
});
