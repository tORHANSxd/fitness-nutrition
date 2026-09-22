"use client";

import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadBodyLogs, mergeLatestBodyMetrics, type BodyLog } from "@/lib/bodyLogs";
import { createStarterMeals, defaultProfile, emptyProfile } from "@/lib/demoState";
import { createCustomFood, customFoodsFromMeals } from "@/lib/foods";
import { foodSnapshotFromFood } from "@/lib/foodSnapshots";
import { todayKey } from "@/lib/dateTime";
import { mealMetadata, protocolMeals, resolveProtocol, UnsupportedDocumentError } from "@/lib/planProtocol";
import { loadPlanProtocols } from "@/lib/protocolStorage";
import { exportPlanDocument, importPlanDocument } from "@/lib/planTransfer";
import { nutritionInputFingerprint } from "@/lib/nutritionGoals/calculator";
import { allocateMealLayout, configureMealLayout, mealLayoutDraft, type MealLayoutSlot } from "@/lib/mealLayout";
import { buildNutritionResult, createDefaultMeals, getDefaultMealEntrySettings, normalizeMealRatios, round } from "@/lib/nutrition";
import { displayEnergy, type EnergyUnit } from "@/lib/preferences";
import { loadPlannerDraft, PlannerDraftConflictError, savePlan, savePlannerDraft } from "@/lib/storage";
import {
  buildTemplateName,
  materializeDayTemplate,
  materializeTemplateEntries,
  templateNameExists,
  templateRefsFromEntries
} from "@/lib/templates";
import type {
  CustomFoodDraft,
  DayTemplate,
  FoodItem,
  MealFoodEntry,
  MealPlan,
  MealTemplate,
  NutritionResult,
  PlanProtocol,
  PlannerTemplates,
  SavedPlan,
  UserProfile
} from "@/lib/types";

export interface UsePlannerArgs {
  suspendWrites?: boolean;
  foods: FoodItem[];
  templates: PlannerTemplates;
  user: User | null;
  timeZone: string;
  energyUnit?: EnergyUnit;
  onTemplatesChanged: (templates: PlannerTemplates) => void;
  validateNumericDrafts?: () => boolean;
  /** 从模板页「一键应用」传入的全天餐食；nonce 变化时载入到当前计划。 */
  applyRequest?: { meals: MealPlan[]; includesMealLayout?: boolean; nonce: number } | null;
  /** 从安排日历「去分餐」传入指定日期与该日已存计划；nonce 变化时按该日载入。 */
  openDateRequest?: { date: string; plan: SavedPlan | null; nonce: number } | null;
}

export interface PlannerController {
  canUndo?: boolean;
  undoLastChange?: () => void;
  replaceMeals?: (meals: MealPlan[]) => void;
  exportDocument?: () => string | null;
  importDocument?: (text: string) => void;
  applyProtocol?: (protocol: PlanProtocol) => void;
  rawDocument?: unknown;
  profile: UserProfile;
  meals: MealPlan[];
  activeMealId: string;
  message: string;
  saving: boolean;
  draftState: PlannerDraftState;
  result: NutritionResult;
  foodsById: Map<string, FoodItem>;
  recommendationsByMeal: Map<string, NutritionResult["mealRecommendations"][number]>;
  setActiveMealId: (mealId: string) => void;
  updateProfile: <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => void;
  updateMeal: (mealId: string, mapper: (meal: MealPlan) => MealPlan) => void;
  updateMealLayout: (slots: MealLayoutSlot[]) => boolean;
  addFoodToMeal: (mealId: string, foodId: string) => void;
  /** 临时自定义食物：三大营养素/100g 自由填，热量自动 4/4/9；随计划保存，不进食物库。 */
  addCustomFoodToMeal: (mealId: string, draft: CustomFoodDraft) => void;
  updateEntry: (mealId: string, entryId: string, mapper: (entry: MealFoodEntry) => MealFoodEntry) => void;
  removeEntry: (mealId: string, entryId: string) => void;
  applyRecommendations: () => void;
  persistPlan: () => Promise<boolean>;
  normalizeRatios: () => void;
  /** 模板只记食物；名字自动生成（分类→拼音 · 连接，无编号），同名直接拒绝创建。 */
  saveMealTemplate: (meal: MealPlan) => void;
  applyMealTemplate: (mealId: string, templateId: string) => void;
  saveDayTemplate: (name?: string) => void;
  applyDayTemplate: (templateId: string) => void;
}

