import { createClient, type User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient } from "@/lib/supabase";
import { loadWorkoutSchedules } from "@/lib/scheduleStorage";

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn() }));
const user = { id: "10000000-0000-4000-8000-000000000071" } as User;
const fetchMock = vi.fn();
const row = {
  id: "20000000-0000-4000-8000-000000000071", session_date: "2026-01-02",
  day_kind: "training", protocol_id: null,
  prescription: { exercises: [{ exercise: "合成深蹲", sets: 3 }] },
  planned_start: "18:00", time_zone: "Asia/Shanghai", status: "planned",
  revision: 2, manually_edited: true,
};

beforeEach(() => {
  fetchMock.mockReset();
  // Real query builder, intercepted transport: this test never contacts Supabase.
  vi.mocked(getSupabaseClient).mockReturnValue(createClient("http://127.0.0.1:54321", "synthetic-test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchMock },
  }));
});

describe("workout schedule reads", () => {
  it("keeps all rendering fields while scoping the real REST query to the user/date range", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([row]), { status: 200 }));
    expect(await loadWorkoutSchedules(user, "2026-01-01", "2026-01-31")).toEqual([{
      id: row.id, sessionDate: row.session_date, dayKind: row.day_kind, protocolId: null,
      prescription: row.prescription, plannedStart: "18:00", timeZone: "Asia/Shanghai",
      status: "planned", revision: 2, manuallyEdited: true,
    }]);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/rest/v1/workout_schedules");
    expect(url.searchParams.get("user_id")).toBe(`eq.${user.id}`);
    expect(url.searchParams.getAll("session_date")).toEqual(["gte.2026-01-01", "lte.2026-01-31"]);
    expect(url.searchParams.get("order")).toBe("session_date.asc");
    expect(url.searchParams.get("select")!.split(",").sort()).toEqual(Object.keys(row).sort());
  });

  it("requires a user and never sends an anonymous query", async () => {
    await expect(loadWorkoutSchedules(null, "2026-01-01", "2026-01-31")).rejects.toThrow("请登录");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["42P01", "PGRST205"])("keeps pre-v4 missing-table compatibility for %s", async code => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code, message: "missing synthetic table" }), { status: 404 }));
    expect(await loadWorkoutSchedules(user, "2026-01-01", "2026-01-31")).toEqual([]);
  });

  it("surfaces other errors instead of silently treating failed reads as empty history", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: "42501", message: "permission denied" }), { status: 403 }));
    await expect(loadWorkoutSchedules(user, "2026-01-01", "2026-01-31")).rejects.toMatchObject({ code: "42501" });
  });
});
