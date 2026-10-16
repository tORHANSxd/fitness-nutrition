"use client";

import type { User } from "@supabase/supabase-js";
import {
  Archive,
  Copy,
  Download,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { foodCategories, type FoodFormState, type FoodItem } from "@/lib/types";
import {
  deleteFood,
  importUserFoods,
  loadArchivedFoods,
  restoreFood,
  saveFood,
} from "@/lib/storage";
import { selectableFoodCatalog } from "@/lib/foodCatalog";
import { Dialog } from "@/components/Dialog";
import {
  calculateFoodKcalPer100g,
  round,
  weightBasisLabel,
} from "@/lib/nutrition";
import { csvToFoodForms, foodsToCsv, jsonToFoodForms } from "@/lib/dataIO";
import { displayEnergy, type EnergyUnit } from "@/lib/preferences";
import {
  NumericDraftNotice,
  NumericDraftProvider,
  NumericInput,
  useNumericDraftForm,
} from "@/components/NumericInput";
import { roundForStorage } from "@/lib/numericInput";
import { matchesFoodSearch } from "@/lib/chinaFoodComposition";
import { FoodPagination, useFoodPage } from "@/components/FoodPagination";
import { foodNutritionMetadata, macroEnergyPer100g, parseFoodNutritionMetadata } from "@/lib/foodNutrition";

interface FoodLibraryProps {
  foods: FoodItem[];
  user: User | null;
  onFoodsChanged: () => Promise<void>;
  onFoodsUpdated: (foods: FoodItem[]) => void;
  energyUnit?: EnergyUnit;
}

type SourceFilter = "all" | "public" | "user";

const emptyForm: FoodFormState = {
  ...foodNutritionMetadata({ sourceEnergyMethod: "macro_estimate" }),
  name: "",
  category: "主食",
  kcalPer100g: 0,
  fatPer100g: 0,
  carbsPer100g: 0,
  proteinPer100g: 0,
  weightBasis: "none",
  cookedRawRatio: null,
};

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function FoodLibrary({
  foods,
  user,
  onFoodsChanged,
  onFoodsUpdated,
  energyUnit = "kcal",
}: FoodLibraryProps) {
  const numericDraftForm = useNumericDraftForm();
  const [form, setForm] = useState<FoodFormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [activeCategories, setActiveCategories] = useState<
    Set<FoodItem["category"]>
  >(new Set());
  const energyLabel = energyUnit === "kj" ? "kJ" : "kcal";
  const energyValue = (kcal: number) =>
    round(displayEnergy(kcal, energyUnit), 1);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedFoods, setArchivedFoods] = useState<FoodItem[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [editingFood, setEditingFood] = useState<FoodItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [archivedId, setArchivedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formKcalPer100g = calculateFoodKcalPer100g(form);
  const libraryFoods = useMemo(
    () => selectableFoodCatalog(showArchived ? archivedFoods : foods),
    [showArchived, archivedFoods, foods],
  );

  useEffect(() => {
    if (!showArchived || !user) return;
    let cancelled = false;
    setArchivedLoading(true);
    loadArchivedFoods(user)
      .then((items) => {
        if (!cancelled) setArchivedFoods(items);
      })
      .catch((error) => {
        if (!cancelled)
          setMessage(
            error instanceof Error ? error.message : "归档食物加载失败。",
          );
      })
      .finally(() => {
        if (!cancelled) setArchivedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showArchived, user]);

  const visibleFoods = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = libraryFoods.filter((food) => {
      if (!matchesFoodSearch(food, term)) {
        return false;
      }
      if (activeCategories.size > 0 && !activeCategories.has(food.category)) {
        return false;
      }
      if (sourceFilter === "public" && food.source !== "public") {
        return false;
      }
      if (sourceFilter === "user" && food.source !== "user") {
        return false;
      }
      return true;
    });
    // 全站统一排序：始终按「分类 → 拼音名」，不再提供按营养素列排序。
    return filtered;
  }, [libraryFoods, search, activeCategories, sourceFilter]);

  const pagination = useFoodPage(
    visibleFoods,
    JSON.stringify([search, [...activeCategories], sourceFilter, showArchived]),
    12,
  );

  function toggleCategory(category: FoodItem["category"]) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  function startEditFood(food: FoodItem) {
    setFormOpen(true);
    setEditingFood(food);
    setForm({
      ...foodNutritionMetadata(food),
      servingDescription: food.servingDescription,
      name: food.name,
      category: food.category,
      kcalPer100g: calculateFoodKcalPer100g(food),
      fatPer100g: food.fatPer100g,
      carbsPer100g: food.carbsPer100g,
      proteinPer100g: food.proteinPer100g,
      weightBasis: food.weightBasis,
      cookedRawRatio: food.cookedRawRatio ?? null,
    });
    setMessage("");
  }

  function cancelEdit() {
    setEditingFood(null);
    setForm(emptyForm);
    setMessage("");
  }

  async function submitFood() {
    if (!numericDraftForm.validateAll()) {
      setMessage("请先修正标红的数字，再保存食物。");
      return;
    }
    if (!form.name.trim()) {
      setMessage("食物名称不能为空。");
      return;
    }
    const normalizedForm: FoodFormState = {
      ...form,
      sourceKcalPer100g: form.sourceKcalPer100g == null ? null : roundForStorage(form.sourceKcalPer100g, 2),
      fatPer100g: roundForStorage(form.fatPer100g, 2),
      carbsPer100g: roundForStorage(form.carbsPer100g, 2),
      proteinPer100g: roundForStorage(form.proteinPer100g, 2),
      cookedRawRatio:
        form.cookedRawRatio == null
          ? null
          : roundForStorage(form.cookedRawRatio, 3),
    };
    if (!parseFoodNutritionMetadata({ ...normalizedForm })) {
      setMessage("请核对来源热量、碳水口径和纤维，未知纤维请留空。");
      return;
    }
    if (editingFood?.sourceQuality === "matched_reference" && normalizedForm.sourceQuality === "matched_reference" && (["proteinPer100g", "carbsPer100g", "fatPer100g"] as const).some(key => normalizedForm[key] !== editingFood[key])) normalizedForm.sourceQuality = "unverified";
    const precisionChanged =
      normalizedForm.sourceKcalPer100g !== form.sourceKcalPer100g ||
      normalizedForm.fatPer100g !== form.fatPer100g ||
      normalizedForm.carbsPer100g !== form.carbsPer100g ||
      normalizedForm.proteinPer100g !== form.proteinPer100g ||
      normalizedForm.cookedRawRatio !== form.cookedRawRatio;
    const payload: FoodItem = {
      id: editingFood?.id ?? "",
      userId: editingFood?.userId,
      ...normalizedForm,
      kcalPer100g: normalizedForm.sourceKcalPer100g ?? macroEnergyPer100g(normalizedForm),
      name: form.name.trim(),
      source: editingFood?.source ?? "user",
      isUserOverride:
        editingFood?.source === "public" || editingFood?.isUserOverride,
    };
    setBusy(true);
    setMessage("");
    try {
      const savedFood = await saveFood(payload, user);
      onFoodsUpdated([
        ...foods.filter((food) => food.id !== savedFood.id),
        savedFood,
      ]);
      setForm(emptyForm);
      setEditingFood(null);
      setFormOpen(false);
      setMessage(
        `${editingFood ? "食物已更新" : "食物已保存"}${precisionChanged ? "，数值已保留适当精度" : ""}。`,
      );
      await onFoodsChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  }

  async function copyFood(food: FoodItem) {
    setBusy(true);
    setMessage("");
    try {
      const copy: FoodItem = {
        ...foodNutritionMetadata(food),
        servingDescription: food.servingDescription,
        id: "",
        name: `${food.name} (副本)`,
        category: food.category,
        kcalPer100g: food.kcalPer100g,
        fatPer100g: food.fatPer100g,
        carbsPer100g: food.carbsPer100g,
        proteinPer100g: food.proteinPer100g,
        weightBasis: food.weightBasis,
        cookedRawRatio: food.cookedRawRatio ?? null,
        source: "user",
      };
      await saveFood(copy, user);
      await onFoodsChanged();
      setMessage(`已复制为自定义食物：${copy.name}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "复制失败。");
    } finally {
      setBusy(false);
    }
  }

  async function removeFood(foodId: string) {
    setBusy(true);
    setMessage("");
    try {
      await deleteFood(foodId, user);
      if (!foodId.startsWith("public-")) setArchivedId(foodId);
      await onFoodsChanged();
      setMessage(
        foodId.startsWith("public-")
          ? "公共食物已恢复默认值。"
          : "食物已归档，可在归档视图中恢复。",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败。");
    } finally {
      setBusy(false);
    }
  }

  function selectArchiveMode(archived: boolean) {
    setShowArchived(archived);
    setSourceFilter(archived ? "user" : "all");
    setEditingFood(null);
    setForm(emptyForm);
    setMessage("");
  }

  async function restoreArchivedFood(foodId: string) {
    setBusy(true);
    setMessage("");
    try {
      await restoreFood(foodId, user);
      setArchivedId(null);
      setArchivedFoods((current) =>
        current.filter((food) => food.id !== foodId),
      );
      await onFoodsChanged();
      setMessage("食物已恢复到在用列表。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "恢复失败。");
    } finally {
      setBusy(false);
    }
  }

  function exportFoods(format: "csv" | "json") {
    const exportable = visibleFoods.length > 0 ? visibleFoods : libraryFoods;
    if (format === "csv") {
      downloadFile(
        "foods.csv",
        foodsToCsv(exportable),
        "text/csv;charset=utf-8",
      );
    } else {
      downloadFile(
        "foods.json",
        JSON.stringify(exportable, null, 2),
        "application/json",
      );
    }
    setMessage(
      `已导出 ${exportable.length} 条食物（${format.toUpperCase()}）。`,
    );
  }

  async function importFoods(file: File) {
    setBusy(true);
    setMessage("正在导入…");
    try {
      const text = await file.text();
      const parsed = file.name.toLowerCase().endsWith(".json")
        ? jsonToFoodForms(text)
        : csvToFoodForms(text);
      if (parsed.foods.length === 0) {
        setMessage(
          parsed.errors.length ? parsed.errors.slice(0, 3).map(error => `第${error.index}条：${error.message}`).join("；") : "没有可导入的食物。",
        );
        return;
      }
      const result = await importUserFoods(parsed.foods, user, true);
      await onFoodsChanged();
      setMessage(
        `导入完成：成功 ${result.inserted} 条${parsed.skipped ? `，未导入 ${parsed.skipped} 条：${parsed.errors.slice(0, 3).map(error => `第${error.index}条 ${error.message}`).join("；")}` : ""}。`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败。");
    } finally {
      setBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <NumericDraftProvider form={numericDraftForm}>
      <section className="panel overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
          <div>
            <h2 className="text-lg">
              {showArchived ? "已归档食物" : "我的食物与公共食物"}
            </h2>
            <p className="mt-1 text-xs text-muted">
              每 100 g 可食用部分 · 来源热量与 4/4/9 估算分别保留
            </p>
          </div>
          <button
            className="btn-primary"
            type="button"
            data-tour="food-create"
            onClick={() => {
              cancelEdit();
              setFormOpen(true);
            }}
          >
            <Plus size={16} />
            添加食物
          </button>
        </header>
        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-0 flex-1">
              <Search
                size={17}
                className="pointer-events-none absolute left-3 top-3.5 text-muted"
              />
              <input
                className="field w-full pl-10"
                aria-label="搜索食物"
                placeholder="搜索食物名称…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="field"
              aria-label="食物来源"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            >
              <option value="all">全部食物</option>
              <option value="user">我的食物</option>
              <option value="public">公共食物</option>
            </select>
          </div>
          <div className="food-category-strip">
            <button
              type="button"
              className={activeCategories.size === 0 ? "is-active" : ""}
              onClick={() => setActiveCategories(new Set())}
            >
              全部分类
            </button>
            {foodCategories.map((category) => (
              <button
                type="button"
                className={activeCategories.has(category) ? "is-active" : ""}
                aria-pressed={activeCategories.has(category)}
                onClick={() => toggleCategory(category)}
                key={category}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 text-xs text-muted">
            <span>{visibleFoods.length} 项食物 · 个人添加优先</span>
            <button
              className="btn-text"
              type="button"
              onClick={() => selectArchiveMode(!showArchived)}
            >
              {showArchived ? "返回食物库" : "查看归档"}
            </button>
          </div>
        </div>
        {message && !formOpen && (
          <div
            className="mx-5 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-panel px-4 py-3 text-sm"
            role="status"
          >
            <span>{message}</span>
            {archivedId && (
              <button
                className="btn-text"
                type="button"
                disabled={busy}
                onClick={() => void restoreArchivedFood(archivedId)}
              >
                撤销归档
              </button>
            )}
          </div>
        )}
        {archivedLoading ? (
          <p className="p-5 text-sm text-muted">正在读取归档…</p>
        ) : pagination.items.length ? (
          <ul className="divide-y divide-line px-4 sm:px-5">
            {pagination.items.map((food) => (
              <li key={food.id} className="food-library-row">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold">
                    {food.name}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                    <span>
                      {food.category} · {weightBasisLabel(food.weightBasis)}
                    </span>
                    {food.source === "user" || food.isUserOverride ? (
                      <span className="food-badge">
                        {food.isUserOverride ? "已调整" : "我的食物"}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs tabular-nums text-muted">
                    碳 {round(food.carbsPer100g, 1)} · 蛋{" "}
                    {round(food.proteinPer100g, 1)} · 脂{" "}
                    {round(food.fatPer100g, 1)} g
                  </p>
                  <p className="mt-1 text-xs text-muted">来源热量 {food.sourceKcalPer100g == null ? "未知" : energyValue(food.sourceKcalPer100g)} · 4/4/9估算 {energyValue(macroEnergyPer100g(food))} {energyLabel}；纤维 {food.fiberPer100g == null ? "未知" : `${food.fiberPer100g} g`} · {food.sourceQuality === "verified_label" ? "已核对标签" : food.sourceQuality === "matched_reference" ? "成分表参考" : "估值待核实"}</p>
                  {food.servingDescription && (
                    <details className="mt-2 text-xs text-muted">
                      <summary className="cursor-pointer">数据来源与称重口径</summary>
                      {food.isUserOverride && <p className="mt-1">当前为个人修改值，下述来源仅供核对原始参考。</p>}
                      <p className="mt-1 max-w-xl break-words">{food.servingDescription}</p>
                    </details>
                  )}
                </div>
                <strong className="text-right text-base tabular-nums">
                  {energyValue(calculateFoodKcalPer100g(food))}
                  <small className="ml-1 text-xs font-normal text-muted">
                    {energyLabel}
                  </small>
                </strong>
                <div className="flex items-center gap-1">
                  {showArchived ? (
                    <button
                      className="btn-secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => void restoreArchivedFood(food.id)}
                    >
                      <RotateCcw size={15} />
                      恢复
                    </button>
                  ) : (
                    <>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`编辑${food.name}`}
                        disabled={busy}
                        onClick={() => startEditFood(food)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`复制${food.name}`}
                        disabled={busy}
                        onClick={() => void copyFood(food)}
                      >
                        <Copy size={16} />
                      </button>
                      {food.source === "user" || food.isUserOverride ? (
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`归档${food.name}`}
                          disabled={busy}
                          onClick={() => void removeFood(food.id)}
                        >
                          <Archive size={16} />
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <Search size={28} />
            <p>还没有符合条件的食物</p>
            <button
              type="button"
              className="btn-text"
              onClick={() => {
                setSearch("");
                setActiveCategories(new Set());
                setSourceFilter("all");
              }}
            >
              清除筛选
            </button>
          </div>
        )}
        <FoodPagination {...pagination} />
        <details className="border-t border-line p-5">
          <summary className="cursor-pointer text-sm text-muted">
            导入与导出
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="btn-secondary"
              onClick={() => exportFoods("csv")}
              type="button"
            >
              <Download size={15} />
              导出表格
            </button>
            <button
              className="btn-secondary"
              onClick={() => exportFoods("json")}
              type="button"
            >
              导出备份
            </button>
            <button
              className="btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              type="button"
            >
              <Upload size={15} />
              导入食物
            </button>
            <input
              className="hidden"
              ref={fileInputRef}
              type="file"
              accept=".csv,.json"
              aria-label="导入食物文件"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFoods(file);
              }}
            />
          </div>
        </details>
      </section>
      <Dialog
        open={formOpen}
        title={editingFood ? "编辑食物" : "添加食物"}
        onClose={() => {
          if (!busy) {
            setFormOpen(false);
            cancelEdit();
          }
        }}
      >
        <p className="mb-4 text-sm text-muted">
          {editingFood?.source === "public"
            ? "修改仅对你的账户生效。"
            : "填写每 100 g 可食用部分的营养。"}
          热量自动计算。
        </p>
        <div className="grid gap-4">
          <label className="text-sm">
            食物名称
            <input
              className="field mt-1 w-full"
              maxLength={120}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              分类
              <select
                className="field mt-1 w-full"
                value={form.category}
                onChange={(e) =>
                  setForm({
                    ...form,
                    category: e.target.value as FoodItem["category"],
                  })
                }
              >
                {foodCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              称重状态
              <select
                className="field mt-1 w-full"
                value={form.weightBasis}
                onChange={(e) =>
                  setForm({
                    ...form,
                    weightBasis: e.target.value as FoodItem["weightBasis"],
                  })
                }
              >
                <option value="raw">生重</option>
                <option value="cooked">熟重</option>
                <option value="none">无需区分</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                { key: "carbsPer100g", label: "碳水" },
                { key: "proteinPer100g", label: "蛋白质" },
                { key: "fatPer100g", label: "脂肪" },
              ] as const
            ).map(({ key, label }) => (
              <label className="text-sm" key={key}>
                {label}（g）
                <NumericInput
                  className="field mt-1 w-full"
                  label={label}
                  min={0}
                  max={100}
                  required
                  value={form[key]}
                  onValueChange={(n) =>
                    setForm((current) => ({ ...current, [key]: n as number }))
                  }
                />
              </label>
            ))}
          </div>
          <div className="rounded-xl bg-panel p-4 text-sm">
            每 100 g 热量{" "}
            <strong className="float-right tabular-nums">
              {energyValue(formKcalPer100g)} {energyLabel}
            </strong>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">来源热量（kcal/100g，可留空）<NumericInput className="field mt-1 w-full" label="来源热量" aria-label="来源热量" min={0} blankValue={null} value={form.sourceKcalPer100g} onValueChange={value => setForm(current => ({ ...current, sourceKcalPer100g: value ?? null, effectiveEnergyBasis: value == null ? "macros" : current.effectiveEnergyBasis }))} /></label>
            <label className="text-sm">膳食纤维（g/100g，未知留空）<NumericInput className="field mt-1 w-full" label="膳食纤维" aria-label="膳食纤维" min={0} max={100} blankValue={null} value={form.fiberPer100g} onValueChange={value => setForm(current => ({ ...current, fiberPer100g: value ?? null }))} /></label>
            <label className="text-sm">热量计算口径<select className="field mt-1 w-full" aria-label="热量计算口径" value={form.effectiveEnergyBasis ?? "macros"} onChange={event => setForm(current => ({ ...current, effectiveEnergyBasis: event.target.value as "label" | "macros" }))}><option value="macros">明确使用4/4/9估算</option><option value="label" disabled={form.sourceKcalPer100g == null}>使用来源热量</option></select></label>
            <label className="text-sm">数据来源质量<select className="field mt-1 w-full" aria-label="数据来源质量" value={form.sourceQuality ?? "unverified"} onChange={event => setForm(current => ({ ...current, sourceQuality: event.target.value as FoodItem["sourceQuality"], sourceEnergyMethod: event.target.value === "verified_label" ? "product_label" : event.target.value === "matched_reference" ? "food_composition" : event.target.value === "recipe_estimate" ? "recipe" : "macro_estimate" }))}><option value="unverified">未核实估值</option><option value="verified_label">已核对实际产品标签</option><option value="matched_reference">匹配成分表参考</option><option value="recipe_estimate">配方估算</option></select></label>
            <label className="text-sm">来源碳水口径<select className="field mt-1 w-full" aria-label="来源碳水口径" value={form.carbohydrateBasis ?? "unknown"} onChange={event => setForm(current => ({ ...current, carbohydrateBasis: event.target.value as FoodItem["carbohydrateBasis"] }))}><option value="unknown">未知，不自动扣纤维</option><option value="available_excluding_fiber">可利用碳水（不含纤维）</option><option value="total_including_fiber">总碳水（含纤维）</option><option value="net_declared">来源已声明净碳水</option></select></label>
            <label className="text-sm">原标签碳水（g/100g，可留空）<NumericInput className="field mt-1 w-full" label="原标签碳水" min={0} max={100} blankValue={null} value={form.sourceCarbsPer100g} onValueChange={value => setForm(current => ({ ...current, sourceCarbsPer100g: value ?? null }))} /></label>
          </div>
          <p className="text-xs text-muted">上方宏量用于计算；原标签碳水和纤维单独保留，不会对已声明净碳水再次扣减。烹调出成率不代表营养保留率。</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.portionPolicy === "fixed_dose"} onChange={event => setForm(current => ({ ...current, portionPolicy: event.target.checked ? "fixed_dose" : "food" }))} />固定剂量，不参与自动配餐</label>
          <details>
            <summary className="cursor-pointer text-sm text-muted">
              更多设置
            </summary>
            <label className="mt-3 block text-sm">
              熟重 ÷ 生重（可选）
              <NumericInput
                className="field mt-1 w-full"
                label="熟化换算率"
                minExclusive={0}
                blankValue={null}
                value={form.cookedRawRatio}
                onValueChange={(n) =>
                  setForm((current) => ({ ...current, cookedRawRatio: n }))
                }
              />
            </label>
            <p className="mt-1 text-xs text-muted">
              例如 100 g 生米煮成 250 g 米饭，填 2.5。
            </p>
          </details>
          <NumericDraftNotice />
          {message && (
            <p role="status" className="text-sm">
              {message}
            </p>
          )}
          <button
            className="btn-primary w-full"
            type="button"
            onClick={() => void submitFood()}
            disabled={busy}
          >
            <Save size={16} />
            {busy ? "保存中…" : "保存食物"}
          </button>
        </div>
      </Dialog>
    </NumericDraftProvider>
  );
}
