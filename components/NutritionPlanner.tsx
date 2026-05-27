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
import { loadPlannerDraft, loadPlannerTemplates, savePlan, savePlannerDraft, savePlannerTemplates } from "@/lib/storage";
import type {
  DayTemplate,
  FoodItem,
  MacroRatio,
  MacroTotals,
  MealFoodEntry,
  MealPlan,
  MealTemplate,
  PlannerTemplates,
  UserProfile,
  WorkoutType
} from "@/lib/types";

interface NutritionPlannerProps {
  foods: FoodItem[];
  user: User | null;
  onFoodsChanged: () => Promise<void>;
}

export function NutritionPlanner({ foods, user }: NutritionPlannerProps) {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [meals, setMeals] = useState<MealPlan[]>(() => createStarterMeals(defaultProfile));
  const [templates, setTemplates] = useState<PlannerTemplates>({ mealTemplates: [], dayTemplates: [] });
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
    const draft = loadPlannerDraft(user);
    const nextProfile = draft?.profile ?? { ...defaultProfile, planDate: new Date().toISOString().slice(0, 10) };
    setProfile(nextProfile);
    setMeals(draft?.meals ?? createStarterMeals(nextProfile));
    setTemplates(loadPlannerTemplates(user));
    setHydrated(true);
  }, [user]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    savePlannerDraft(profile, meals, user);
  }, [hydrated, meals, profile, user]);

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
    setTemplates(savePlannerTemplates(user, nextTemplates));
  }

  function saveMealTemplate(meal: MealPlan) {
    const template: MealTemplate = {
      id: crypto.randomUUID(),
      name: `${meal.name}模板 ${templates.mealTemplates.length + 1}`,
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

  function saveDayTemplate() {
    const template: DayTemplate = {
      id: crypto.randomUUID(),
      name: `${profile.planDate} 全天模板`,
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

  function deleteMealTemplate(templateId: string) {
    persistTemplates({
      ...templates,
      mealTemplates: templates.mealTemplates.filter((template) => template.id !== templateId)
    });
  }

  function deleteDayTemplate(templateId: string) {
    persistTemplates({
      ...templates,
      dayTemplates: templates.dayTemplates.filter((template) => template.id !== templateId)
    });
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <ProfilePanel profile={profile} updateProfile={updateProfile} />
        <div className="space-y-4">
          <section className="panel p-4">
            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">实时目标</h2>
                <p className="text-sm text-muted">
                  凯圣王减脂 / {workoutLabels[profile.workoutType]} / {carbDayLabels[result.carbDayType]} /{" "}
                  {trainingTimeLabels[profile.trainingTime]}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" type="button" onClick={normalizeRatios}>
                  <Check size={16} />
                  归一餐次比例
                </button>
                <button className="btn-primary" type="button" onClick={applyRecommendations}>
                  <Wand2 size={16} />
                  应用推荐
                </button>
                <button className="btn-primary" type="button" onClick={persistPlan} disabled={saving}>
                  <Save size={16} />
                  {saving ? "保存中" : "保存计划"}
                </button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
              <MetricCard label="BMR" value={result.bmr} unit="kcal" />
              <MetricCard label="维持热量" value={result.tdee} unit="kcal" tone="accent" />
              <MetricCard label="计划均热量" value={result.cycleAverageTarget.kcal} unit="kcal" tone="accent" />
              <MetricCard label="当日目标热量" value={result.dailyTarget.kcal} unit="kcal" tone="accent" />
              <MetricCard
                label={result.plannedCalorieDelta < 0 ? "计划缺口" : result.plannedCalorieDelta > 0 ? "计划盈余" : "计划差额"}
                value={Math.abs(result.plannedCalorieDelta)}
                unit="kcal"
                tone={result.plannedCalorieDelta < 0 ? "normal" : "accent"}
              />
              <MetricCard label="当前摄入" value={result.actualTotals.kcal} unit="kcal" />
              <MetricCard
                label="剩余目标"
                value={result.remaining.kcal}
                unit="kcal"
                tone={result.remaining.kcal < 0 ? "danger" : "normal"}
              />
            </div>
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
            {message ? <p className="mt-3 rounded-md bg-panel p-3 text-sm text-ink">{message}</p> : null}
            {result.conflicts.length > 0 ? (
              <div className="mt-3 space-y-2">
                {result.conflicts.map((conflict) => (
                  <p key={conflict} className="rounded-md bg-rose/10 p-3 text-sm text-rose">
                    {conflict}
                  </p>
                ))}
              </div>
            ) : null}
          </section>
          <MacroBars result={result} meals={meals} />
          <TemplatePanel
            templates={templates}
            onApplyDayTemplate={applyDayTemplate}
            onDeleteDayTemplate={deleteDayTemplate}
            onDeleteMealTemplate={deleteMealTemplate}
            onSaveDayTemplate={saveDayTemplate}
          />
        </div>
      </div>

      <div className="grid gap-4">
        {meals.map((meal) => (
          <MealEditor
            key={meal.id}
            meal={meal}
            foods={foods}
            foodsById={foodsById}
            recommendation={recommendationsByMeal.get(meal.id)}
            mealTemplates={templates.mealTemplates}
            onAddFood={() => addFoodToMeal(meal.id)}
            onApplyMealTemplate={(templateId) => applyMealTemplate(meal.id, templateId)}
            onRemoveEntry={(entryId) => removeEntry(meal.id, entryId)}
            onSaveMealTemplate={() => saveMealTemplate(meal)}
            onUpdateMeal={(mapper) => updateMeal(meal.id, mapper)}
            onUpdateEntry={(entryId, mapper) => updateEntry(meal.id, entryId, mapper)}
          />
        ))}
      </div>
    </section>
  );
}

interface TemplatePanelProps {
  templates: PlannerTemplates;
  onSaveDayTemplate: () => void;
  onApplyDayTemplate: (templateId: string) => void;
  onDeleteDayTemplate: (templateId: string) => void;
  onDeleteMealTemplate: (templateId: string) => void;
}

function TemplatePanel({
  templates,
  onApplyDayTemplate,
  onDeleteDayTemplate,
  onDeleteMealTemplate,
  onSaveDayTemplate
}: TemplatePanelProps) {
  return (
    <section className="panel p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">饮食模板</h2>
          <p className="text-sm text-muted">单餐模板保留食物搭配和锁定克重；全天模板保留当天所有餐次。</p>
        </div>
        <button className="btn-primary w-full md:w-auto" type="button" onClick={onSaveDayTemplate}>
          <Save size={16} />
          保存全天模板
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-line bg-panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">每一天的模板</h3>
            <span className="text-xs text-muted">{templates.dayTemplates.length} 个</span>
          </div>
          <div className="grid gap-2">
            {templates.dayTemplates.length === 0 ? (
              <p className="rounded-md bg-white p-3 text-sm text-muted">还没有全天模板。</p>
            ) : (
              templates.dayTemplates.map((template) => (
                <div key={template.id} className="flex flex-col gap-2 rounded-md border border-line bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium text-ink">{template.name}</div>
                    <div className="text-xs text-muted">{template.meals.length} 餐 · {new Date(template.createdAt).toLocaleString("zh-CN")}</div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-secondary h-9" type="button" onClick={() => onApplyDayTemplate(template.id)}>
                      <Check size={16} />
                      使用
                    </button>
                    <button className="btn-danger h-9 px-2" type="button" onClick={() => onDeleteDayTemplate(template.id)} title="删除全天模板">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-md border border-line bg-panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">每一餐的模板</h3>
            <span className="text-xs text-muted">{templates.mealTemplates.length} 个</span>
          </div>
          <div className="grid gap-2">
            {templates.mealTemplates.length === 0 ? (
              <p className="rounded-md bg-white p-3 text-sm text-muted">还没有单餐模板，可在每一餐标题区保存。</p>
            ) : (
              templates.mealTemplates.map((template) => {
                const lockedCount = template.entries.filter((entry) => entry.locked).length;
                return (
                  <div key={template.id} className="flex items-center justify-between gap-2 rounded-md border border-line bg-white p-3">
                    <div>
                      <div className="font-medium text-ink">{template.name}</div>
                      <div className="text-xs text-muted">{template.sourceMealName} · {template.entries.length} 种食物 · {lockedCount} 个锁定</div>
                    </div>
                    <button className="btn-danger h-9 px-2" type="button" onClick={() => onDeleteMealTemplate(template.id)} title="删除单餐模板">
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
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
    <div className="mt-3 rounded-md border border-line bg-panel p-3">
      <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">当日热量与三大营养素盈亏</h3>
          <p className="text-xs text-muted">当前摄入和应用推荐后的全天总量都会与目标对比。</p>
        </div>
        <span className="text-xs text-muted">柱状比例 = 摄入量 / 目标量</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
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
    <div className="rounded-md border border-line bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="metric-label">{label}</span>
        <span className="text-xs text-muted">目标 {round(target, unit === "kcal" ? 0 : 1)}{unit}</span>
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
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
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
    <div className="mt-3 rounded-md border border-line bg-panel p-3">
      <div className="mb-2 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">三大营养素比例</h3>
          <p className="text-xs text-muted">
            目标按{carbDayLabel}的每周碳水/脂肪总量重分配公式生成；当前 {actualStatus}，推荐后 {recommendedStatus}。
          </p>
        </div>
        <span className="text-xs text-muted">{macroRatioCheckSource} {energyTargetSource} {carbCycleMacroSource}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
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
    <div className="rounded-md border border-line bg-white p-3">
      <div className="metric-label">{label}</div>
      <div className="mt-1 flex items-end gap-2">
        <span className="text-lg font-semibold text-ink">{round(target, 0)}%</span>
        <span className="pb-0.5 text-xs text-muted">
          当前 {round(actual, 0)}% / 推荐 {round(recommended, 0)}%
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {round(range.min, 0)}%-{round(range.max, 0)}% 参考区间
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(Math.max(target, 0), 100)}%` }} />
      </div>
    </div>
  );
}

function PlanRulePanel() {
  const weeklyPlan = [
    ["周一", "推：胸肩三头", "中碳"],
    ["周二", "拉：背二头", "中碳"],
    ["周三", "腿：深蹲硬拉", "高碳"],
    ["周四", "休息", "低碳"],
    ["周五", "推/拉或轻训", "中碳"],
    ["周六", "腿或强度次高", "高碳"],
    ["周日", "休息", "低碳"]
  ];

  return (
    <div className="mt-3 rounded-md border border-line bg-panel p-3">
      <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">凯圣王三分化饮食规则</h3>
          <p className="text-xs text-muted">腿日高碳；推拉常规中碳；完全休息低碳。训练日碳水集中在训前和训后，低碳日不做力量训练。</p>
        </div>
        <span className="text-xs text-muted">16/8进食窗口；绿叶蔬菜不限量；高碳日严控油脂和劣质碳水。</span>
      </div>
      <div className="grid gap-2 md:grid-cols-7">
        {weeklyPlan.map(([day, workout, carbDay]) => (
          <div key={day} className="rounded-md border border-line bg-white p-2">
            <div className="text-xs font-semibold text-ink">{day}</div>
            <div className="mt-1 min-h-8 text-xs text-muted">{workout}</div>
            <div className="mt-2 text-xs font-semibold text-accent">{carbDay}</div>
          </div>
        ))}
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
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent">
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
            <input className="field w-full" type="number" value={profile.age} onChange={(event) => numberInput("age", event.target.value)} />
          </label>
          <label>
            <span className="metric-label mb-1 block">身高 cm</span>
            <input className="field w-full" type="number" value={profile.heightCm} onChange={(event) => numberInput("heightCm", event.target.value)} />
          </label>
          <label>
            <span className="metric-label mb-1 block">体重 kg</span>
            <input className="field w-full" type="number" value={profile.weightKg} onChange={(event) => numberInput("weightKg", event.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="metric-label mb-1 block">日常活动系数</span>
            <input className="field w-full" step="0.01" type="number" value={profile.activityFactor} onChange={(event) => numberInput("activityFactor", event.target.value)} />
          </label>
          <label>
            <span className="metric-label mb-1 block">运动消耗 kcal</span>
            <input className="field w-full" type="number" value={profile.exerciseKcal} onChange={(event) => numberInput("exerciseKcal", event.target.value)} />
          </label>
          <label>
            <span className="metric-label mb-1 block">蛋白 g/kg</span>
            <input
              className="field w-full"
              min="1.6"
              max="2.2"
              step="0.1"
              type="number"
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
  onSaveMealTemplate: () => void;
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

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 xl:flex-row xl:items-center xl:justify-between">
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
          <button className="btn-secondary h-9" type="button" onClick={onAddFood}>
            <Plus size={16} />
            添加食物
          </button>
          <button className="btn-secondary h-9" type="button" onClick={onSaveMealTemplate}>
            <Save size={16} />
            保存本餐模板
          </button>
          <div className="flex w-full gap-2 sm:w-auto">
            <select
              className="field h-9 min-w-0 flex-1 sm:w-44"
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
              className="btn-secondary h-9"
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
              <div key={entry.id} className="rounded-md border border-line bg-white p-3">
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
          <thead className="bg-panel text-xs uppercase tracking-normal text-muted">
            <tr>
              <th className="px-4 py-3">食物</th>
              <th className="px-4 py-3">克重</th>
              <th className="px-4 py-3">推荐</th>
              <th className="px-4 py-3">最小</th>
              <th className="px-4 py-3">最大</th>
              <th className="px-4 py-3">热量</th>
              <th className="px-4 py-3">碳水</th>
              <th className="px-4 py-3">蛋白</th>
              <th className="px-4 py-3">脂肪</th>
              <th className="px-4 py-3">锁定</th>
              <th className="px-4 py-3">操作</th>
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
                  <tr key={entry.id} className="border-t border-line">
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3">
                      <input
                        className="field h-9 w-24"
                        type="number"
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
                    <td className="px-4 py-3 font-medium text-accent">{round(recommendedGrams, 1)} g</td>
                    <td className="px-4 py-3">
                      <input
                        className="field h-9 w-24"
                        type="number"
                        value={entry.minGrams ?? ""}
                        onChange={(event) =>
                          onUpdateEntry(entry.id, (current) => ({
                            ...current,
                            minGrams: event.target.value === "" ? null : Number(event.target.value)
                          }))
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        className="field h-9 w-24"
                        type="number"
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
                    <td className="px-4 py-3">{round(totals.kcal, 0)}</td>
                    <td className="px-4 py-3">{round(totals.carbs)}</td>
                    <td className="px-4 py-3">{round(totals.protein)}</td>
                    <td className="px-4 py-3">{round(totals.fat)}</td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3">
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
    <p className="border-b border-line bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
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
    <div className="grid gap-2 border-b border-line bg-panel p-4 md:grid-cols-3">
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
    <div className="rounded-md border border-line bg-white p-3">
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
