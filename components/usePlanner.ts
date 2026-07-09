"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { createStarterMeals, defaultProfile } from "@/lib/demoState";
import { createCustomFood, customFoodsFromMeals } from "@/lib/foods";
import { buildNutritionResult, createDefaultMeals, getDefaultMealEntrySettings, normalizeMealRatios, round } from "@/lib/nutrition";
import { loadPlannerDraft, savePlan, savePlannerDraft } from "@/lib/storage";
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
  PlannerDraft,
  PlannerTemplates,
  SavedPlan,
  UserProfile
} from "@/lib/types";

export interface UsePlannerArgs {
  foods: FoodItem[];
  templates: PlannerTemplates;
  user: User | null;
  onTemplatesChanged: (templates: PlannerTemplates) => void;
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
  persistPlan: () => Promise<void>;
  normalizeRatios: () => void;
  /** 模板只记食物；名字自动生成（分类→拼音 · 连接，无编号），同名直接拒绝创建。 */
  saveMealTemplate: (meal: MealPlan) => void;
  applyMealTemplate: (mealId: string, templateId: string) => void;
  saveDayTemplate: () => void;
  applyDayTemplate: (templateId: string) => void;
}

/**
 * 计划器控制器：把「当天计划」与「分餐计划」两页共享的 profile/meals 状态、云端草稿水合/自动保存、
 * 一键应用/去分餐载入、以及所有编辑动作集中到一个 hook。AppShell 只调用一次，两页读同一份状态。
 */
export function usePlanner({ foods, templates, user, onTemplatesChanged, applyRequest, openDateRequest }: UsePlannerArgs): PlannerController {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [meals, setMeals] = useState<MealPlan[]>(() => createStarterMeals(defaultProfile));
  const [activeMealId, setActiveMealId] = useState(meals[0]?.id ?? "");
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  // 食物解析链 = 食物库 + 当前计划里内嵌的临时自定义食物，求解器与展示共用同一份。
  const allFoods = useMemo(() => [...foods, ...customFoodsFromMeals(meals)], [foods, meals]);
  const foodsById = useMemo(() => new Map(allFoods.map((food) => [food.id, food])), [allFoods]);
  const result = useMemo(() => buildNutritionResult(profile, meals, allFoods), [allFoods, meals, profile]);
  const recommendationsByMeal = useMemo(
    () => new Map(result.mealRecommendations.map((recommendation) => [recommendation.mealId, recommendation])),
    [result.mealRecommendations]
  );

  useEffect(() => {
    let mounted = true;
    const hydrate = (draft: PlannerDraft | null) => {
      if (!mounted) {
        return;
      }
      const nextProfile = draft?.profile ?? { ...defaultProfile, planDate: new Date().toISOString().slice(0, 10) };
      setProfile(nextProfile);
      const nextMeals = draft?.meals ?? createStarterMeals(nextProfile);
      setMeals(nextMeals);
      // 重新水合时尽量保留用户当前停留的餐次：仅当原餐次已不存在才回到第一餐，
      // 避免（例如登录态刷新触发的）重水合把分餐切回早餐。
      setActiveMealId((current) => (nextMeals.some((meal) => meal.id === current) ? current : nextMeals[0]?.id ?? ""));
      setHydrated(true);
    };

    // 草稿仅存 Supabase（按账户）。未登录时用默认起始计划，不读写云端。
    if (!user) {
      hydrate(null);
      return () => {
        mounted = false;
      };
    }

    setHydrated(false);
    loadPlannerDraft(user)
      .then(hydrate)
      .catch(() => hydrate(null));
    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!hydrated || !user) {
      return;
    }
    // 自动保存到 Supabase 草稿：防抖 1.2s，避免每次微调克重都打库。
    const handle = window.setTimeout(() => {
      savePlannerDraft(profile, meals, user).catch(() => {});
    }, 1200);
    return () => window.clearTimeout(handle);
  }, [hydrated, meals, profile, user]);

  // 模板页「一键应用」：nonce 变化时把模板餐食载入当前计划。
  useEffect(() => {
    if (!applyRequest || applyRequest.meals.length === 0) {
      return;
    }
    setMeals(applyRequest.meals);
    setActiveMealId(applyRequest.meals[0]?.id ?? "");
    setMessage("已从模板应用全天餐食，可继续微调或保存。");
  }, [applyRequest]);

  // 安排日历「去分餐」：nonce 变化时按指定日期载入——有已存计划则载入，否则新建该日空计划。
  useEffect(() => {
    if (!openDateRequest) {
      return;
    }
    const { date, plan } = openDateRequest;
    const nextProfile = plan?.profile ?? { ...defaultProfile, planDate: date };
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
      // 仅训练时间影响餐结构（休息日=3餐、训练日=4餐含训练前加餐）；碳循环日只改宏量配比，不动餐数。
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
          maxGrams: defaults.maxGrams
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
          customFood: { ...draft, name: food.name }
        }
      ]
    }));
    setMessage(`已添加自定义食物：${food.name}（${round(food.kcalPer100g, 0)} kcal/100g）。`);
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
    setSaving(true);
    setMessage("");
    try {
      await savePlan(profile, meals, result, user);
      // 同步把当前状态立即刷入草稿（不等 1.2s 防抖），确保保存后立刻刷新页面也能恢复，
      // 而不是回落默认。草稿写失败不影响“计划已保存”（daily_plans 已成功）。
      if (user) {
        await savePlannerDraft(profile, meals, user).catch(() => {});
      }
      setMessage("计划已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }

  function normalizeRatios() {
    setMeals((current) => normalizeMealRatios(current));
  }

  function saveMealTemplate(meal: MealPlan) {
    const refs = templateRefsFromEntries(meal.entries);
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
    const dayMeals = meals.map((meal) => ({
      id: meal.id,
      name: meal.name,
      ratio: meal.ratio,
      foods: templateRefsFromEntries(meal.entries)
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
