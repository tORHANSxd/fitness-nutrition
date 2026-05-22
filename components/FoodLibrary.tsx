"use client";

import type { User } from "@supabase/supabase-js";
import { Pencil, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { foodCategories, type FoodFormState, type FoodItem } from "@/lib/types";
import { deleteFood, saveFood } from "@/lib/storage";
import { getFoodEnergyMismatch, round } from "@/lib/nutrition";

interface FoodLibraryProps {
  foods: FoodItem[];
  user: User | null;
  onFoodsChanged: () => Promise<void>;
  onFoodsUpdated: (foods: FoodItem[]) => void;
}

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

export function FoodLibrary({ foods, user, onFoodsChanged, onFoodsUpdated }: FoodLibraryProps) {
  const [form, setForm] = useState<FoodFormState>(emptyForm);
  const [filter, setFilter] = useState<FoodItem["category"] | "全部">("全部");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingFood, setEditingFood] = useState<FoodItem | null>(null);

  const visibleFoods = useMemo(() => {
    return foods.filter((food) => filter === "全部" || food.category === filter);
  }, [filter, foods]);

  function updateNumber(key: keyof FoodFormState, value: string) {
    setForm((current) => ({
      ...current,
      [key]: value === "" ? 0 : Number(value)
    }));
  }

  function startEditFood(food: FoodItem) {
    setEditingFood(food);
    setForm({
      name: food.name,
      category: food.category,
      kcalPer100g: food.kcalPer100g,
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
      name: form.name.trim(),
      cookedRawRatio: form.cookedRawRatio ? Number(form.cookedRawRatio) : null,
      source: editingFood?.source ?? "user",
      isUserOverride: editingFood?.source === "public" || editingFood?.isUserOverride
    };
    const mismatch = getFoodEnergyMismatch(payload);
    if (mismatch.severity === "error") {
      setMessage(
        `热量与碳蛋脂供能不一致：标注 ${round(mismatch.kcalPer100g, 0)} kcal/100g，碳蛋脂约 ${round(mismatch.macroKcalPer100g, 0)} kcal/100g。`
      );
      return;
    }

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

  return (
    <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <div className="panel p-4">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-ink">{editingFood ? "编辑食物" : "新增食物"}</h2>
          <p className="text-sm text-muted">
            {editingFood?.source === "public"
              ? "公共食物会保存为你的覆盖值，不影响其他用户。"
              : "营养值按每 100g 保存。只录入一种口径时，未知换算不显示另一口径。"}
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
              <select
                className="field w-full"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value as FoodItem["category"] })}
              >
                {foodCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="metric-label mb-1 block">口径</span>
              <select
                className="field w-full"
                value={form.weightBasis}
                onChange={(event) => setForm({ ...form, weightBasis: event.target.value as FoodItem["weightBasis"] })}
              >
                <option value="raw">生重</option>
                <option value="cooked">熟重</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="metric-label mb-1 block">热量 kcal/100g</span>
              <input className="field w-full" type="number" value={form.kcalPer100g} onChange={(event) => updateNumber("kcalPer100g", event.target.value)} />
            </label>
            <label>
              <span className="metric-label mb-1 block">脂肪 g/100g</span>
              <input className="field w-full" type="number" value={form.fatPer100g} onChange={(event) => updateNumber("fatPer100g", event.target.value)} />
            </label>
            <label>
              <span className="metric-label mb-1 block">碳水 g/100g</span>
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
              onChange={(event) =>
                setForm({
                  ...form,
                  cookedRawRatio: event.target.value === "" ? null : Number(event.target.value)
                })
              }
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
                <X size={16} />
                取消编辑
              </button>
            ) : null}
          </div>
          {message ? <p className="rounded-md bg-panel p-3 text-sm text-ink">{message}</p> : null}
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">食物库</h2>
            <p className="text-sm text-muted">公共库与本人自定义食物合并显示。</p>
          </div>
          <select className="field w-full md:w-40" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
            <option value="全部">全部</option>
            {foodCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-panel text-xs uppercase tracking-normal text-muted">
              <tr>
                <th className="px-4 py-3">食物</th>
                <th className="px-4 py-3">分类</th>
                <th className="px-4 py-3">热量</th>
                <th className="px-4 py-3">脂肪</th>
                <th className="px-4 py-3">碳水</th>
                <th className="px-4 py-3">蛋白</th>
                <th className="px-4 py-3">口径</th>
                <th className="px-4 py-3">来源</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleFoods.map((food) => (
                <tr key={food.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium text-ink">{food.name}</td>
                  <td className="px-4 py-3">{food.category}</td>
                  <td className="px-4 py-3">{food.kcalPer100g} kcal</td>
                  <td className="px-4 py-3">{food.fatPer100g} g</td>
                  <td className="px-4 py-3">{food.carbsPer100g} g</td>
                  <td className="px-4 py-3">{food.proteinPer100g} g</td>
                  <td className="px-4 py-3">{food.weightBasis === "raw" ? "生重" : "熟重"}</td>
                  <td className="px-4 py-3">
                    {food.source === "public" ? (food.isUserOverride ? "公共·已修改" : "公共") : "本人"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-secondary h-8 px-2" type="button" onClick={() => startEditFood(food)} disabled={busy}>
                        <Pencil size={14} />
                        编辑
                      </button>
                      {food.source === "user" ? (
                        <button className="btn-danger h-8 px-2" type="button" onClick={() => removeFood(food.id)} disabled={busy}>
                          <Trash2 size={14} />
                          删除
                        </button>
                      ) : null}
                      {food.source === "public" && food.isUserOverride ? (
                        <button className="btn-secondary h-8 px-2" type="button" onClick={() => removeFood(food.id)} disabled={busy}>
                          <RotateCcw size={14} />
                          重置
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
