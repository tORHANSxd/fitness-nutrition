"use client";

import type { User } from "@supabase/supabase-js";
import {
  Check,
  Lock,
  Plus,
  Save,
  Trash2,
  Unlock,
  Utensils,
  Wand2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MacroBars } from "@/components/MacroBars";
import { MetricCard } from "@/components/MetricCard";
import { HealthSyncPanel } from "@/components/HealthSyncPanel";
import { applyHealthMetricToProfile, type HealthMetric } from "@/lib/health";
import { defaultProfile, createStarterMeals } from "@/lib/demoState";
import {
  buildNutritionResult,
  carbDayLabels,
  carbCycleMacroSource,
  calculateFoodTotals,
  calculateMacroRatio,
  convertWeightLabel,
  createDefaultMeals,
  energyTargetSource,
  getDefaultMealEntrySettings,
  getMacroRatioCheck,
  getProteinPerKg,
  macroRatioCheckSource,
  normalizeMealRatios,
  round,
  trainingTimeLabels,
  workoutLabels
} from "@/lib/nutrition";
import { loadPlannerDraft, savePlan, savePlannerDraft } from "@/lib/storage";
import { buildAutoTemplateName } from "@/lib/templates";
import type {
  DayTemplate,
  FoodItem,
  MacroRatio,
  MacroTotals,
  MealFoodEntry,
  MealPlan,
  MealTemplate,
  PlannerDraft,
  PlannerTemplates,
  SavedPlan,
  UserProfile,
  WorkoutType
} from "@/lib/types";

interface NutritionPlannerProps {
  foods: FoodItem[];
  templates: PlannerTemplates;
  user: User | null;
  onFoodsChanged: () => Promise<void>;
  onTemplatesChanged: (templates: PlannerTemplates) => void;
  /** 从模板页「一键应用」传入的全天餐食；nonce 变化时载入到当前计划。 */
  applyRequest?: { meals: MealPlan[]; nonce: number } | null;
  /** 从安排日历「去分餐」传入指定日期与该日已存计划；nonce 变化时按该日载入。 */
  openDateRequest?: { date: string; plan: SavedPlan | null; nonce: number } | null;
}

