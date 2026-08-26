"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadBodyLogs, mergeLatestBodyMetrics, type BodyLog } from "@/lib/bodyLogs";
import { createStarterMeals, defaultProfile, emptyProfile } from "@/lib/demoState";
import { createCustomFood, customFoodsFromMeals } from "@/lib/foods";
import { foodSnapshotFromFood } from "@/lib/foodSnapshots";
import { todayKey } from "@/lib/dateTime";
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
  PlannerTemplates,
  SavedPlan,
  UserProfile
} from "@/lib/types";

export interface UsePlannerArgs {
  foods: FoodItem[];
  templates: PlannerTemplates;
  user: User | null;
  timeZone: string;
  energyUnit?: EnergyUnit;
  onTemplatesChanged: (templates: PlannerTemplates) => void;
  validateNumericDrafts?: () => boolean;
  /** 从模板页「一键应用」传入的全天餐食；nonce 变化时载入到当前计划。 */
  applyRequest?: { meals: MealPlan[]; nonce: number } | null;
  /** 从安排日历「去分餐」传入指定日期与该日已存计划；nonce 变化时按该日载入。 */
  openDateRequest?: { date: string; plan: SavedPlan | null; nonce: number } | null;
}

export interface PlannerController {
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
  saveDayTemplate: () => void;
  applyDayTemplate: (templateId: string) => void;
}

export type PlannerDraftState = "loading" | "ready" | "empty" | "dirty" | "saving" | "saved" | "conflict" | "error";

/**
 * 计划器控制器：把「当天计划」与「分餐计划」两页共享的 profile/meals 状态、云端草稿水合/自动保存、
 * 一键应用/去分餐载入、以及所有编辑动作集中到一个 hook。AppShell 只调用一次，两页读同一份状态。
 */
export function usePlanner({ foods, templates, user, timeZone, energyUnit = "kcal", onTemplatesChanged, validateNumericDrafts, applyRequest, openDateRequest }: UsePlannerArgs): PlannerController {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [meals, setMeals] = useState<MealPlan[]>(() => createStarterMeals(defaultProfile));
  const [activeMealId, setActiveMealId] = useState(meals[0]?.id ?? "");
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [draftState, setDraftState] = useState<PlannerDraftState>("loading");
  const [autosaveEnabled, setAutosaveEnabled] = useState(false);
  const autosaveEnabledRef = useRef(false);
  const draftRevisionRef = useRef<number | null>(null);
  const draftSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const draftChangeRef = useRef(0);
  const draftSessionRef = useRef(0);
  const skipAutosaveRef = useRef(true);
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
    setDraftState("loading");
    autosaveEnabledRef.current = false;
    setAutosaveEnabled(false);
    // 草稿与体测并行拉取：草稿为基底（新账号无草稿 → 空白档案，由用户自己填）；
    // 最新体测的体重/体脂覆盖档案对应字段——体测记录是这两项的真源。
    Promise.allSettled([loadPlannerDraft(user), loadBodyLogs(user, 60)]).then(
      ([draftResult, bodyLogsResult]) => {
        if (!mounted || session !== draftSessionRef.current) return;
        const bodyLogs = bodyLogsResult.status === "fulfilled" ? bodyLogsResult.value : [] as BodyLog[];
        if (draftResult.status === "rejected") {
          const fallbackProfile = mergeLatestBodyMetrics({ ...emptyProfile, planDate: today }, bodyLogs);
          hydrate(fallbackProfile, createDefaultMeals(fallbackProfile), "error", null, false);
          setMessage("云端草稿读取失败，已暂停自动保存，避免覆盖原数据。请刷新后重试。");
          return;
        }

        const draft = draftResult.value;
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
    if (!hydrated || !user || !autosaveEnabled) {
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
  }, [allFoods, autosaveEnabled, hydrated, meals, profile, user]);

  // 模板页「一键应用」：nonce 变化时把模板餐食载入当前计划。
  useEffect(() => {
    if (!applyRequest || applyRequest.meals.length === 0) {
      return;
    }
    setMeals(applyRequest.meals);
    setActiveMealId(applyRequest.meals[0]?.id ?? "");
    setMessage("已从模板应用全天餐食，可继续微调或保存。");
  }, [applyRequest]);

  // 安排日历「去分餐」：nonce 变化时按指定日期载入——有已存计划则载入；
  // 否则沿用**当前档案**只换日期新建（不再重置成 demo 默认档案）。
  useEffect(() => {
    if (!openDateRequest) {
      return;
    }
    const { date, plan } = openDateRequest;
    const nextProfile = plan?.profile ?? profileRef.current;
    const nextMeals = plan?.meals ?? createDefaultMeals(nextProfile);
    setProfile({ ...nextProfile, planDate: date });
    setMeals(nextMeals);
    setActiveMealId(nextMeals[0]?.id ?? "");
    setMessage(plan ? `已载入 ${date} 的已保存计划，可继续编辑。` : `正在新建 ${date} 的计划，保存后写入该日。`);
  }, [openDateRequest]);

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
    setMeals((current) => current.map((meal) => (meal.id === mealId ? mapper(meal) : meal)));
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
  }

  function applyRecommendations() {
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
    if (validateNumericDrafts && !validateNumericDrafts()) {
      setMessage("请先修正标红的数字，再保存计划。");
      return false;
    }
    setSaving(true);
    setMessage("");
    try {
      await savePlan(profile, meals, result, user, allFoods);
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
      entries: materializeTemplateEntries(template.foods, foodsById, meal)
    }));
    setMessage(`已套用单餐模板：${template.name}（克重为分类默认值，推荐会实时求解）。`);
  }

  function saveDayTemplate() {
    if (validateNumericDrafts && !validateNumericDrafts()) {
      setMessage("请先修正标红的数字，再保存模板。");
      return;
    }
    const dayMeals = meals.map((meal) => ({
      id: meal.id,
      name: meal.name,
      ratio: meal.ratio,
      foods: templateRefsFromEntries(meal.entries, foodsById)
    }));
    const name = buildTemplateName(
      dayMeals.flatMap((meal) => meal.foods),
      foodsById
    );
    if (templateNameExists(templates.dayTemplates, name)) {
      setMessage(`已存在同名全天模板「${name}」，未重复创建。`);
      return;
    }
    const template: DayTemplate = {
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
    const template = templates.dayTemplates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }
    setMeals(materializeDayTemplate(template, foodsById));
    setMessage(`已套用全天模板：${template.name}（克重为分类默认值，推荐会实时求解）。`);
  }

  return {
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
}