export type PlannerDraftState = "loading" | "ready" | "empty" | "dirty" | "saving" | "saved" | "conflict" | "error";

/**
 * 计划器控制器：把「当天计划」与「分餐计划」两页共享的 profile/meals 状态、云端草稿水合/自动保存、
 * 一键应用/去分餐载入、以及所有编辑动作集中到一个 hook。AppShell 只调用一次，两页读同一份状态。
 */
export function usePlanner({ foods, templates, user, timeZone, energyUnit = "kcal", onTemplatesChanged, validateNumericDrafts, applyRequest, openDateRequest, suspendWrites = false }: UsePlannerArgs): PlannerController {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [meals, setMeals] = useState<MealPlan[]>(() => createStarterMeals(defaultProfile));
  const [undoState, setUndoState] = useState<{ meals: MealPlan[]; profile: UserProfile } | null>(null);
  useEffect(() => { setUndoState(null); }, [profile.planDate]);
  const [activeMealId, setActiveMealId] = useState(meals[0]?.id ?? "");
  const [hydrated, setHydrated] = useState(false);
  const [openedDate, setOpenedDate] = useState<UsePlannerArgs["openDateRequest"]>(null);
  const appliedTemplateRef = useRef<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [draftState, setDraftState] = useState<PlannerDraftState>("loading");
  const [autosaveEnabled, setAutosaveEnabled] = useState(false);
  const [rawDocument, setRawDocument] = useState<unknown>();
  const protocolsRef = useRef<PlanProtocol[]>([]);
  const autosaveEnabledRef = useRef(false);
  const draftRevisionRef = useRef<number | null>(null);
  const draftSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const draftChangeRef = useRef(0);
  const draftSessionRef = useRef(0);
  const skipAutosaveRef = useRef(true);
  const hydratedDraftDateRef = useRef<string | null>(null);
  const frozenDatesRef = useRef(new Set<string>());
  // 食物解析链 = 食物库 + 当前计划里内嵌的临时自定义食物，求解器与展示共用同一份。
  const allFoods = useMemo(() => [...customFoodsFromMeals(meals), ...foods], [foods, meals]);
  const foodsById = useMemo(() => new Map(allFoods.map((food) => [food.id, food])), [allFoods]);
  const result = useMemo(() => buildNutritionResult(profile, meals, allFoods), [allFoods, meals, profile]);
  // 供 openDateRequest 等一次性事件读取"当下档案"而不把 profile 拉进依赖（避免重复触发）。
  const profileRef = useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  const recommendationsByMeal = useMemo(
    () => new Map(result.mealRecommendations.map((recommendation) => [recommendation.mealId, recommendation])),
    [result.mealRecommendations]
  );

  const applyTemplateMeals = useCallback((incoming: MealPlan[], includesMealLayout = false): boolean => {
    try {
      if (suspendWrites || rawDocument != null || (user && !autosaveEnabledRef.current)) throw new Error("当前草稿不可写，请先完成载入或处理冲突。");
      if (validateNumericDrafts && !validateNumericDrafts()) throw new Error("请先修正标红的数字，再应用模板。");
      if (includesMealLayout) {
        if (meals.some(meal => meal.locked || meal.entries.some(entry => entry.locked))) throw new Error("应用完整模板会替换当前餐食，请先解锁当前餐次和食物。");
        const next = configureMealLayout(incoming, mealLayoutDraft(incoming), result.dailyTarget);
        setMeals(next);
        setProfile(current => ({ ...current, allocationMode: "explicitMacros" }));
      } else if (profile.allocationMode === "explicitMacros") {
        if (incoming.length !== meals.length) throw new Error("旧食品模板餐数与当前计划不同，请逐餐应用食品模板。");
        setMeals(meals.map((meal, index) => ({ ...meal, entries: incoming[index].entries })));
      } else setMeals(incoming);
      setMessage(includesMealLayout ? "已恢复模板的餐数、餐名、分配和餐时；每日目标保持当前值，食品克重采用分类默认值。" : "已从旧模板应用全天餐食，可继续微调或保存。");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "应用模板失败。");
      return false;
    }
  }, [meals, profile.allocationMode, result.dailyTarget, suspendWrites, rawDocument, user, validateNumericDrafts]);

  useEffect(() => {
    let mounted = true;
    const session = draftSessionRef.current + 1;
    draftSessionRef.current = session;
    const hydrate = (
      nextProfile: UserProfile,
      nextMeals: MealPlan[],
      nextDraftState: PlannerDraftState,
      revision: number | null,
      enableAutosave: boolean,
    ) => {
      if (!mounted) {
        return;
      }
      setProfile(nextProfile);
      setMeals(nextMeals);
      // 重新水合时尽量保留用户当前停留的餐次：仅当原餐次已不存在才回到第一餐，
      // 避免（例如登录态刷新触发的）重水合把分餐切回早餐。
      setActiveMealId((current) => (nextMeals.some((meal) => meal.id === current) ? current : nextMeals[0]?.id ?? ""));
      draftRevisionRef.current = revision;
      autosaveEnabledRef.current = enableAutosave;
      skipAutosaveRef.current = true;
      setAutosaveEnabled(enableAutosave);
      setHydrated(true);
      setDraftState(nextDraftState);
    };
    const today = todayKey(timeZone);

    // 未登录（仅"未配置 Supabase"的演示模式会走到这）：demo 档案 + 示例餐。
    if (!user) {
      hydrate({ ...defaultProfile, planDate: today }, createStarterMeals(defaultProfile), "ready", null, false);
      return () => {
        mounted = false;
      };
    }

    setHydrated(false);
    frozenDatesRef.current.clear();
    setDraftState("loading");
    autosaveEnabledRef.current = false;
    setAutosaveEnabled(false);
    // 草稿与体测并行拉取：草稿为基底（新账号无草稿 → 空白档案，由用户自己填）；
    // 最新体测的体重/体脂覆盖档案对应字段——体测记录是这两项的真源。
    Promise.allSettled([loadPlannerDraft(user), loadBodyLogs(user, 60), loadPlanProtocols(user)]).then(
      ([draftResult, bodyLogsResult, protocolResult]) => {
        if (!mounted || session !== draftSessionRef.current) return;
        const bodyLogs = bodyLogsResult.status === "fulfilled" ? bodyLogsResult.value : [] as BodyLog[];
        if (draftResult.status === "rejected") {
          const fallbackProfile = mergeLatestBodyMetrics({ ...emptyProfile, planDate: today }, bodyLogs);
          hydrate(fallbackProfile, createDefaultMeals(fallbackProfile), "error", null, false);
          setMessage("云端草稿读取失败，已暂停自动保存，避免覆盖原数据。请刷新后重试。");
          if (draftResult.reason instanceof UnsupportedDocumentError) setRawDocument(draftResult.reason.rawDocument);
          return;
        }

        if (protocolResult.status === "rejected") {
          hydrate(draftResult.value?.profile ?? { ...emptyProfile, planDate: today }, draftResult.value?.meals ?? createDefaultMeals(emptyProfile), "error", draftResult.value?.revision ?? null, false);
          setMessage("执行协议读取失败，已暂停自动保存。请刷新后重试。");
          if (protocolResult.reason instanceof UnsupportedDocumentError) setRawDocument(protocolResult.reason.rawDocument);
          return;
        }
        protocolsRef.current = protocolResult.value;

        const draft = draftResult.value;
        hydratedDraftDateRef.current = draft?.profile.planDate ?? null;
        const base = draft?.profile ?? { ...emptyProfile, planDate: today };
        const nextProfile = mergeLatestBodyMetrics(base, bodyLogs);
        hydrate(
          nextProfile,
          draft?.meals ?? createDefaultMeals(nextProfile),
          draft ? "ready" : "empty",
          draft && draft.revision > 0 ? draft.revision : null,
          true,
        );
      }
    );
    return () => {
      mounted = false;
    };
  }, [timeZone, user]);

  useEffect(() => {
    if (!hydrated || !user || !autosaveEnabled || suspendWrites) {
      return;
    }
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }

    const changeId = draftChangeRef.current + 1;
    const session = draftSessionRef.current;
    draftChangeRef.current = changeId;
    setDraftState("dirty");
    // 自动保存到 Supabase 草稿：防抖 1.2s，同一标签页内串行写入 revision。
    const handle = window.setTimeout(() => {
      draftSaveQueueRef.current = draftSaveQueueRef.current.then(async () => {
        if (!autosaveEnabledRef.current || session !== draftSessionRef.current) return;
        setDraftState("saving");
        try {
          const saved = await savePlannerDraft(profile, meals, user, {
            expectedRevision: draftRevisionRef.current,
            force: false,
            foods: allFoods,
          });
          draftRevisionRef.current = saved.revision > 0 ? saved.revision : null;
          if (session === draftSessionRef.current) {
            setDraftState(changeId === draftChangeRef.current ? "saved" : "dirty");
          }
        } catch (error) {
          if (session !== draftSessionRef.current) return;
          if (error instanceof PlannerDraftConflictError) {
            autosaveEnabledRef.current = false;
            setAutosaveEnabled(false);
            setDraftState("conflict");
            setMessage("云端存在较新的草稿，已停止自动保存。请刷新后再继续编辑。");
          } else {
            setDraftState("error");
          }
        }
      });
    }, 1200);
    return () => window.clearTimeout(handle);
  }, [allFoods, autosaveEnabled, hydrated, meals, profile, suspendWrites, user]);

  // 安排日历「去分餐」：nonce 变化时按指定日期载入——有已存计划则载入；
  // 否则沿用**当前档案**只换日期新建（不再重置成 demo 默认档案）。
  useEffect(() => {
    if (!openDateRequest || !hydrated || suspendWrites || (user && !autosaveEnabledRef.current)) {
      return;
    }
    const { date, plan } = openDateRequest;
    if (plan) frozenDatesRef.current.add(date);
    // 同日云端草稿包含尚未手动保存的餐时/食物编辑，不能被旧计划覆盖。
    if (hydratedDraftDateRef.current === date && profileRef.current.planDate === date) {
      hydratedDraftDateRef.current = null;
      // 食物/时间草稿优先；目标使用已保存日期的冻结版本，未冻结日期解析生效协议。
      const next = plan?.profile ?? profileAtDate(profileRef.current, date);
      skipAutosaveRef.current = true;
      setProfile(next);
      if (next.protocolSnapshot?.id !== profileRef.current.protocolSnapshot?.id && next.protocolSnapshot) {
        const protocol = next.protocolSnapshot;
        setMeals(current => mealsForProtocol(protocol, current));
      }
      // Same-day custom meal allocation belongs to the draft, even before saving a plan.
      if (!next.protocolSnapshot && profileRef.current.allocationMode === "explicitMacros") setProfile({ ...next, allocationMode: "explicitMacros" });
      setOpenedDate(openDateRequest);
      return;
    }
    hydratedDraftDateRef.current = null;
    const nextProfile = plan?.profile ?? profileAtDate(profileRef.current, date);
    const nextMeals = plan?.meals ?? createDefaultMeals(nextProfile);
    // 浏览历史不是编辑行为，不把载入内容写回全局工作草稿。
    skipAutosaveRef.current = true;
    setProfile({ ...nextProfile, planDate: date });
    setMeals(nextMeals);
    setActiveMealId(nextMeals[0]?.id ?? "");
    setMessage(plan ? `已载入 ${date} 的已保存计划，可继续编辑。` : `正在新建 ${date} 的计划，保存后写入该日。`);
    setOpenedDate(openDateRequest);
  }, [openDateRequest, hydrated, suspendWrites, user]);

  // Wait for both hydration and the requested day, then consume the template once.
  useEffect(() => {
    if (!applyRequest) { appliedTemplateRef.current = null; return; }
    if (!hydrated || suspendWrites || (openDateRequest && openedDate !== openDateRequest)) return;
    const key = `${profile.planDate}:${applyRequest.nonce}`;
    if (appliedTemplateRef.current === key) return;
    appliedTemplateRef.current = key;
    if (applyTemplateMeals(applyRequest.meals, applyRequest.includesMealLayout)) {
      router.replace(`/today?date=${profile.planDate}&section=meals`, { scroll: false });
    }
  }, [applyRequest, applyTemplateMeals, hydrated, suspendWrites, openDateRequest, openedDate, profile.planDate, router]);

  useEffect(() => {
    if (meals.length === 0) {
      setActiveMealId("");
      return;
    }
    if (!meals.some((meal) => meal.id === activeMealId)) {
      setActiveMealId(meals[0].id);
    }
  }, [activeMealId, meals]);

  function syncMealShape(nextProfile: UserProfile) {
    if (nextProfile.targetMode === "calibrated" || nextProfile.allocationMode === "explicitMacros") return;
    const defaults = createDefaultMeals(nextProfile);
    setMeals((currentMeals) => {
      return defaults.map((defaultMeal) => {
        const existing = currentMeals.find((meal) => meal.id === defaultMeal.id);
        return {
          ...defaultMeal,
          locked: existing?.locked ?? false,
          entries: existing?.entries ?? []
        };
      });
    });
  }

  function updateProfile<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setUndoState(null);
    if (key === "planDate") {
      router.push(`/today?date=${encodeURIComponent(String(value))}`);
      return;
    }
    setProfile((current) => {
      const next = { ...current, [key]: value };
      // 仅训练时间影响餐结构（休息日=3餐、训练日=4餐含训练前加餐）；v2 目标字段不动餐数。
      if (key === "trainingTime") {
        queueMicrotask(() => syncMealShape(next));
      }
      return next;
    });
  }

  function updateMeal(mealId: string, mapper: (meal: MealPlan) => MealPlan) {
    setUndoState(null);
    setMeals((current) => current.map((meal) => (meal.id === mealId ? mapper(meal) : meal)));
  }

  function updateMealLayout(slots: MealLayoutSlot[]): boolean {
    try {
      if (suspendWrites || rawDocument != null || (user && !autosaveEnabledRef.current)) throw new Error("当前草稿不可写，请先完成载入或处理冲突。");
      if (validateNumericDrafts && !validateNumericDrafts()) throw new Error("请先修正标红的数字，再应用分餐设置。");
      const next = configureMealLayout(meals, slots, result.dailyTarget, new Map(result.mealRecommendations.map(meal => [meal.mealId, meal.target])));
      setUndoState({ meals, profile });
      setMeals(next);
      setProfile(current => ({ ...current, allocationMode: "explicitMacros" }));
      setMessage("分餐设置已应用；每餐目标按当前每日目标计算，已有食品克重和历史记录保留。");
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "分餐设置无效。"); return false; }
  }

  function addFoodToMeal(mealId: string, foodId: string) {
    const food = foodsById.get(foodId);
    if (!food) {
      return;
    }
    const meal = meals.find((item) => item.id === mealId);
    const defaults = getDefaultMealEntrySettings(food, meal);
    updateMeal(mealId, (meal) => ({
      ...meal,
      entries: [
        ...meal.entries,
        {
          id: crypto.randomUUID(),
          foodId,
          grams: defaults.grams,
          locked: false,
          minGrams: defaults.minGrams,
          maxGrams: defaults.maxGrams,
          foodSnapshot: foodSnapshotFromFood(food),
        }
      ]
    }));
  }

  function addCustomFoodToMeal(mealId: string, draft: CustomFoodDraft) {
    const food = createCustomFood(draft);
    const meal = meals.find((item) => item.id === mealId);
    const defaults = getDefaultMealEntrySettings(food, meal);
    updateMeal(mealId, (meal) => ({
      ...meal,
      entries: [
        ...meal.entries,
        {
          id: crypto.randomUUID(),
          foodId: food.id,
          grams: defaults.grams,
          locked: false,
          minGrams: defaults.minGrams,
          maxGrams: defaults.maxGrams,
          foodSnapshot: foodSnapshotFromFood(food),
          customFood: { ...draft, name: food.name }
        }
      ]
    }));
    setMessage(`已添加自定义食物：${food.name}（${round(displayEnergy(food.kcalPer100g, energyUnit), 0)} ${energyUnit === "kj" ? "kJ" : "kcal"}/100g）。`);
  }

  function updateEntry(mealId: string, entryId: string, mapper: (entry: MealFoodEntry) => MealFoodEntry) {
    updateMeal(mealId, (meal) => ({
      ...meal,
      entries: meal.entries.map((entry) => (entry.id === entryId ? mapper(entry) : entry))
    }));
  }

  function removeEntry(mealId: string, entryId: string) {
    updateMeal(mealId, (meal) => ({
      ...meal,
      entries: meal.entries.filter((entry) => entry.id !== entryId)
    }));
    setUndoState({ meals, profile });
    setMessage("食物已移除。");
  }

  function undoLastChange() {
    if (!undoState) return;
    setMeals(undoState.meals); setProfile(undoState.profile); setUndoState(null); setMessage("已撤销。");
  }

  function replaceMeals(next: MealPlan[]) {
    if (suspendWrites || rawDocument != null || !next.length || (validateNumericDrafts && !validateNumericDrafts())) return;
    setUndoState({ meals, profile });
    setMeals(structuredClone(next)); setActiveMealId(next[0].id); setMessage("餐食已载入，可撤销本次替换。");
  }

  function applyRecommendations() {
    setUndoState(null);
    setMeals((currentMeals) =>
      currentMeals.map((meal) => {
        if (meal.locked) {
          return meal;
        }
        const recommendation = recommendationsByMeal.get(meal.id);
        if (!recommendation) {
          return meal;
        }
        return {
          ...meal,
          entries: meal.entries.map((entry) => {
            if (entry.locked) {
              return entry;
            }
            return {
              ...entry,
              grams: round(recommendation.recommendedEntries[entry.id] ?? entry.grams, 1)
            };
          })
        };
      })
    );
    setMessage("已应用未锁定食物的推荐克重。");
  }

  async function persistPlan() {
    if (suspendWrites || rawDocument != null) { setMessage("文档尚未安全载入，已停止写入。"); return false; }
    if (validateNumericDrafts && !validateNumericDrafts()) {
      setMessage("请先修正标红的数字，再保存计划。");
      return false;
    }
    setSaving(true);
    setMessage("");
    try {
      await savePlan(profile, meals, result, user, allFoods);
      frozenDatesRef.current.add(profile.planDate);
      // 同步把当前状态立即刷入草稿（不等 1.2s 防抖），确保保存后立刻刷新页面也能恢复，
      // 而不是回落默认。草稿写失败不影响“计划已保存”（daily_plans 已成功）。
      if (user && autosaveEnabledRef.current) {
        try {
          const syncDraft = draftSaveQueueRef.current.then(() => savePlannerDraft(profile, meals, user, {
              expectedRevision: draftRevisionRef.current,
              force: false,
              foods: allFoods,
            }));
          draftSaveQueueRef.current = syncDraft.then(() => undefined, () => undefined);
          const savedDraft = await syncDraft;
          draftRevisionRef.current = savedDraft.revision > 0 ? savedDraft.revision : null;
          setDraftState("saved");
        } catch (error) {
          if (error instanceof PlannerDraftConflictError) {
            autosaveEnabledRef.current = false;
            setAutosaveEnabled(false);
            setDraftState("conflict");
            setMessage("计划已保存，但云端存在较新草稿；已停止草稿覆盖，请刷新后处理。");
            return true;
          }
          setDraftState("error");
          setMessage("计划已保存，但草稿同步失败；当前计划数据未丢失。");
          return true;
        }
      }
      setMessage("计划已保存。");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败。");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function normalizeRatios() {
    setMeals((current) => normalizeMealRatios(current));
  }

  function saveMealTemplate(meal: MealPlan) {
    if (validateNumericDrafts && !validateNumericDrafts()) {
      setMessage("请先修正标红的数字，再保存模板。");
      return;
    }
    const refs = templateRefsFromEntries(meal.entries, foodsById);
    const name = buildTemplateName(refs, foodsById);
    if (templateNameExists(templates.mealTemplates, name)) {
      setMessage(`已存在同名单餐模板「${name}」，未重复创建。`);
      return;
    }
    const template: MealTemplate = {
      ...mealMetadata(meal),
      id: crypto.randomUUID(),
      name,
      foods: refs,
      createdAt: new Date().toISOString()
    };
    onTemplatesChanged({
      ...templates,
      mealTemplates: [template, ...templates.mealTemplates]
    });
    setMessage(`已保存单餐模板：${template.name}`);
  }

  function applyMealTemplate(mealId: string, templateId: string) {
    const template = templates.mealTemplates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }
    updateMeal(mealId, (meal) => ({
      ...meal,
      ...mealMetadata(template),
      // 单餐应用不改变全天的宏量分配真源。
      targetAllocation: meal.targetAllocation ?? template.targetAllocation,
      entries: materializeTemplateEntries(template.foods, foodsById, meal)
    }));
    setMessage(`已套用单餐模板：${template.name}（克重为分类默认值，推荐会实时求解）。`);
  }

  function saveDayTemplate(customName?: string) {
    if (validateNumericDrafts && !validateNumericDrafts()) {
      setMessage("请先修正标红的数字，再保存模板。");
      return;
    }
    let allocation;
    try { allocation = allocateMealLayout(mealLayoutDraft(meals), result.dailyTarget); }
    catch (error) { setMessage(error instanceof Error ? error.message : "请先设置有效的分餐比例。"); return; }
    const dayMeals = meals.map((meal, index) => ({
      ...mealMetadata(meal),
      ...allocation[index],
      foods: templateRefsFromEntries(meal.entries, foodsById)
    }));
    const name = customName?.trim() || `${meals.length} 餐 · ${meals.map(meal => meal.name).join(" / ")}`.slice(0, 80);
    if (name.length > 80) { setMessage("模板名称最多 80 个字符。"); return; }
    if (templateNameExists(templates.dayTemplates, name)) {
      setMessage(`已存在同名全天模板「${name}」，未重复创建。`);
      return;
    }
    const template: DayTemplate = {
      includesMealLayout: true,
      id: crypto.randomUUID(),
      name,
      meals: dayMeals,
      createdAt: new Date().toISOString()
    };
    onTemplatesChanged({
      ...templates,
      dayTemplates: [template, ...templates.dayTemplates]
    });
    setMessage(`已保存全天模板：${template.name}`);
  }

  function applyDayTemplate(templateId: string) {
    setUndoState(null);
    const template = templates.dayTemplates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }
    const materialized = materializeDayTemplate(template, foodsById);
    applyTemplateMeals(materialized, template.includesMealLayout);
  }

  return {
    canUndo: undoState !== null,
    undoLastChange,
    replaceMeals,
    exportDocument,
    importDocument,
    applyProtocol,
    rawDocument,
    profile,
    meals,
    activeMealId,
    message,
    saving,
    draftState,
    result,
    foodsById,
    recommendationsByMeal,
    setActiveMealId,
    updateProfile,
    updateMeal,
    updateMealLayout,
    addFoodToMeal,
    addCustomFoodToMeal,
    updateEntry,
    removeEntry,
    applyRecommendations,
    persistPlan,
    normalizeRatios,
    saveMealTemplate,
    applyMealTemplate,
    saveDayTemplate,
    applyDayTemplate
  };

  function profileAtDate(base: UserProfile, date: string): UserProfile {
    const protocol = resolveProtocol(protocolsRef.current, date);
    const { protocolSnapshot: _protocol, targetMode: _mode, allocationMode: _allocation, scheduleOverride: _override, ...legacy } = base;
    if (!protocol) return { ...legacy, planDate: date };
    return { ...legacy, planDate: date, targetMode: "calibrated", allocationMode: "explicitMacros", protocolSnapshot: structuredClone(protocol) };
  }

  function applyProtocol(protocol: PlanProtocol) {
    setUndoState(null);
    protocolsRef.current = [...protocolsRef.current.filter((p) => p.id !== protocol.id), protocol];
    if (profile.planDate < protocol.effectiveFrom) { setMessage(`新协议将从 ${protocol.effectiveFrom} 生效，当前日期保持原计划。`); return; }
    if (frozenDatesRef.current.has(profile.planDate)) { setMessage(`新协议已保存；${profile.planDate} 已有冻结计划，仍使用原目标。新建未保存日期时使用生效协议。`); return; }
    setProfile(profileAtDate(profile, profile.planDate));
    setMeals(protocol.schemaVersion === 2 ? mealsForProtocol(protocol, meals) : protocolMeals(protocol));
    setActiveMealId(protocol.mealSlots[0].id);
    setMessage(protocol.schemaVersion === 2 ? "新目标已应用，餐次与食品保留，历史和实际记录未改写。" : "新协议已应用，原餐食历史保留；请为新计划选择食品。");
  }

  function exportDocument(): string | null {
    try {
      if (suspendWrites || rawDocument != null || (validateNumericDrafts && !validateNumericDrafts())) throw new Error("请先完成安全载入并修正数字，再导出计划。");
      return exportPlanDocument(profile, meals, result, foodsById);
    } catch (error) { setMessage(error instanceof Error ? error.message : "导出失败。"); return null; }
  }

  function importDocument(text: string) {
    setUndoState(null);
    try {
      if (suspendWrites || rawDocument != null || (user && !autosaveEnabledRef.current)) throw new Error("当前草稿不可写，请先刷新处理读取或版本冲突。");
      const imported = importPlanDocument(text);
      if (imported.planDate !== profile.planDate) throw new Error(`文件属于 ${imported.planDate}，请先打开该日期再导入。`);
      if (imported.profile.protocolSnapshot && !protocolsRef.current.some(p => nutritionInputFingerprint(p) === nutritionInputFingerprint(imported.profile.protocolSnapshot))) throw new Error("文件的协议与当前账户已有完整版本不一致，请先确认执行协议；当前计划未改变。");
      setProfile(imported.profile); setMeals(imported.meals); setActiveMealId(imported.meals[0]?.id ?? "");
      setMessage("已将文件载入计划草稿，请核对后保存计划。实际记录保持独立。");
    } catch (error) { setMessage(error instanceof Error ? error.message : "导入失败，当前计划未改变。"); }
  }
}

function mealsForProtocol(protocol: PlanProtocol, meals: MealPlan[]): MealPlan[] {
  return protocolMeals(protocol).map(slot => {
    const current = meals.find(m => m.id === slot.id);
    return { ...slot, locked: current?.locked ?? false, entries: current?.entries ?? [] };
  });
}
