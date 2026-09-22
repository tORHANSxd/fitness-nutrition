"use client";
import {
  Check,
  Copy,
  Lock,
  LockOpen,
  MoreHorizontal,
  Plus,
  Save,
  Trash2,
  Undo2,
  Wand2,
} from "lucide-react";
import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Dialog } from "@/components/Dialog";
import { tutorialAction } from "@/lib/tutorial";
import { FoodPickerDialog } from "@/components/FoodPickerDialog";
import { MealLayoutEditor } from "@/components/MealLayoutEditor";
import { NumericInput } from "@/components/NumericInput";
import type { PlannerController } from "@/components/usePlanner";
import { createCustomFood } from "@/lib/foods";
import { foodSnapshotFromFood, resolveMealFood } from "@/lib/foodSnapshots";
import { edibleGrams, isEdiblePercent } from "@/lib/foodWeights";
import {
  assessNutritionRecommendation,
  calculateFoodTotals,
  getDefaultMealEntrySettings,
  round,
} from "@/lib/nutrition";
import { displayEnergy, type EnergyUnit } from "@/lib/preferences";
import { loadPlansInRange } from "@/lib/storage";
import { materializeDayTemplate } from "@/lib/templates";
import type {
  CustomFoodDraft,
  FoodItem,
  MealFoodEntry,
  MealPlan,
  PlannerTemplates,
} from "@/lib/types";