export function NutritionPlanner({ foods, templates, user, onTemplatesChanged, applyRequest, openDateRequest }: NutritionPlannerProps) {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [meals, setMeals] = useState<MealPlan[]>(() => createStarterMeals(defaultProfile));
  const [activeMealId, setActiveMealId] = useState(meals[0]?.id ?? "");
  const [selectedDayTemplateId, setSelectedDayTemplateId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const foodsById = useMemo(() => new Map(foods.map((food) => [food.id, food])), [foods]);
  const result = useMemo(() => buildNutritionResult(profile, meals, foods), [foods, meals, profile]);
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
      if (key === "workoutType" || key === "trainingTime") {
        queueMicrotask(() => syncMealShape(next));
      }
      return next;
    });
  }

  function updateMeal(mealId: string, mapper: (meal: MealPlan) => MealPlan) {
    setMeals((current) => current.map((meal) => (meal.id === mealId ? mapper(meal) : meal)));
  }

  function addFoodToMeal(mealId: string) {
    const firstFood = foods[0];
    if (!firstFood) {
      return;
    }
    const meal = meals.find((item) => item.id === mealId);
    const defaults = getDefaultMealEntrySettings(firstFood, meal);
    updateMeal(mealId, (meal) => ({
      ...meal,
      entries: [
        ...meal.entries,
        {
          id: crypto.randomUUID(),
          foodId: firstFood.id,
          grams: defaults.grams,
          locked: false,
          minGrams: defaults.minGrams,
          maxGrams: defaults.maxGrams
        }
      ]
    }));
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

  function cloneEntries(entries: MealFoodEntry[]): MealFoodEntry[] {
    return entries.map((entry) => ({
      ...entry,
      id: crypto.randomUUID()
    }));
  }

  function cloneMealsForUse(sourceMeals: MealPlan[]): MealPlan[] {
    return sourceMeals.map((meal) => ({
      ...meal,
      entries: cloneEntries(meal.entries)
    }));
  }

  function persistTemplates(nextTemplates: PlannerTemplates) {
    onTemplatesChanged(nextTemplates);
  }

  function saveMealTemplate(meal: MealPlan, draftName?: string) {
    const sequence = templates.mealTemplates.length + 1;
    const trimmedName = draftName?.trim();
    const template: MealTemplate = {
      id: crypto.randomUUID(),
      name: trimmedName || buildAutoTemplateName(meal.entries, foodsById, sequence, `${meal.name}模板`),
      sourceMealName: meal.name,
      mealRatio: meal.ratio,
      mealLocked: meal.locked,
      entries: cloneEntries(meal.entries),
      createdAt: new Date().toISOString()
    };
    persistTemplates({
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
      ratio: template.mealRatio,
      locked: template.mealLocked,
      entries: cloneEntries(template.entries)
    }));
    setMessage(`已套用单餐模板：${template.name}`);
  }

  function saveDayTemplate(draftName?: string) {
    const sequence = templates.dayTemplates.length + 1;
    const trimmedName = draftName?.trim();
    const template: DayTemplate = {
      id: crypto.randomUUID(),
      name:
        trimmedName ||
        buildAutoTemplateName(
          meals.flatMap((meal) => meal.entries),
          foodsById,
          sequence,
          "全天模板"
        ),
      meals: cloneMealsForUse(meals),
      createdAt: new Date().toISOString()
    };
    persistTemplates({
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
    setMeals(cloneMealsForUse(template.meals));
    setMessage(`已套用全天模板：${template.name}`);
  }

  const activeMeal = meals.find((meal) => meal.id === activeMealId) ?? meals[0];

  return (
    <section className="animate-fade-up space-y-5">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="order-1 space-y-4 xl:order-2">
          <section className="panel overflow-hidden">
            {/* 指挥台顶栏：标题+碳日标签 左，主操作 右 */}
            <div className="border-b border-line bg-surface/80 px-5 py-3.5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-base font-semibold tracking-tight text-ink">今日指挥台</h2>
                  <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                    {carbDayLabels[result.carbDayType]}
                  </span>
                  <span className="hidden text-xs text-muted sm:inline">
                    {workoutLabels[profile.workoutType]} · {trainingTimeLabels[profile.trainingTime]} · {profile.planDate}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button className="btn-secondary h-9 px-3 text-xs" type="button" onClick={normalizeRatios}>
                    <Check size={14} />
                    归一比例
                  </button>
                  <button className="btn-cta h-9 px-3 text-xs" type="button" onClick={applyRecommendations}>
                    <Wand2 size={14} />
                    应用推荐
                  </button>
                  <button className="btn-primary h-9 px-3 text-xs" type="button" onClick={persistPlan} disabled={saving}>
                    <Save size={14} />
                    {saving ? "保存中" : "保存计划"}
                  </button>
                </div>
              </div>
            </div>

            {/* stat 网格：5 指标，无独立卡片投影，细线分隔（列数受限以免窄列内中文标签竖排/溢出）。
                每日目标热量已锚定 TDEE，故「当日目标」与「维持热量」一致——直观印证目标随消耗走。 */}
            <div className="grid grid-cols-2 border-l border-t border-line sm:grid-cols-3 xl:grid-cols-4">
              <div className="border-b border-r border-line px-4 py-3">
                <MetricCard label="BMR" value={result.bmr} unit="kcal" />
              </div>
              <div className="border-b border-r border-line px-4 py-3">
                <MetricCard label="维持热量" value={result.tdee} unit="kcal" tone="accent" />
              </div>
              <div className="border-b border-r border-line px-4 py-3">
                <MetricCard label="当日目标" value={result.dailyTarget.kcal} unit="kcal" tone="accent" />
              </div>
              <div className="border-b border-r border-line px-4 py-3">
                <MetricCard label="当前摄入" value={result.actualTotals.kcal} unit="kcal" />
              </div>
              <div className="border-b border-r border-line px-4 py-3">
                <MetricCard
                  label="剩余目标"
                  value={result.remaining.kcal}
                  unit="kcal"
                  tone={result.remaining.kcal < 0 ? "danger" : "normal"}
                />
              </div>
            </div>

            {/* 盈亏 + 宏比 + 周计划：在窄的右栏内纵向堆叠，避免横向三列挤压溢出 */}
            <div className="grid grid-cols-1 gap-3 border-t border-line p-4">
              <DailyBalancePanel
                actual={result.actualTotals}
                recommended={result.recommendedTotals}
                target={result.dailyTarget}
              />
              <MacroRatioPanel
                actualRatio={result.actualRatio}
                carbDayType={result.carbDayType}
                carbDayLabel={carbDayLabels[result.carbDayType]}
                recommendedRatio={calculateMacroRatio(result.recommendedTotals)}
                targetRatio={result.targetRatio}
              />
              <PlanRulePanel />
            </div>

            {message ? <p className="mx-4 mb-3 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent">{message}</p> : null}
            {result.conflicts.length > 0 ? (
              <div className="mx-4 mb-3 space-y-1.5">
                {result.conflicts.map((conflict) => (
                  <p key={conflict} className="rounded-lg border border-rose/20 bg-rose/10 px-4 py-2.5 text-sm text-rose">
                    {conflict}
                  </p>
                ))}
              </div>
            ) : null}
          </section>
          <MacroBars result={result} meals={meals} />
        </div>
        <div className="order-2 space-y-4 xl:order-1">
          <ProfilePanel profile={profile} updateProfile={updateProfile} />
          <HealthSyncPanel
            user={user}
            profile={profile}
            onApply={(metric: HealthMetric) => setProfile((current) => applyHealthMetricToProfile(current, metric))}
          />
        </div>
      </div>

      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line bg-surface/80 px-5 py-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-ink">分餐计划</h2>
            <p className="text-xs text-muted">每次只显示一餐；全天求解会动态调配各餐推荐比例。</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,200px)_minmax(0,200px)_auto_auto]">
            <select className="field w-full" value={activeMeal?.id ?? ""} onChange={(event) => setActiveMealId(event.target.value)}>
              {meals.map((meal) => {
                const recommendation = recommendationsByMeal.get(meal.id);
                return (
                  <option key={meal.id} value={meal.id}>
                    {meal.name} · {round(recommendation?.target.kcal ?? 0, 0)} kcal
                  </option>
                );
              })}
            </select>
            <select className="field w-full" value={selectedDayTemplateId} onChange={(event) => setSelectedDayTemplateId(event.target.value)}>
              <option value="">选择全天模板</option>
              {templates.dayTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <button
              className="btn-secondary"
              type="button"
              disabled={!selectedDayTemplateId}
              onClick={() => {
                applyDayTemplate(selectedDayTemplateId);
                setSelectedDayTemplateId("");
              }}
            >
              <Check size={16} />
              使用全天模板
            </button>
            <button className="btn-secondary" type="button" onClick={() => saveDayTemplate()}>
              <Save size={16} />
              保存全天模板
            </button>
          </div>
        </div>
        {/* segmented 餐次标签：底部 accent 指示线，无外发光 */}
        <div className="flex gap-0 overflow-x-auto border-b border-line bg-surface/60">
          {meals.map((meal) => {
            const recommendation = recommendationsByMeal.get(meal.id);
            const active = meal.id === activeMeal?.id;
            return (
              <button
                key={meal.id}
                className={`relative flex min-h-[3.5rem] flex-1 flex-col items-start justify-center whitespace-nowrap border-r border-line px-4 py-2.5 text-left transition-colors last:border-r-0 ${
                  active
                    ? "bg-accent/[0.07] text-accent"
                    : "text-muted hover:bg-white/[0.03] hover:text-ink"
                }`}
                type="button"
                onClick={() => setActiveMealId(meal.id)}
              >
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-accent" />
                )}
                <span className="text-sm font-semibold">{meal.name}</span>
                <span className="mt-0.5 text-xs opacity-70">
                  {round(recommendation?.target.carbs ?? 0, 0)}g 碳 / {round(recommendation?.target.protein ?? 0, 0)}g 蛋
                </span>
              </button>
            );
          })}
        </div>
        <div className="p-0">
          {activeMeal ? (
          <MealEditor
            key={activeMeal.id}
            meal={activeMeal}
            foods={foods}
            foodsById={foodsById}
            recommendation={recommendationsByMeal.get(activeMeal.id)}
            mealTemplates={templates.mealTemplates}
            onAddFood={() => addFoodToMeal(activeMeal.id)}
            onApplyMealTemplate={(templateId) => applyMealTemplate(activeMeal.id, templateId)}
            onRemoveEntry={(entryId) => removeEntry(activeMeal.id, entryId)}
            onSaveMealTemplate={(templateName) => saveMealTemplate(activeMeal, templateName)}
            onUpdateMeal={(mapper) => updateMeal(activeMeal.id, mapper)}
            onUpdateEntry={(entryId, mapper) => updateEntry(activeMeal.id, entryId, mapper)}
          />
          ) : null}
        </div>
      </section>
    </section>
  );
}

