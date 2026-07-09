"use client";

import type { User } from "@supabase/supabase-js";
import { Copy, Download, Pencil, Plus, RotateCcw, Save, Search, Trash2, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { foodCategories, type FoodFormState, type FoodItem } from "@/lib/types";
import { deleteFood, saveFood } from "@/lib/storage";
import { sortFoods } from "@/lib/foods";
import { calculateFoodKcalPer100g, getFoodEnergyMismatch, round } from "@/lib/nutrition";
import { csvToFoodForms, foodsToCsv, jsonToFoodForms } from "@/lib/dataIO";

interface FoodLibraryProps {
  foods: FoodItem[];
  user: User | null;
  onFoodsChanged: () => Promise<void>;
  onFoodsUpdated: (foods: FoodItem[]) => void;
}

type SourceFilter = "all" | "public" | "user";

const emptyForm: FoodFormState = {
  name: "",
  category: "主食",
  kcalPer100g: 130,
  fatPer100g: 0.21,
  carbsPer100g: 28.59,
  proteinPer100g: 2.38,
  weightBasis: "cooked",
  cookedRawRatio: 2.5
};

const severityBadge: Record<"ok" | "warn" | "error", { label: string; cls: string } | null> = {
  ok: null,
  warn: { label: "能量偏差", cls: "border-amber/40 bg-amber-50 text-amber-800" },
  error: { label: "能量不符", cls: "border-rose/40 bg-rose-50 text-rose" }
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

export function FoodLibrary({ foods, user, onFoodsChanged, onFoodsUpdated }: FoodLibraryProps) {
  const [form, setForm] = useState<FoodFormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<FoodItem["category"]>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingFood, setEditingFood] = useState<FoodItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formKcalPer100g = calculateFoodKcalPer100g(form);

  // 重复检测：按小写名出现次数。
  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const food of foods) {
      const key = food.name.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(Array.from(counts.entries()).filter(([, n]) => n > 1).map(([name]) => name));
  }, [foods]);

  const stats = useMemo(() => {
    let warnings = 0;
    for (const food of foods) {
      if (getFoodEnergyMismatch(food).severity !== "ok") {
        warnings += 1;
      }
    }
    return { total: foods.length, warnings, duplicates: duplicateNames.size };
  }, [foods, duplicateNames]);

  const visibleFoods = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = foods.filter((food) => {
      if (term && !food.name.toLowerCase().includes(term)) {
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
    return sortFoods(filtered);
  }, [foods, search, activeCategories, sourceFilter]);

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

  function updateNumber(key: keyof FoodFormState, value: string) {
    setForm((current) => ({ ...current, [key]: value === "" ? 0 : Number(value) }));
  }

  function startEditFood(food: FoodItem) {
    setEditingFood(food);
    setForm({
      name: food.name,
      category: food.category,
      kcalPer100g: calculateFoodKcalPer100g(food),
      fatPer100g: food.fatPer100g,
      carbsPer100g: food.carbsPer100g,
      proteinPer100g: food.proteinPer100g,
      weightBasis: food.weightBasis,
      cookedRawRatio: food.cookedRawRatio ?? null
    });
    setMessage("");
  }

  function cancelEdit() {
    setEditingFood(null);
    setForm(emptyForm);
    setMessage("");
  }

  async function submitFood() {
    if (!form.name.trim()) {
      setMessage("食物名称不能为空。");
      return;
    }
    const payload: FoodItem = {
      id: editingFood?.id ?? "",
      userId: editingFood?.userId,
      ...form,
      kcalPer100g: formKcalPer100g,
      name: form.name.trim(),
      cookedRawRatio: form.cookedRawRatio ? Number(form.cookedRawRatio) : null,
      source: editingFood?.source ?? "user",
      isUserOverride: editingFood?.source === "public" || editingFood?.isUserOverride
    };
    setBusy(true);
    setMessage("");
    try {
      const savedFood = await saveFood(payload, user);
      onFoodsUpdated([...foods.filter((food) => food.id !== savedFood.id), savedFood]);
      setForm(emptyForm);
      setEditingFood(null);
      setMessage(editingFood ? "食物已更新。" : "食物已保存。");
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
        id: "",
        name: `${food.name} (副本)`,
        category: food.category,
        kcalPer100g: calculateFoodKcalPer100g(food),
        fatPer100g: food.fatPer100g,
        carbsPer100g: food.carbsPer100g,
        proteinPer100g: food.proteinPer100g,
        weightBasis: food.weightBasis,
        cookedRawRatio: food.cookedRawRatio ?? null,
        source: "user"
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
      await onFoodsChanged();
      setMessage(foodId.startsWith("public-") ? "公共食物已恢复默认值。" : "食物已删除。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "删除失败。");
    } finally {
      setBusy(false);
    }
  }

  function exportFoods(format: "csv" | "json") {
    const exportable = visibleFoods.length > 0 ? visibleFoods : foods;
    if (format === "csv") {
      downloadFile("foods.csv", foodsToCsv(exportable), "text/csv;charset=utf-8");
    } else {
      downloadFile("foods.json", JSON.stringify(exportable, null, 2), "application/json");
    }
    setMessage(`已导出 ${exportable.length} 条食物（${format.toUpperCase()}）。`);
  }

  async function importFoods(file: File) {
    setBusy(true);
    setMessage("正在导入…");
    try {
      const text = await file.text();
      const parsed = file.name.toLowerCase().endsWith(".json") ? jsonToFoodForms(text) : csvToFoodForms(text);
      if (parsed.foods.length === 0) {
        setMessage("未解析到可导入的食物（请检查表头：name,category,kcalPer100g,fatPer100g,carbsPer100g,proteinPer100g,weightBasis,cookedRawRatio）。");
        return;
      }
      let ok = 0;
      for (const foodForm of parsed.foods) {
        await saveFood({ id: "", source: "user", ...foodForm }, user);
        ok += 1;
      }
      await onFoodsChanged();
      setMessage(`导入完成：成功 ${ok} 条${parsed.skipped ? `，跳过 ${parsed.skipped} 条（缺名）` : ""}。`);
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
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]">
      <div className="panel p-4">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gradient">{editingFood ? "编辑食物" : "新增食物"}</h2>
          <p className="text-sm text-muted">
            {editingFood?.source === "public"
              ? "公共食物会保存为你的覆盖值，不影响其他用户。"
              : "营养值按每 100g 保存；热量由净碳水、蛋白、脂肪自动计算。"}
          </p>
        </div>
        <div className="grid gap-3">
          <label>
            <span className="metric-label mb-1 block">名称</span>
            <input className="field w-full" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="metric-label mb-1 block">分类</span>
              <select className="field w-full" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as FoodItem["category"] })}>
                {foodCategories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="metric-label mb-1 block">口径</span>
              <select className="field w-full" value={form.weightBasis} onChange={(event) => setForm({ ...form, weightBasis: event.target.value as FoodItem["weightBasis"] })}>
                <option value="raw">生重</option>
                <option value="cooked">熟重</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="metric-label mb-1 block">热量 kcal/100g</span>
              <div className="field flex w-full items-center bg-surface/60 text-muted">{round(formKcalPer100g, 1)}</div>
            </div>
            <label>
              <span className="metric-label mb-1 block">脂肪 g/100g</span>
              <input className="field w-full" type="number" value={form.fatPer100g} onChange={(event) => updateNumber("fatPer100g", event.target.value)} />
            </label>
            <label>
              <span className="metric-label mb-1 block">净碳水 g/100g</span>
              <input className="field w-full" type="number" value={form.carbsPer100g} onChange={(event) => updateNumber("carbsPer100g", event.target.value)} />
            </label>
            <label>
              <span className="metric-label mb-1 block">蛋白 g/100g</span>
              <input className="field w-full" type="number" value={form.proteinPer100g} onChange={(event) => updateNumber("proteinPer100g", event.target.value)} />
            </label>
          </div>
          <label>
            <span className="metric-label mb-1 block">熟化换算率，可空</span>
            <input
              className="field w-full"
              type="number"
              value={form.cookedRawRatio ?? ""}
              onChange={(event) => setForm({ ...form, cookedRawRatio: event.target.value === "" ? null : Number(event.target.value) })}
              placeholder="例：生米1g对应熟饭2.5g"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" type="button" onClick={submitFood} disabled={busy}>
              {editingFood ? <Save size={16} /> : <Plus size={16} />}
              {editingFood ? "更新食物" : "保存食物"}
            </button>
            {editingFood ? (
              <button className="btn-secondary" type="button" onClick={cancelEdit} disabled={busy}>
                <X size={16} /> 取消编辑
              </button>
            ) : null}
          </div>
          {message ? (
            <p className={`rounded-md border p-3 text-sm ${message.includes("失败") || message.includes("不能") || message.includes("未解析") ? "border-rose/30 bg-rose/10 text-rose" : "border-line bg-surface/80 text-ink"}`}>
              {message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gradient">食物库</h2>
              <p className="text-sm text-muted">
                共 {stats.total} 条 · <span className={stats.warnings ? "text-amber-300" : ""}>{stats.warnings} 条能量偏差</span> · <span className={stats.duplicates ? "text-rose" : ""}>{stats.duplicates} 组重名</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary h-9 px-2.5 text-xs" type="button" onClick={() => exportFoods("csv")}>
                <Download size={14} /> CSV
              </button>
              <button className="btn-secondary h-9 px-2.5 text-xs" type="button" onClick={() => exportFoods("json")}>
                <Download size={14} /> JSON
              </button>
              <button className="btn-cta h-9 px-2.5 text-xs" type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                <Upload size={14} /> 导入
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    importFoods(file);
                  }
                }}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="field w-full pl-9" placeholder="按名称搜索…" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <select className="field lg:w-32" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}>
              <option value="all">全部来源</option>
              <option value="public">公共</option>
              <option value="user">本人</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {foodCategories.map((category) => {
              const active = activeCategories.has(category);
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${active ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-ink"}`}
                >
                  {category}
                </button>
              );
            })}
            {activeCategories.size > 0 ? (
              <button type="button" onClick={() => setActiveCategories(new Set())} className="rounded-full px-2 py-1 text-xs text-muted hover:text-ink">
                清除
              </button>
            ) : null}
          </div>
        </div>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-surface/80 text-xs uppercase tracking-normal text-muted">
              <tr>
                <th className="px-4 py-3">食物</th>
                <th className="px-4 py-3">分类</th>
                <th className="px-4 py-3">热量</th>
                <th className="px-4 py-3">脂肪</th>
                <th className="px-4 py-3">净碳水</th>
                <th className="px-4 py-3">蛋白</th>
                <th className="px-4 py-3">口径</th>
                <th className="px-4 py-3">来源/校验</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleFoods.map((food) => {
                const mismatch = getFoodEnergyMismatch(food);
                const badge = severityBadge[mismatch.severity as "ok" | "warn" | "error"];
                const isDuplicate = duplicateNames.has(food.name.trim().toLowerCase());
                return (
                  <tr key={food.id} className="border-t border-line transition-colors hover:bg-accent/5">
                    <td className="px-4 py-3 font-medium text-ink">
                      <div className="flex items-center gap-2">
                        <span>{food.name}</span>
                        {isDuplicate ? <span className="rounded border border-rose/40 bg-rose/10 px-1.5 py-0.5 text-[10px] text-rose">重名</span> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">{food.category}</td>
                    <td className="px-4 py-3" title={badge ? `按宏量应为 ${round(mismatch.macroKcalPer100g, 1)} kcal` : undefined}>
                      {round(calculateFoodKcalPer100g(food), 1)} kcal
                    </td>
                    <td className="px-4 py-3">{food.fatPer100g} g</td>
                    <td className="px-4 py-3">{food.carbsPer100g} g</td>
                    <td className="px-4 py-3">{food.proteinPer100g} g</td>
                    <td className="px-4 py-3">{food.weightBasis === "raw" ? "生重" : "熟重"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted">{food.source === "public" ? (food.isUserOverride ? "公共·已修改" : "公共") : "本人"}</span>
                        {badge ? <span className={`w-fit rounded border px-1.5 py-0.5 text-[10px] ${badge.cls}`}>{badge.label}</span> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button className="btn-secondary h-8 px-2" type="button" onClick={() => startEditFood(food)} disabled={busy} title="编辑">
                          <Pencil size={14} />
                        </button>
                        <button className="btn-secondary h-8 px-2" type="button" onClick={() => copyFood(food)} disabled={busy} title="复制为自定义">
                          <Copy size={14} />
                        </button>
                        {food.source === "user" ? (
                          <button className="btn-danger h-8 px-2" type="button" onClick={() => removeFood(food.id)} disabled={busy} title="删除">
                            <Trash2 size={14} />
                          </button>
                        ) : null}
                        {food.source === "public" && food.isUserOverride ? (
                          <button className="btn-secondary h-8 px-2" type="button" onClick={() => removeFood(food.id)} disabled={busy} title="重置为默认">
                            <RotateCcw size={14} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleFoods.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted">没有符合条件的食物。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