interface MealSplitViewProps {
  hourCycle?: "h12" | "h23";
  controller: PlannerController;
  foods: FoodItem[];
  templates: PlannerTemplates;
  energyUnit?: EnergyUnit;
  user?: User;
}
export function MealSplitView({
  controller: c,
  foods,
  templates,
  energyUnit = "kcal",
  user,
}: MealSplitViewProps) {
  const [dialog, setDialog] = useState<"tools" | "copy" | "recommend" | null>(
    null,
  );
  const [picker, setPicker] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [copyDate, setCopyDate] = useState("");
  const [preview, setPreview] = useState<MealPlan[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const meal = c.meals.find((m) => m.id === c.activeMealId) ?? c.meals[0];
  const assessment = assessNutritionRecommendation(c.result, c.meals);
  const unit = energyUnit === "kj" ? "kJ" : "kcal";
  const energy = (n: number) => round(displayEnergy(n, energyUnit), 0);
  const replaceFood = (food: FoodItem, customFood?: CustomFoodDraft) => {
    if (!meal || !picker) return;
    if (picker === "add") {
      if (customFood) c.addCustomFoodToMeal(meal.id, customFood);
      else c.addFoodToMeal(meal.id, food.id);
      tutorialAction("food-added");
    } else
      c.updateEntry(meal.id, picker, (entry) => ({
        ...entry,
        foodId: food.id,
        customFood,
        foodSnapshot: foodSnapshotFromFood(food),
        useEdiblePortion: false,
        ediblePercent: undefined,
        ...getDefaultMealEntrySettings(food, meal),
      }));
  };
  const open = (next: typeof dialog) => {
    setDialog(next);
    setError("");
    setPreview(null);
  };
  return (
    <section
      className="meal-planner panel overflow-hidden"
      aria-label="分餐计划"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold">餐食安排</h2>
        <div className="flex flex-wrap gap-2">
          {user && (
            <button
              className="btn-secondary"
              type="button"
              onClick={() => open("copy")}
            >
              <Copy size={15} />
              <span className="hidden sm:inline">复制其他日期</span>
              <span className="sm:hidden">复制</span>
            </button>
          )}
          {c.result.dailyTarget.kcal > 0 && (
            <button
              className="btn-secondary"
              type="button"
              disabled={assessment.changedEntryCount === 0}
              onClick={() => open("recommend")}
            >
              <Wand2 size={15} />
              调整分量
            </button>
          )}
          <button
            className="icon-button"
            type="button"
            aria-label="餐食更多操作"
            onClick={() => open("tools")}
          >
            <MoreHorizontal size={20} />
          </button>
          <button
            className="btn-primary"
            type="button"
            data-tour="plan-save"
            onClick={async () => { if (await c.persistPlan()) tutorialAction("plan-saved"); }}
            disabled={c.saving}
          >
            <Save size={15} />
            {c.saving ? "保存中…" : "保存计划"}
          </button>
        </div>
      </header>
      {c.message && !c.message.startsWith("正在新建") && (
        <div
          className="flex items-center justify-between gap-3 bg-accent/40 px-5 py-2 text-sm"
          role="status"
        >
          <span>{c.message}</span>
          {c.canUndo && (
            <button
              className="btn-text shrink-0"
              type="button"
              onClick={c.undoLastChange}
            >
              <Undo2 size={14} />
              撤销
            </button>
          )}
        </div>
      )}
      <div className="meal-tabs" role="tablist" aria-label="选择餐次">
        {c.meals.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === meal?.id}
            className={item.id === meal?.id ? "is-active" : ""}
            onClick={() => c.setActiveMealId(item.id)}
          >
            <span className="line-clamp-2">{item.name}</span>
            <span className="mt-1 block text-xs font-normal text-muted">
              {energy(c.recommendationsByMeal.get(item.id)?.actual.kcal ?? 0)}{" "}
              {unit}
            </span>
          </button>
        ))}
      </div>
      {meal && (
        <div className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {meal.entries.length} 项食物
            </p>
            <div className="flex items-center gap-2">
            <button
              className={`portion-lock meal-lock ${meal.locked ? "is-locked" : ""}`}
              type="button"
              data-tour="meal-lock"
              aria-pressed={meal.locked}
              title={meal.locked ? "已锁定，自动调整会保留整餐分量；点击解锁" : "锁定后，自动调整会保留整餐分量"}
              onClick={() => { c.updateMeal(meal.id, m => ({ ...m, locked: !m.locked })); tutorialAction("meal-lock-changed"); }}
            >
              {meal.locked ? <Lock size={16} /> : <LockOpen size={16} />}
              锁定整餐
            </button>
            <button
              className="btn-primary"
              type="button"
              data-tour="meal-add"
              onClick={() => setPicker("add")}
            >
              <Plus size={17} />
              添加食物
            </button>
            </div>
          </div>
          {meal.entries.length ? (
            <div className="divide-y divide-line">
              {meal.entries.map((entry) => (
                <FoodEntryRow
                  key={entry.id}
                  entry={entry}
                  mealLocked={meal.locked}
                  food={resolveMealFood(entry, c.foodsById).food}
                  energyUnit={energyUnit}
                  onChange={(mapper) =>
                    c.updateEntry(meal.id, entry.id, mapper)
                  }
                  onPick={() => setPicker(entry.id)}
                  onDelete={() => c.removeEntry(meal.id, entry.id)}
                />
              ))}
            </div>
          ) : (
            <button
              type="button"
              className="empty-food-button"
              onClick={() => setPicker("add")}
            >
              <span className="empty-food-icon">
                <Plus size={25} />
              </span>
              <strong>为{meal.name}添加第一项食物</strong>
              <span>搜索食物，填写重量，即可计算营养。</span>
            </button>
          )}
          <details className="mt-5 border-t border-line pt-3">
            <summary className="cursor-pointer py-2 text-xs text-muted">
              本餐设置
            </summary>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => c.saveMealTemplate(meal)}
              >
                保存为单餐模板
              </button>
              <select
                className="field max-w-full"
                aria-label="选择单餐模板"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value)
                    c.applyMealTemplate(meal.id, e.target.value);
                  e.target.value = "";
                }}
              >
                <option value="">添加单餐模板…</option>
                {templates.mealTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </details>
        </div>
      )}
      <FoodPickerDialog
        open={picker !== null}
        foods={foods}
        energyUnit={energyUnit}
        title={picker === "add" ? "添加食物" : "更换食物"}
        onClose={() => setPicker(null)}
        onSelect={(id) => {
          const food = c.foodsById.get(id);
          if (food) replaceFood(food);
        }}
        onSelectCustom={(draft) => replaceFood(createCustomFood(draft), draft)}
      />
      <Dialog
        open={dialog === "tools"}
        title="餐食设置"
        onClose={() => setDialog(null)}
        wide
      >
        <MealLayoutEditor controller={c} energyUnit={energyUnit} />
        <div className="mt-5 space-y-3">
          <h3>饮食模板</h3>
          <div className="flex flex-wrap gap-2">
            <select
              className="field min-w-0 flex-1"
              aria-label="全天模板"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setPreview(null);
              }}
            >
              <option value="">选择全天模板</option>
              {templates.dayTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary"
              disabled={!templateId}
              onClick={() => {
                const t = templates.dayTemplates.find(
                  (t) => t.id === templateId,
                );
                if (t) setPreview(materializeDayTemplate(t, c.foodsById));
              }}
            >
              预览模板
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              className="field min-w-0 flex-1"
              maxLength={80}
              aria-label="全天模板名称"
              placeholder="模板名称"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
            <button
              className="btn-secondary"
              type="button"
              onClick={() => c.saveDayTemplate(templateName)}
            >
              保存当前餐食为模板
            </button>
          </div>
        </div>
        <details className="mt-5 border-t border-line pt-3">
          <summary className="cursor-pointer py-2 text-sm">导入与导出</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {c.exportDocument && (
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  const content = c.exportDocument?.();
                  if (!content) return;
                  const url = URL.createObjectURL(
                    new Blob([content], { type: "application/json" }),
                  );
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = `饮食计划-${c.profile.planDate}.json`;
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                导出计划文件
              </button>
            )}
            {c.importDocument && (
              <label className="btn-secondary">
                导入计划文件
                <input
                  className="sr-only"
                  type="file"
                  aria-label="导入计划文件"
                  accept=".json,application/json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    if (file.size > 262144) {
                      setError("文件过大，请选择小于 256 KB 的计划文件。");
                      return;
                    }
                    try {
                      c.importDocument?.(await file.text());
                    } catch {
                      setError("文件读取失败，请重试。");
                    }
                  }}
                />
              </label>
            )}
          </div>
        </details>
        {preview && (
          <CopyPreview
            meals={preview}
            onApply={() => {
              c.replaceMeals?.(preview);
              setDialog(null);
              setPreview(null);
            }}
          />
        )}
        {error && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </Dialog>
      <Dialog
        open={dialog === "copy"}
        title="复制其他日期的餐食"
        onClose={() => setDialog(null)}
      >
        <div className="flex gap-2">
          <input
            className="field min-w-0 flex-1"
            type="date"
            aria-label="复制来源日期"
            disabled={busy}
            value={copyDate}
            onChange={(e) => {
              setCopyDate(e.target.value);
              setPreview(null);
            }}
          />
          <button
            className="btn-primary"
            disabled={!copyDate || busy}
            type="button"
            onClick={async () => {
              if (!user) return;
              setBusy(true);
              setError("");
              setPreview(null);
              try {
                const plans = await loadPlansInRange(user, copyDate, copyDate);
                const source = plans[0];
                if (!source) {
                  setError("这一天还没有保存餐食计划。");
                  return;
                }
                setPreview(
                  source.meals.map((m) => ({
                    ...m,
                    id: crypto.randomUUID(),
                    entries: m.entries.map((e) => ({
                      ...e,
                      id: crypto.randomUUID(),
                    })),
                  })),
                );
              } catch {
                setError("读取失败，请稍后重试。");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "读取中…" : "预览"}
          </button>
        </div>
        {error && (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {preview && (
          <CopyPreview
            meals={preview}
            onApply={() => {
              c.replaceMeals?.(preview);
              setDialog(null);
              setPreview(null);
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={dialog === "recommend"}
        title="分量调整预览"
        onClose={() => setDialog(null)}
        wide
      >
        <p className="mb-4 text-sm text-muted">
          固定的食物保持不变。确认后应用以下分量。
        </p>
        <div className="space-y-2">
          {c.meals
            .flatMap((m) => m.entries.map((e) => ({ meal: m, entry: e })))
            .filter(({ meal: m, entry: e }) => !m.locked && !e.locked)
            .map(({ meal: m, entry: e }) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-4 border-b border-line py-2 text-sm"
              >
                <span>
                  {resolveMealFood(e, c.foodsById).food?.name ?? "未找到食物"}
                  <small className="ml-2 text-muted">{m.name}</small>
                </span>
                <span className="shrink-0 tabular-nums">
                  {round(e.grams, 1)} →{" "}
                  {round(
                    c.recommendationsByMeal.get(m.id)?.recommendedEntries[
                      e.id
                    ] ?? e.grams,
                    1,
                  )}{" "}
                  g
                </span>
              </div>
            ))}
        </div>
        {c.result.conflicts.length > 0 && (
          <p className="mt-3 text-sm text-warning">
            按当前食物和固定分量，暂时无法完全匹配目标。可在应用后继续调整。
          </p>
        )}
        <p className="my-4 text-sm">
          调整后 {energy(c.result.recommendedTotals.kcal)} {unit} · 目标{" "}
          {energy(c.result.dailyTarget.kcal)} {unit}
        </p>
        <button
          className="btn-primary"
          type="button"
          onClick={() => {
            c.applyRecommendations();
            setDialog(null);
          }}
        >
          <Check size={16} />
          确认调整
        </button>
      </Dialog>
    </section>
  );
}

function CopyPreview({
  meals,
  onApply,
}: {
  meals: MealPlan[];
  onApply: () => void;
}) {
  return (
    <div className="mt-5 space-y-3 rounded-xl bg-panel p-4">
      <h3 className="font-semibold">将载入 {meals.length} 餐</h3>
      {meals.map((m) => (
        <div key={m.id}>
          <p className="flex justify-between text-sm">
            <span>{m.name}</span>
            <span className="text-muted">{m.entries.length} 项食物</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            {m.entries
              .map(
                (e) =>
                  `${e.foodSnapshot?.name ?? e.customFood?.name ?? "食物"} ${e.grams}g${e.useEdiblePortion ? `（可食部 ${e.ediblePercent}%）` : ""}`,
              )
              .join("、")}
          </p>
        </div>
      ))}
      <p className="text-xs text-muted">
        确认后替换当前餐食，保留当天目标。替换后可以撤销。
      </p>
      <button className="btn-primary" type="button" onClick={onApply}>
        确认替换餐食
      </button>
    </div>
  );
}

function FoodEntryRow({
  entry,
  mealLocked,
  food,
  energyUnit,
  onChange,
  onPick,
  onDelete,
}: {
  entry: MealFoodEntry;
  mealLocked: boolean;
  food: FoodItem | null;
  energyUnit: EnergyUnit;
  onChange: (mapper: (entry: MealFoodEntry) => MealFoodEntry) => void;
  onPick: () => void;
  onDelete: () => void;
}) {
  const [pendingEdible, setPendingEdible] = useState(false);
  const enabled = Boolean(entry.useEdiblePortion) || pendingEdible;
  const total = food
    ? calculateFoodTotals(food, entry.grams, entry)
    : { kcal: 0, carbs: 0, protein: 0, fat: 0 };
  const name = food?.name ?? "未找到食物";
  const unit = energyUnit === "kj" ? "kJ" : "kcal";
  return (
    <article className="food-entry-row">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <button
            className="break-words text-left text-sm font-semibold hover:text-accent2"
            type="button"
            aria-label={`更换${name}`}
            onClick={onPick}
          >
            {name}
          </button>
          <p className="mt-1 text-xs text-muted">
            {food?.category}
            {food?.weightBasis === "raw"
              ? " · 生重"
              : food?.weightBasis === "cooked"
                ? " · 熟重"
                : ""}
          </p>
        </div>
        <button
          className="icon-button shrink-0 text-muted hover:text-danger"
          type="button"
          aria-label={`删除${name}`}
          onClick={onDelete}
        >
          <Trash2 size={17} />
        </button>
      </div>
      <div className="food-entry-values">
        <div className="food-amount-control" data-tour="food-amount">
          <NumericInput
            className="field w-24"
            label={`${name}克重`}
            aria-label={`${name}克重`}
            min={0}
            required
            value={entry.grams}
            onValueChange={(value) => {
              onChange((e) => ({ ...e, grams: value as number, locked: true }));
              tutorialAction("food-weight-changed");
            }}
          />
          <span className="text-xs text-muted">g</span>
          <button
            type="button"
            className={`portion-lock ${mealLocked || entry.locked ? "is-locked" : ""}`}
            data-tour="food-lock"
            aria-label={`锁定${name}分量`}
            aria-pressed={mealLocked || entry.locked}
            disabled={mealLocked}
            title={mealLocked ? "整餐已锁定，请先解锁整餐" : entry.locked ? "已锁定分量；点击允许自动调整" : "点击锁定，自动调整会保留这项分量"}
            onClick={() => { onChange(v => ({ ...v, locked: !v.locked })); tutorialAction("food-lock-changed"); }}
          >
            {mealLocked || entry.locked ? <Lock size={17} /> : <LockOpen size={17} />}
          </button>
        </div>
        <div className="min-w-0 text-right">
          <strong className="text-base tabular-nums">
            {food ? round(displayEnergy(total.kcal, energyUnit), 1) : "—"}{" "}
            <small className="font-normal text-muted">{unit}</small>
          </strong>
          <p className="mt-1 break-words text-xs tabular-nums text-muted">
            碳 {round(total.carbs, 1)} · 蛋 {round(total.protein, 1)} · 脂{" "}
            {round(total.fat, 1)} g
          </p>
        </div>
      </div>
      <div className="food-entry-options">
        <label className="check-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => {
              const checked = event.target.checked;
              if (!checked) {
                setPendingEdible(false);
                onChange((e) => ({ ...e, useEdiblePortion: false }));
                return;
              }
              const percent = entry.ediblePercent ?? food?.ediblePercent;
              if (isEdiblePercent(percent)) {
                onChange((e) => ({
                  ...e,
                  useEdiblePortion: true,
                  ediblePercent: percent,
                }));
              } else setPendingEdible(true);
            }}
          />
          换算可食部
        </label>
        {enabled ? (
          <>
            <label className="flex items-center gap-1 text-xs text-muted">
              <NumericInput
                className="field w-20"
                label={`${name}可食部比例`}
                aria-label={`${name}可食部比例`}
                minExclusive={0}
                max={100}
                required
                value={entry.ediblePercent}
                placeholder="比例"
                onValueChange={(value) => {
                  if (isEdiblePercent(value)) {
                    setPendingEdible(false);
                    onChange((e) => ({
                      ...e,
                      useEdiblePortion: true,
                      ediblePercent: value,
                    }));
                  }
                }}
              />
              %
            </label>
            <span className="text-xs text-accent2">
              {entry.useEdiblePortion
                ? `称重 ${round(entry.grams, 1)} g → 可食 ${round(edibleGrams(entry.grams, entry), 1)} g`
                : "填写比例后生效"}
            </span>
          </>
        ) : (
          <span className="text-xs text-muted">重量按可食用部分计算</span>
        )}
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer py-1">
          分量范围
        </summary>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1">
            最少
            <NumericInput
              className="field w-20"
              label={`${name}最小克重`}
              min={0}
              blankValue={null}
              value={entry.minGrams}
              validateValue={(n) =>
                entry.maxGrams != null && n > entry.maxGrams
                  ? "不能大于最多分量"
                  : null
              }
              onValueChange={(n) =>
                onChange((e) => ({ ...e, minGrams: n ?? null }))
              }
            />
          </label>
          <label className="flex items-center gap-1">
            最多
            <NumericInput
              className="field w-20"
              label={`${name}最大克重`}
              min={0}
              blankValue={null}
              value={entry.maxGrams}
              validateValue={(n) =>
                entry.minGrams != null && n < entry.minGrams
                  ? "不能小于最少分量"
                  : null
              }
              onValueChange={(n) =>
                onChange((e) => ({ ...e, maxGrams: n ?? null }))
              }
            />
          </label>
        </div>
      </details>
    </article>
  );
}