interface DailyBalancePanelProps {
  target: MacroTotals;
  actual: MacroTotals;
  recommended: MacroTotals;
}

function DailyBalancePanel({ actual, recommended, target }: DailyBalancePanelProps) {
  return (
    <div className="rounded-xl border border-line bg-panel/60 p-3">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-tight text-ink">热量 &amp; 营养素盈亏</h3>
        <span className="text-[10px] text-muted">摄入 / 目标</span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <DailyBalanceCard actual={actual.kcal} label="热量" recommended={recommended.kcal} target={target.kcal} unit="kcal" />
        <DailyBalanceCard actual={actual.carbs} label="碳水" recommended={recommended.carbs} target={target.carbs} unit="g" />
        <DailyBalanceCard actual={actual.protein} label="蛋白" recommended={recommended.protein} target={target.protein} unit="g" />
        <DailyBalanceCard actual={actual.fat} label="脂肪" recommended={recommended.fat} target={target.fat} unit="g" />
      </div>
    </div>
  );
}

function DailyBalanceCard({
  actual,
  label,
  recommended,
  target,
  unit
}: {
  actual: number;
  label: string;
  recommended: number;
  target: number;
  unit: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface/50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="metric-label">{label}</span>
        <span className="text-[10px] text-muted">目标 {round(target, unit === "kcal" ? 0 : 1)}{unit}</span>
      </div>
      <DailyBalanceBar label="当前" target={target} unit={unit} value={actual} />
      <DailyBalanceBar label="推荐后" target={target} unit={unit} value={recommended} />
    </div>
  );
}

