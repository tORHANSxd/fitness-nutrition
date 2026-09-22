import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { configureMealLayout } from "@/lib/mealLayout";
import { buildNutritionResult } from "@/lib/nutrition";
import { defaultProfile } from "@/lib/demoState";
import { createPlannerTemplate, loadPlannerTemplates } from "@/lib/storage";
import { getSupabaseClient } from "@/lib/supabase";
import { dayTemplateFromRow, materializeDayTemplate } from "@/lib/templates";
import { parsePlannerDraftRow } from "@/lib/storageDocuments";
import { exportPlanDocument, importPlanDocument } from "@/lib/planTransfer";
import { syntheticGoalProtocol } from "./helpers/nutritionGoalFixture";
import type { DayTemplate, UserProfile } from "@/lib/types";

vi.mock("@/lib/supabase", async importOriginal => ({ ...await importOriginal<object>(), getSupabaseClient: vi.fn() }));
const user = { id: "synthetic-template-user" } as User;
const goal = syntheticGoalProtocol();
const daily = goal.dailyTarget;
const slots = Array.from({ length: 5 }, (_, i) => ({ id: `synthetic-${i}`, name: `自定义餐${i + 1}`, weights: { protein: i + 1, carbs: 5 - i, fat: 1 } }));
const meals = configureMealLayout([], slots, daily);
meals[4].schedule = { start: "23:50", end: "00:10", endDayOffset: 1 };
const template: DayTemplate = { id: "synthetic-template", name: "五餐训练日", includesMealLayout: true, meals: meals.map(({ entries: _entries, locked: _locked, ...meal }) => ({ ...meal, foods: [] })), createdAt: "2026-01-01T00:00:00Z" };
let row: Record<string, unknown>;

beforeEach(() => {
  // Exercise the real storage writer and reader around a JSON-only transport double.
  const chain = {
    insert: vi.fn((value: Record<string, unknown>) => { row = JSON.parse(JSON.stringify({ ...value, created_at: template.createdAt })); return chain; }),
    select: vi.fn(() => chain), eq: vi.fn(() => chain),
    single: vi.fn(async () => ({ data: row, error: null })),
    order: vi.fn(async () => ({ data: [row], error: null }))
  };
  vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => chain) } as unknown as ReturnType<typeof getSupabaseClient>);
});

describe("完整分餐持久化", () => {
  it("真实 create/load mapper 往返保留模板标记、五餐、名称、独立份额和跨午夜餐时", async () => {
    expect(await createPlannerTemplate(template, user)).toEqual(template);
    expect(row.payload).toMatchObject({ version: 4, includesMealLayout: true });
    expect(row).toMatchObject({ user_id: user.id, schema_version: 4 });
    const restored = (await loadPlannerTemplates(user)).dayTemplates[0];
    expect(restored).toEqual(template);
    expect(materializeDayTemplate(restored, new Map())).toEqual(meals);
    expect(JSON.stringify(row.payload)).not.toContain("dailyTarget");
    expect(JSON.stringify(row.payload)).not.toContain("weightKg");
  });

  it.each(["legacy", "calibrated"] as const)("%s 草稿/保存计划/导入保持布局与每日目标", mode => {
    const profile: UserProfile = mode === "legacy" ? { ...defaultProfile, planDate: "2026-01-01", allocationMode: "explicitMacros" } : { ...defaultProfile, planDate: goal.effectiveFrom, targetMode: "calibrated", allocationMode: "explicitMacros", protocolSnapshot: goal };
    const result = buildNutritionResult(profile, meals, []);
    const draft = parsePlannerDraftRow(JSON.parse(JSON.stringify({ profile_snapshot: profile, meals, schema_version: 3, revision: 1, plan_date: profile.planDate })));
    expect(draft.meals).toEqual(meals);
    expect(draft.profile).toEqual(profile);
    const restored = importPlanDocument(exportPlanDocument(profile, meals, result, new Map()));
    expect(restored.meals).toEqual(meals);
    expect(restored.result.dailyTarget).toEqual(result.dailyTarget);
    if (mode === "calibrated") expect(restored.profile.protocolSnapshot?.mealSlots.length).toBe(3);
    const invalid = structuredClone(meals); invalid[0].targetAllocation!.carbs = 0.99;
    expect(() => parsePlannerDraftRow({ profile_snapshot: profile, meals: invalid, schema_version: 3, revision: 1 })).toThrow("100%");
  });

  it("完整模板拒绝缺份额、非法总和、餐名、重复 ID、非法餐数和 ratio，旧模板保持旧模式", () => {
    const row = { id: "bad", name: "bad", schema_version: 4, payload: { version: 4, includesMealLayout: true, meals: template.meals } };
    for (const change of [
      (v: typeof row) => { v.payload.meals = []; },
      (v: typeof row) => { v.payload.meals[0].targetAllocation = undefined; },
      (v: typeof row) => { v.payload.meals[0].targetAllocation!.fat = .9; },
      (v: typeof row) => { v.payload.meals[0].name = " "; },
      (v: typeof row) => { v.payload.meals[0].id = v.payload.meals[1].id; },
      (v: typeof row) => { v.payload.meals[0].ratio = -1; },
    ]) { const invalid = structuredClone(row); change(invalid); expect(dayTemplateFromRow(invalid)).toBeNull(); }
    const old = dayTemplateFromRow({ ...row, payload: { version: 4, meals: template.meals } });
    expect(old?.includesMealLayout).toBeUndefined();
    expect(old?.meals).toEqual(template.meals);
  });
});
