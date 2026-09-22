import { describe, expect, it } from "vitest";
import { emptyProfile } from "@/lib/demoState";
import { createTreProtocol } from "@/lib/planPresets";
import { assertDocument, parsePlanProtocol, protocolMeals, resolveProtocol, targetFromKcal, UnsupportedDocumentError } from "@/lib/planProtocol";
import { buildNutritionResult, calculateDailyTarget, createDefaultMeals, getTargetKcal } from "@/lib/nutrition";
import { normalizeUserProfile, parseMeals, parsePlannerDraftRow, parseSavedPlanRow } from "@/lib/storageDocuments";
import { dayTemplateFromRow, materializeDayTemplate } from "@/lib/templates";
import type { UserProfile } from "@/lib/types";

const protocol = createTreProtocol({ id: "11111111-1111-4111-8111-111111111111", effectiveFrom: "2030-01-02", cycleAnchorDate: "2030-01-03", timeZone: "Asia/Shanghai" });
const profile: UserProfile = { ...emptyProfile, planDate: "2030-01-03", targetMode: "calibrated", allocationMode: "explicitMacros", protocolSnapshot: protocol, carbTaperSteps: [{ date: "2029-12-01", deltaKcal: -300 }] };

describe("版本化目标与显式分餐", () => {
  it("N01/N02/N04/N05/N11: 没有体测也按唯一宏量目标运行，保留旧校准且休息日不漂移", () => {
    const meals = createDefaultMeals(profile);
    const result = buildNutritionResult(profile, meals, []);
    expect(getTargetKcal(profile)).toBe(2205);
    expect(result.dailyTarget).toEqual({ kcal: 2205, protein: 175, fat: 65, carbs: 230 });
    expect(result.mealRecommendations.map((m) => m.target.kcal)).toEqual([765, 675, 765]);
    expect(result.estimatesAvailable).toBe(false);
    expect(calculateDailyTarget({ ...profile, weightKg: 100, trainingTime: "rest" })).toEqual(result.dailyTarget);
    expect(createDefaultMeals({ ...profile, trainingTime: "rest" })).toEqual(meals);
    expect(profile.carbTaperSteps?.[0].deltaKcal).toBe(-300);
    expect(calculateDailyTarget(emptyProfile).kcal).toBe(0);
  });
  it("N03/N09: 残差碳水准确，不能以截零掩盖不可行目标", () => {
    expect(targetFromKcal(2200, 175, 65).carbs).toBe(228.75);
    expect(() => targetFromKcal(900, 175, 65)).toThrow("超过");
  });
  it("N06/N07: 不可行及锁定餐保持原目标，推荐不添加食物", () => {
    const meals = protocolMeals(protocol);
    meals[0].locked = true;
    const result = buildNutritionResult(profile, meals, []);
    expect(result.mealRecommendations[0].target.kcal).toBe(765);
    expect(result.mealRecommendations[0].deficit.kcal).toBe(765);
    expect(result.mealRecommendations.every((m) => Object.keys(m.recommendedEntries).length === 0)).toBe(true);
  });
  it("D01: 档案、餐次、草稿、历史和模板完整 JSON 往返", () => {
    const meals = protocolMeals(protocol);
    const result = buildNutritionResult(profile, meals, []);
    const roundtrip = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
    expect(normalizeUserProfile(roundtrip(profile))).toEqual(profile);
    expect(parseMeals(roundtrip(meals))).toEqual(meals);
    expect(parsePlannerDraftRow({ revision: 3, schema_version: 3, profile_snapshot: roundtrip(profile), meals }).profile.protocolSnapshot).toEqual(protocol);
    expect(parseSavedPlanRow({ schema_version: 3, profile, meals, result, id: "test", plan_date: profile.planDate }).meals).toEqual(meals);
    const template = dayTemplateFromRow({ id: "test", name: "测试模板", schema_version: 4, payload: { version: 4, meals: meals.map(({ entries: _entries, locked: _locked, ...meal }) => ({ ...meal, foods: [] })) } });
    expect(template).not.toBeNull();
    expect(materializeDayTemplate(template!, new Map())).toEqual(meals);
  });
  it("旧版和未知未来文档的边界", () => {
    const meals = createDefaultMeals(emptyProfile);
    const result = buildNutritionResult(emptyProfile, meals, []);
    expect(parseSavedPlanRow({ schema_version: 2, plan_date: "2030-01-03", profile: { ...emptyProfile, planDate: "2030-01-03" }, meals, result }).schemaVersion).toBe(2);
    const raw = { schema_version: 99, unknownFutureField: { important: true } };
    try { parseSavedPlanRow(raw); throw new Error("必须拒绝"); } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedDocumentError);
      expect((error as UnsupportedDocumentError).rawDocument).toBe(raw);
    }
    expect(() => assertDocument({ amount: NaN })).toThrow();
    expect(() => assertDocument({ amount: Infinity })).toThrow();
    expect(() => assertDocument({ text: "x".repeat(300000) })).toThrow("过大");
    expect(() => parsePlanProtocol({ ...protocol, effectiveFrom: "2030-02-30" })).toThrow();
    expect(() => parsePlanProtocol({ ...protocol, dailyTarget: { ...protocol.dailyTarget, kcal: 2200 } })).toThrow("不一致");
  });
  it("日期解析选择生效的版本，不修改旧快照", () => {
    const next = createTreProtocol({ id: "22222222-2222-4222-8222-222222222222", effectiveFrom: "2030-02-01", cycleAnchorDate: "2030-01-03", timeZone: "Asia/Shanghai", previous: protocol, target: targetFromKcal(2305, 175, 65) });
    expect(resolveProtocol([protocol, next], "2030-01-01")).toBeNull();
    expect(resolveProtocol([next, protocol], "2030-01-10")?.id).toBe(protocol.id);
    expect(resolveProtocol([protocol, next], "2030-02-01")?.id).toBe(next.id);
    expect(profile.protocolSnapshot?.dailyTarget.kcal).toBe(2205);
  });
});