function DailyBalanceBar({
  label,
  target,
  unit,
  value
}: {
  label: string;
  target: number;
  unit: string;
  value: number;
}) {
  const balance = target - value;
  const ratio = target > 0 ? (value / target) * 100 : 0;
  const isSurplus = balance < 0;
  const roundedDigits = unit === "kcal" ? 0 : 1;
  const balanceLabel = isSurplus ? "盈" : "亏";
  const barColor = isSurplus ? "bg-rose" : "bg-accent";

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">
          {label} {round(value, roundedDigits)}{unit} / {round(ratio, 0)}%
        </span>
        <span className={isSurplus ? "font-semibold text-rose" : "font-semibold text-accent"}>
          {balanceLabel} {round(Math.abs(balance), roundedDigits)}{unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(Math.max(ratio, 0), 100)}%` }} />
      </div>
    </div>
  );
}

interface MacroRatioPanelProps {
  carbDayType: ReturnType<typeof buildNutritionResult>["carbDayType"];
  carbDayLabel: string;
  targetRatio: MacroRatio;
  actualRatio: MacroRatio;
  recommendedRatio: MacroRatio;
}

function MacroRatioPanel({ actualRatio, carbDayType, carbDayLabel, recommendedRatio, targetRatio }: MacroRatioPanelProps) {
  const actualCheck = getMacroRatioCheck(actualRatio, targetRatio, "cut", carbDayType);
  const recommendedCheck = getMacroRatioCheck(recommendedRatio, targetRatio, "cut", carbDayType);
  const actualStatus = `${actualCheck.cycleAligned ? "公式贴合" : "公式偏离"} / ${actualCheck.goalAligned ? "参考内" : "参考外"}`;
  const recommendedStatus = `${recommendedCheck.cycleAligned ? "公式贴合" : "公式偏离"} / ${recommendedCheck.goalAligned ? "参考内" : "参考外"}`;

  return (
    <div className="rounded-xl border border-line bg-panel/60 p-3">
      <div className="mb-2.5">
        <h3 className="text-xs font-semibold tracking-tight text-ink">宏量素比例</h3>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
          当前 {actualStatus} · 推荐后 {recommendedStatus}
        </p>
      </div>
      <div className="grid gap-1.5 grid-cols-3">
        <MacroRatioRow
          actual={actualRatio.carbs}
          label="碳水"
          range={actualCheck.ranges.carbs}
          recommended={recommendedRatio.carbs}
          target={targetRatio.carbs}
        />
        <MacroRatioRow
          actual={actualRatio.protein}
          label="蛋白"
          range={actualCheck.ranges.protein}
          recommended={recommendedRatio.protein}
          target={targetRatio.protein}
        />
        <MacroRatioRow
          actual={actualRatio.fat}
          label="脂肪"
          range={actualCheck.ranges.fat}
          recommended={recommendedRatio.fat}
          target={targetRatio.fat}
        />
      </div>
    </div>
  );
}

function MacroRatioRow({
  actual,
  label,
  range,
  recommended,
  target
}: {
  actual: number;
  label: string;
  range: { min: number; max: number };
  recommended: number;
  target: number;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface/50 p-2.5">
      <div className="metric-label">{label}</div>
      <div className="mt-1.5 flex items-end gap-1.5">
        <span className="tabular-nums text-base font-semibold text-accent">{round(target, 0)}%</span>
        <span className="pb-0.5 text-[10px] text-muted">
          现 {round(actual, 0)} / 推 {round(recommended, 0)}
        </span>
      </div>
      <p className="mt-0.5 text-[10px] text-muted">
        {round(range.min, 0)}-{round(range.max, 0)}% 区间
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-accent/70" style={{ width: `${Math.min(Math.max(target, 0), 100)}%` }} />
      </div>
    </div>
  );
}

function PlanRulePanel() {
  // [日, 部位, 动作, 碳日]：部位与动作分行，避免窄列内长标签换行。
  const weeklyPlan: Array<[string, string, string, "高碳" | "低碳"]> = [
    ["周一", "胸", "卧推飞鸟", "低碳"],
    ["周二", "背", "引体划船", "低碳"],
    ["周三", "腿", "深蹲硬拉", "高碳"],
    ["周四", "肩", "推举侧平举", "低碳"],
    ["周五", "手臂", "弯举臂屈伸", "低碳"],
    ["周六", "休息", "恢复", "低碳"],
    ["周日", "休息", "恢复", "低碳"]
  ];

  return (
    <div className="rounded-xl border border-line bg-panel/60 p-3">
      <div className="mb-2.5">
        <h3 className="text-xs font-semibold tracking-tight text-ink">张老师五分化碳循环</h3>
        <p className="mt-0.5 text-[11px] text-muted">仅腿日高碳、其余6天低碳；16/8进食窗口；高碳日严控油脂。</p>
      </div>
      {/* 一周横向条带：窄屏可横向滚动，单元最小宽度保证文字不换行 */}
      <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {weeklyPlan.map(([day, part, move, carbDay]) => {
          const high = carbDay === "高碳";
          return (
            <div
              key={day}
              className={`min-w-[72px] shrink-0 rounded-lg border px-2 py-2 text-center transition-colors ${
                high ? "border-accent/40 bg-accent/[0.07]" : "border-line bg-surface/50 hover:border-accent/30"
              }`}
            >
              <div className="text-[11px] font-semibold text-ink">{day}</div>
              <div className="mt-1 whitespace-nowrap text-xs font-medium text-ink">{part}</div>
              <div className="whitespace-nowrap text-[10px] text-muted">{move}</div>
              <div className="mt-1.5">
                {high ? (
                  <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">高碳</span>
                ) : (
                  <span className="text-[10px] text-muted">低碳</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ProfilePanelProps {
  profile: UserProfile;
  updateProfile: <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => void;
}

function ProfilePanel({ profile, updateProfile }: ProfilePanelProps) {
  function numberInput<K extends keyof UserProfile>(key: K, value: string) {
    updateProfile(key, Number(value) as UserProfile[K]);
  }

  return (
    <section className="panel p-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent ring-1 ring-accent/30">
          <Utensils size={20} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink">身体与训练</h2>
          <p className="text-sm text-muted">每个输入字符都会刷新目标、推荐值和图表。</p>
        </div>
      </div>
      <div className="grid gap-3">
        <label>
          <span className="metric-label mb-1 block">计划日期</span>
          <input className="field w-full" type="date" value={profile.planDate} onChange={(event) => updateProfile("planDate", event.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="metric-label mb-1 block">性别</span>
            <select className="field w-full" value={profile.sex} onChange={(event) => updateProfile("sex", event.target.value as UserProfile["sex"])}>
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </label>
          <label>
            <span className="metric-label mb-1 block">年龄</span>
            <input className="field w-full" inputMode="numeric" type="number" value={profile.age} onChange={(event) => numberInput("age", event.target.value)} />
          </label>
          <label>
            <span className="metric-label mb-1 block">身高 cm</span>
            <input className="field w-full" inputMode="decimal" type="number" value={profile.heightCm} onChange={(event) => numberInput("heightCm", event.target.value)} />
          </label>
          <label>
            <span className="metric-label mb-1 block">体重 kg</span>
            <input className="field w-full" inputMode="decimal" type="number" value={profile.weightKg} onChange={(event) => numberInput("weightKg", event.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="metric-label mb-1 block">日常活动系数</span>
            <input className="field w-full" inputMode="decimal" step="0.01" type="number" value={profile.activityFactor} onChange={(event) => numberInput("activityFactor", event.target.value)} />
          </label>
          <label>
            <span className="metric-label mb-1 block">运动消耗 kcal</span>
            <input className="field w-full" inputMode="numeric" type="number" value={profile.exerciseKcal} onChange={(event) => numberInput("exerciseKcal", event.target.value)} />
          </label>
          <label>
            <span className="metric-label mb-1 block">蛋白 g/kg</span>
            <input
              className="field w-full"
              min="1.6"
              max="2.2"
              step="0.1"
              type="number"
              inputMode="decimal"
              value={getProteinPerKg(profile)}
              onChange={(event) => numberInput("proteinPerKg", event.target.value)}
            />
          </label>
        </div>
        <label>
          <span className="metric-label mb-1 block">训练部位</span>
          <select className="field w-full" value={profile.workoutType} onChange={(event) => updateProfile("workoutType", event.target.value as WorkoutType)}>
            {Object.entries(workoutLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="metric-label mb-1 block">训练时间</span>
          <select
            className="field w-full"
            value={profile.trainingTime}
            onChange={(event) => updateProfile("trainingTime", event.target.value as UserProfile["trainingTime"])}
            disabled={profile.workoutType === "rest"}
          >
            {Object.entries(trainingTimeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

interface MealEditorProps {
  meal: MealPlan;
  foods: FoodItem[];
  foodsById: Map<string, FoodItem>;
  recommendation: ReturnType<typeof buildNutritionResult>["mealRecommendations"][number] | undefined;
  mealTemplates: MealTemplate[];
  onAddFood: () => void;
  onApplyMealTemplate: (templateId: string) => void;
  onRemoveEntry: (entryId: string) => void;
  onSaveMealTemplate: (templateName?: string) => void;
  onUpdateMeal: (mapper: (meal: MealPlan) => MealPlan) => void;
  onUpdateEntry: (entryId: string, mapper: (entry: MealFoodEntry) => MealFoodEntry) => void;
}

function MealEditor({
  meal,
  foods,
  foodsById,
  recommendation,
  mealTemplates,
  onAddFood,
  onApplyMealTemplate,
  onRemoveEntry,
  onSaveMealTemplate,
  onUpdateMeal,
  onUpdateEntry
}: MealEditorProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");

  return (
    <section className="overflow-hidden bg-surface">
      <div className="flex flex-col gap-3 border-b border-line bg-surface/70 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ink">{meal.name}</h3>
          <p className="text-sm text-muted">
            目标 {round(recommendation?.target.kcal ?? 0, 0)} kcal / 当前 {round(recommendation?.actual.kcal ?? 0, 0)} kcal
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted">
            <span>比例</span>
            <input
              className="field h-9 w-24"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={round(meal.ratio * 100, 0)}
              onChange={(event) =>
                onUpdateMeal((current) => ({
                  ...current,
                  ratio: Number(event.target.value) / 100
                }))
              }
            />
            <span>%</span>
          </label>
          <button
            className={meal.locked ? "btn-primary h-9" : "btn-secondary h-9"}
            type="button"
            onClick={() => onUpdateMeal((current) => ({ ...current, locked: !current.locked }))}
          >
            {meal.locked ? <Lock size={16} /> : <Unlock size={16} />}
            {meal.locked ? "整餐已锁" : "锁定整餐"}
          </button>
          <button className="btn-secondary h-11" type="button" onClick={onAddFood}>
            <Plus size={16} />
            添加食物
          </button>
          <div className="flex w-full gap-2 sm:w-auto">
            <input
              className="field h-11 min-w-0 flex-1 sm:w-44"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="模板名可空"
            />
            <button
              className="btn-secondary h-11"
              type="button"
              onClick={() => {
                onSaveMealTemplate(templateName);
                setTemplateName("");
              }}
            >
              <Save size={16} />
              保存本餐
            </button>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <select
              className="field h-11 min-w-0 flex-1 sm:w-44"
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
            >
              <option value="">选择单餐模板</option>
              {mealTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <button
              className="btn-secondary h-11"
              type="button"
              disabled={!selectedTemplateId}
              onClick={() => {
                onApplyMealTemplate(selectedTemplateId);
                setSelectedTemplateId("");
              }}
            >
              <Check size={16} />
              使用
            </button>
          </div>
        </div>
      </div>

      {recommendation ? (
        <>
          <MealMacroBalance
            actual={recommendation.actual}
            actualDeficit={recommendation.actualDeficit}
            actualRatio={recommendation.actualRatio}
            target={recommendation.target}
            targetRatio={recommendation.targetRatio}
          />
          <LockedMealGapNotice meal={meal} recommendation={recommendation} />
        </>
      ) : null}

      <div className="grid gap-3 p-3 md:hidden">
        {meal.entries.length === 0 ? (
          <p className="rounded-md border border-dashed border-line bg-panel p-4 text-center text-sm text-muted">
            这一餐还没有食物。添加食物后系统会实时推荐克重。
          </p>
        ) : (
          meal.entries.map((entry) => {
            const food = foodsById.get(entry.foodId);
            const recommendedGrams = recommendation?.recommendedEntries[entry.id] ?? entry.grams;
            const defaultBounds = food ? getDefaultMealEntrySettings(food, meal) : null;
            const totals = food ? calculateFoodTotals(food, entry.grams) : { kcal: 0, carbs: 0, protein: 0, fat: 0 };

            return (
              <div key={entry.id} className="rounded-md border border-line bg-surface/70 p-3 backdrop-blur">
                <label>
                  <span className="metric-label mb-1 block">食物</span>
                  <select
                    className="field w-full"
                    value={entry.foodId}
                    onChange={(event) =>
                      onUpdateEntry(entry.id, (current) => ({
                        ...current,
                        foodId: event.target.value,
                        ...(() => {
                          const nextFood = foodsById.get(event.target.value);
                          return nextFood ? getDefaultMealEntrySettings(nextFood, meal) : {};
                        })()
                      }))
                    }
                  >
                    {foods.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.category}
                      </option>
                    ))}
                  </select>
                </label>
                {food ? <div className="mt-1 text-xs text-muted">{convertWeightLabel(food, entry.grams)}</div> : null}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label>
                    <span className="metric-label mb-1 block">克重</span>
                    <input
                      className="field w-full"
                      type="number"
                      inputMode="decimal"
                      value={entry.grams}
                      onChange={(event) =>
                        onUpdateEntry(entry.id, (current) => ({
                          ...current,
                          grams: Number(event.target.value),
                          locked: true
                        }))
                      }
                    />
                  </label>
                  <div className="rounded-md bg-panel p-2">
                    <div className="metric-label">推荐</div>
                    <div className="font-semibold text-accent">{round(recommendedGrams, 1)} g</div>
                  </div>
                  <label>
                    <span className="metric-label mb-1 block">最小</span>
                    <input
                      className="field w-full"
                      type="number"
                      inputMode="decimal"
                      value={entry.minGrams ?? ""}
                      onChange={(event) =>
                        onUpdateEntry(entry.id, (current) => ({
                          ...current,
                          minGrams: event.target.value === "" ? null : Number(event.target.value)
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span className="metric-label mb-1 block">最大</span>
                    <input
                      className="field w-full"
                      type="number"
                      inputMode="decimal"
                      value={entry.maxGrams ?? ""}
                      placeholder={defaultBounds ? `${defaultBounds.maxGrams}` : ""}
                      onChange={(event) =>
                        onUpdateEntry(entry.id, (current) => ({
                          ...current,
                          maxGrams: event.target.value === "" ? null : Number(event.target.value)
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="rounded-md bg-panel p-2"><div className="metric-label">热量</div><div>{round(totals.kcal, 0)}</div></div>
                  <div className="rounded-md bg-panel p-2"><div className="metric-label">碳水</div><div>{round(totals.carbs)}</div></div>
                  <div className="rounded-md bg-panel p-2"><div className="metric-label">蛋白</div><div>{round(totals.protein)}</div></div>
                  <div className="rounded-md bg-panel p-2"><div className="metric-label">脂肪</div><div>{round(totals.fat)}</div></div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    className={entry.locked ? "btn-primary h-9 flex-1" : "btn-secondary h-9 flex-1"}
                    type="button"
                    onClick={() =>
                      onUpdateEntry(entry.id, (current) => ({
                        ...current,
                        locked: !current.locked
                      }))
                    }
                  >
                    {entry.locked ? <Lock size={16} /> : <Unlock size={16} />}
                    {entry.locked ? "已锁定" : "未锁定"}
                  </button>
                  <button className="btn-danger h-9 px-3" type="button" onClick={() => onRemoveEntry(entry.id)} title="删除食物">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="scrollbar-thin hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="border-b border-line bg-panel text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold">食物</th>
              <th className="px-4 py-2.5 font-semibold">克重</th>
              <th className="px-4 py-2.5 font-semibold text-accent">推荐</th>
              <th className="px-4 py-2.5 font-semibold">最小</th>
              <th className="px-4 py-2.5 font-semibold">最大</th>
              <th className="px-4 py-2.5 font-semibold">热量</th>
              <th className="px-4 py-2.5 font-semibold">碳水</th>
              <th className="px-4 py-2.5 font-semibold">蛋白</th>
              <th className="px-4 py-2.5 font-semibold">脂肪</th>
              <th className="px-4 py-2.5 font-semibold">锁定</th>
              <th className="px-4 py-2.5 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {meal.entries.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-muted" colSpan={11}>
                  这一餐还没有食物。添加食物后系统会实时推荐克重。
                </td>
              </tr>
            ) : (
              meal.entries.map((entry) => {
                const food = foodsById.get(entry.foodId);
                const recommendedGrams = recommendation?.recommendedEntries[entry.id] ?? entry.grams;
                const defaultBounds = food ? getDefaultMealEntrySettings(food, meal) : null;
                const totals = food ? calculateFoodTotals(food, entry.grams) : { kcal: 0, carbs: 0, protein: 0, fat: 0 };

                return (
                  <tr key={entry.id} className="border-t border-line transition-colors hover:bg-white/[0.03]">
                    <td className="px-4 py-2.5">
                      <select
                        className="field h-9 w-52"
                        value={entry.foodId}
                        onChange={(event) =>
                          onUpdateEntry(entry.id, (current) => ({
                            ...current,
                            foodId: event.target.value,
                            ...(() => {
                              const nextFood = foodsById.get(event.target.value);
                              return nextFood ? getDefaultMealEntrySettings(nextFood, meal) : {};
                            })()
                          }))
                        }
                      >
                        {foods.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} · {item.category}
                          </option>
                        ))}
                      </select>
                      {food ? <div className="mt-1 text-xs text-muted">{convertWeightLabel(food, entry.grams)}</div> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        className="field h-9 w-24"
                        type="number"
                        inputMode="decimal"
                        value={entry.grams}
                        onChange={(event) =>
                          onUpdateEntry(entry.id, (current) => ({
                            ...current,
                            grams: Number(event.target.value),
                            locked: true
                          }))
                        }
                      />
                    </td>
                    <td className="tabular-nums px-4 py-2.5 font-semibold text-accent">{round(recommendedGrams, 1)} g</td>
                    <td className="px-4 py-2.5">
                      <input
                        className="field h-9 w-24"
                        type="number"
                        inputMode="decimal"
                        value={entry.minGrams ?? ""}
                        onChange={(event) =>
                          onUpdateEntry(entry.id, (current) => ({
                            ...current,
                            minGrams: event.target.value === "" ? null : Number(event.target.value)
                          }))
                        }
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        className="field h-9 w-24"
                        type="number"
                        inputMode="decimal"
                        value={entry.maxGrams ?? ""}
                        placeholder={defaultBounds ? `${defaultBounds.maxGrams}` : ""}
                        onChange={(event) =>
                          onUpdateEntry(entry.id, (current) => ({
                            ...current,
                            maxGrams: event.target.value === "" ? null : Number(event.target.value)
                          }))
                        }
                      />
                    </td>
                    <td className="tabular-nums px-4 py-2.5 text-muted">{round(totals.kcal, 0)}</td>
                    <td className="tabular-nums px-4 py-2.5 text-muted">{round(totals.carbs)}</td>
                    <td className="tabular-nums px-4 py-2.5 text-muted">{round(totals.protein)}</td>
                    <td className="tabular-nums px-4 py-2.5 text-muted">{round(totals.fat)}</td>
                    <td className="px-4 py-2.5">
                      <button
                        className={entry.locked ? "btn-primary h-8 px-2" : "btn-secondary h-8 px-2"}
                        type="button"
                        onClick={() =>
                          onUpdateEntry(entry.id, (current) => ({
                            ...current,
                            locked: !current.locked
                          }))
                        }
                      >
                        {entry.locked ? <Lock size={14} /> : <Unlock size={14} />}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <button className="btn-danger h-8 px-2" type="button" onClick={() => onRemoveEntry(entry.id)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LockedMealGapNotice({
  meal,
  recommendation
}: {
  meal: MealPlan;
  recommendation: ReturnType<typeof buildNutritionResult>["mealRecommendations"][number];
}) {
  const hasLockedItems = meal.locked || meal.entries.some((entry) => entry.locked);
  if (!hasLockedItems || Math.abs(recommendation.deficit.kcal) <= 120) {
    return null;
  }

  const direction = recommendation.deficit.kcal > 0 ? "仍亏" : "仍盈";
  return (
    <p className="border-b border-line bg-amber/10 px-4 py-2 text-sm font-medium text-amber ring-inset ring-amber/20">
      锁定项使本餐推荐后{direction} {round(Math.abs(recommendation.deficit.kcal), 0)} kcal，系统会保留该差额，避免其他餐被过度拉高或压低。
    </p>
  );
}

interface MealMacroBalanceProps {
  target: MacroTotals;
  actual: MacroTotals;
  actualDeficit: MacroTotals;
  targetRatio: MacroRatio;
  actualRatio: MacroRatio;
}

function MealMacroBalance({ actual, actualDeficit, actualRatio, target, targetRatio }: MealMacroBalanceProps) {
  return (
    <div className="grid gap-2 border-b border-line bg-surface/60 p-4 md:grid-cols-3">
      <MacroBalanceCard
        actual={actual.carbs}
        actualRatio={actualRatio.carbs}
        balance={actualDeficit.carbs}
        label="碳水"
        target={target.carbs}
        targetRatio={targetRatio.carbs}
      />
      <MacroBalanceCard
        actual={actual.protein}
        actualRatio={actualRatio.protein}
        balance={actualDeficit.protein}
        label="蛋白"
        target={target.protein}
        targetRatio={targetRatio.protein}
      />
      <MacroBalanceCard
        actual={actual.fat}
        actualRatio={actualRatio.fat}
        balance={actualDeficit.fat}
        label="脂肪"
        target={target.fat}
        targetRatio={targetRatio.fat}
      />
    </div>
  );
}

function MacroBalanceCard({
  actual,
  actualRatio,
  balance,
  label,
  target,
  targetRatio
}: {
  actual: number;
  actualRatio: number;
  balance: number;
  label: string;
  target: number;
  targetRatio: number;
}) {
  const isSurplus = balance < 0;
  const balanceLabel = isSurplus ? "盈" : "亏";
  const tone = isSurplus ? "text-rose" : "text-accent";

  return (
    <div className="rounded-md border border-line bg-surface/70 p-3 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <span className="metric-label">{label}</span>
        <span className={`text-sm font-semibold ${tone}`}>
          {balanceLabel} {round(Math.abs(balance), 1)}g
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-muted">目标</span>
          <div className="font-semibold text-ink">
            {round(target, 1)}g · {round(targetRatio, 0)}%
          </div>
        </div>
        <div>
          <span className="text-muted">当前</span>
          <div className="font-semibold text-ink">
            {round(actual, 1)}g · {round(actualRatio, 0)}%
          </div>
        </div>
      </div>
    </div>
  );
}
