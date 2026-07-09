"use client";

import { Check, ChevronDown, Lock, Plus, Save, Trash2, Unlock, Wand2 } from "lucide-react";
import { useState } from "react";
import { FoodPickerDialog } from "@/components/FoodPickerDialog";
import type { PlannerController } from "@/components/usePlanner";
import { createCustomFood } from "@/lib/foods";
import { buildNutritionResult, calculateFoodTotals, convertWeightLabel, getDefaultMealEntrySettings, round } from "@/lib/nutrition";
import type { CustomFoodDraft, FoodItem, MacroRatio, MacroTotals, MealFoodEntry, MealPlan, MealTemplate, PlannerTemplates } from "@/lib/types";

interface MealSplitViewProps {
  controller: PlannerController;
  foods: FoodItem[];
  templates: PlannerTemplates;
}

export function MealSplitView({ controller, foods, templates }: MealSplitViewProps) {
  const {
    meals,
    activeMealId,
    setActiveMealId,
    result,
    foodsById,
    recommendationsByMeal,
    message,
    saving,
    addFoodToMeal,
    addCustomFoodToMeal,
    updateEntry,
    removeEntry,
    updateMeal,
    applyRecommendations,
    persistPlan,
    normalizeRatios,
    saveMealTemplate,
    applyMealTemplate,
    saveDayTemplate,
    applyDayTemplate
  } = controller;
  const [selectedDayTemplateId, setSelectedDayTemplateId] = useState("");

  const activeMeal = meals.find((meal) => meal.id === activeMealId) ?? meals[0];

  return (
    <section className="animate-fade-up space-y-4">
      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line bg-surface/80 px-5 py-3.5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-ink">分餐计划</h2>
              <p className="text-xs text-muted">每次只显示一餐；全天求解会动态调配各餐推荐比例。</p>
            </div>
            {/* 主操作：归一比例 / 应用推荐 / 保存计划（从指挥台顶栏移来） */}
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

        {message ? <p className="mx-4 mt-3 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent">{message}</p> : null}
        {result.conflicts.length > 0 ? (
          <div className="mx-4 mt-3 space-y-1.5">
            {result.conflicts.map((conflict) => (
              <p key={conflict} className="rounded-lg border border-rose/20 bg-rose/10 px-4 py-2.5 text-sm text-rose">
                {conflict}
              </p>
            ))}
          </div>
        ) : null}

        {/* segmented 餐次标签：底部 accent 指示线 */}
        <div className="mt-3 flex gap-0 overflow-x-auto border-y border-line bg-surface/60">
          {meals.map((meal) => {
            const recommendation = recommendationsByMeal.get(meal.id);
            const active = meal.id === activeMeal?.id;
            return (
              <button
                key={meal.id}
                className={`relative flex min-h-[3.5rem] flex-1 flex-col items-start justify-center whitespace-nowrap border-r border-line px-4 py-2.5 text-left transition-colors last:border-r-0 ${
                  active ? "bg-accent/[0.07] text-accent" : "text-muted hover:bg-black/[0.02] hover:text-ink"
                }`}
                type="button"
                onClick={() => setActiveMealId(meal.id)}
              >
                {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-accent" />}
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
              onAddFood={(foodId) => addFoodToMeal(activeMeal.id, foodId)}
              onAddCustomFood={(draft) => addCustomFoodToMeal(activeMeal.id, draft)}
              onApplyMealTemplate={(templateId) => applyMealTemplate(activeMeal.id, templateId)}
              onRemoveEntry={(entryId) => removeEntry(activeMeal.id, entryId)}
              onSaveMealTemplate={() => saveMealTemplate(activeMeal)}
              onUpdateMeal={(mapper) => updateMeal(activeMeal.id, mapper)}
              onUpdateEntry={(entryId, mapper) => updateEntry(activeMeal.id, entryId, mapper)}
            />
          ) : null}
        </div>
      </section>
    </section>
  );
}

interface MealEditorProps {
  meal: MealPlan;
  foods: FoodItem[];
  foodsById: Map<string, FoodItem>;
  recommendation: ReturnType<typeof buildNutritionResult>["mealRecommendations"][number] | undefined;
  mealTemplates: MealTemplate[];
  onAddFood: (foodId: string) => void;
  onAddCustomFood: (draft: CustomFoodDraft) => void;
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
  onAddCustomFood,
  onApplyMealTemplate,
  onRemoveEntry,
  onSaveMealTemplate,
  onUpdateMeal,
  onUpdateEntry
}: MealEditorProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  // 选食面板目标："add" 表示新增食物，字符串表示替换该 entry 的食物，null 表示关闭。
  const [pickerTarget, setPickerTarget] = useState<"add" | string | null>(null);

  function changeEntryFood(entryId: string, foodId: string) {
    const nextFood = foodsById.get(foodId);
    onUpdateEntry(entryId, (current) => ({
      ...current,
      foodId,
      customFood: undefined, // 换回库存食物时清掉内嵌的临时定义
      ...(nextFood ? getDefaultMealEntrySettings(nextFood, meal) : {})
    }));
  }

  function handlePick(foodId: string) {
    if (pickerTarget === "add") {
      onAddFood(foodId);
    } else if (pickerTarget) {
      changeEntryFood(pickerTarget, foodId);
    }
  }

  function handlePickCustom(draft: CustomFoodDraft) {
    if (pickerTarget === "add") {
      onAddCustomFood(draft);
      return;
    }
    if (!pickerTarget) {
      return;
    }
    // 替换模式：该条目改指一个新的临时自定义食物，克重界限按其分类默认值重置。
    const food = createCustomFood(draft);
    const defaults = getDefaultMealEntrySettings(food, meal);
    onUpdateEntry(pickerTarget, (current) => ({
      ...current,
      foodId: food.id,
      customFood: { ...draft, name: food.name },
      grams: defaults.grams,
      minGrams: defaults.minGrams,
      maxGrams: defaults.maxGrams
    }));
  }

  const currentPickerFoodId = pickerTarget && pickerTarget !== "add" ? meal.entries.find((entry) => entry.id === pickerTarget)?.foodId : undefined;

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
          <button className="btn-secondary h-11" type="button" onClick={() => setPickerTarget("add")}>
            <Plus size={16} />
            添加食物
          </button>
          <button className="btn-secondary h-11" type="button" onClick={() => onSaveMealTemplate()} title="模板只记录食物组合，名字自动生成">
            <Save size={16} />
            存为单餐模板
          </button>
          <div className="flex w-full gap-2 sm:w-auto">
            <select className="field h-11 min-w-0 flex-1 sm:w-44" value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
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
            这一餐还没有食物。点「添加食物」先选分类再选食物。
          </p>
        ) : (
          meal.entries.map((entry) => {
            const food = foodsById.get(entry.foodId);
            const recommendedGrams = recommendation?.recommendedEntries[entry.id] ?? entry.grams;
            const defaultBounds = food ? getDefaultMealEntrySettings(food, meal) : null;
            const totals = food ? calculateFoodTotals(food, entry.grams) : { kcal: 0, carbs: 0, protein: 0, fat: 0 };

            return (
              <div key={entry.id} className="rounded-md border border-line bg-surface/70 p-3 backdrop-blur">
                <span className="metric-label mb-1 block">食物</span>
                <FoodPickerButton food={food} className="w-full" onClick={() => setPickerTarget(entry.id)} />
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
                    onClick={() => onUpdateEntry(entry.id, (current) => ({ ...current, locked: !current.locked }))}
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
                  这一餐还没有食物。点「添加食物」先选分类再选食物。
                </td>
              </tr>
            ) : (
              meal.entries.map((entry) => {
                const food = foodsById.get(entry.foodId);
                const recommendedGrams = recommendation?.recommendedEntries[entry.id] ?? entry.grams;
                const defaultBounds = food ? getDefaultMealEntrySettings(food, meal) : null;
                const totals = food ? calculateFoodTotals(food, entry.grams) : { kcal: 0, carbs: 0, protein: 0, fat: 0 };

                return (
                  <tr key={entry.id} className="border-t border-line transition-colors hover:bg-black/[0.02]">
                    <td className="px-4 py-2.5">
                      <FoodPickerButton food={food} className="w-52" onClick={() => setPickerTarget(entry.id)} />
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
                        onClick={() => onUpdateEntry(entry.id, (current) => ({ ...current, locked: !current.locked }))}
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

      <FoodPickerDialog
        open={pickerTarget !== null}
        foods={foods}
        currentFoodId={currentPickerFoodId}
        title={pickerTarget === "add" ? `给「${meal.name}」添加食物` : "更换食物"}
        onSelect={handlePick}
        onSelectCustom={handlePickCustom}
        onClose={() => setPickerTarget(null)}
      />
    </section>
  );
}

function FoodPickerButton({ food, className = "", onClick }: { food: FoodItem | undefined; className?: string; onClick: () => void }) {
  return (
    <button type="button" className={`field flex h-9 items-center justify-between gap-1.5 text-left ${className}`} onClick={onClick}>
      <span className="min-w-0 truncate">
        {food ? (
          <>
            <span className="text-ink">{food.name}</span>
            <span className="text-muted"> · {food.category}</span>
          </>
        ) : (
          <span className="text-muted">选择食物</span>
        )}
      </span>
      <ChevronDown size={14} className="shrink-0 text-muted" />
    </button>
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
      <MacroBalanceCard actual={actual.carbs} actualRatio={actualRatio.carbs} balance={actualDeficit.carbs} label="碳水" target={target.carbs} targetRatio={targetRatio.carbs} />
      <MacroBalanceCard actual={actual.protein} actualRatio={actualRatio.protein} balance={actualDeficit.protein} label="蛋白" target={target.protein} targetRatio={targetRatio.protein} />
      <MacroBalanceCard actual={actual.fat} actualRatio={actualRatio.fat} balance={actualDeficit.fat} label="脂肪" target={target.fat} targetRatio={targetRatio.fat} />
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
