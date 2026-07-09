"use client";

import { PenLine, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { sortFoods } from "@/lib/foods";
import { calculateFoodKcalPer100g, round } from "@/lib/nutrition";
import { foodCategories, type CustomFoodDraft, type FoodItem } from "@/lib/types";

interface FoodPickerDialogProps {
  open: boolean;
  foods: FoodItem[];
  /** 当前已选食物（用于高亮）。 */
  currentFoodId?: string;
  title?: string;
  onSelect: (foodId: string) => void;
  /** 提交临时自定义食物（三大营养素/100g，热量自动计算）。缺省时隐藏自定义入口。 */
  onSelectCustom?: (draft: CustomFoodDraft) => void;
  onClose: () => void;
}

const emptyCustomDraft: CustomFoodDraft = { name: "", category: "主食", carbsPer100g: 0, proteinPer100g: 0, fatPer100g: 0 };

/**
 * 选食面板：先选食物种类（顶部分类标签），再在下方列表点选食物。列表始终按拼音排序。
 * 用分类把食物库分门别类，辅助在计划里快速找到目标食物。
 */
export function FoodPickerDialog({ open, foods, currentFoodId, title = "选择食物", onSelect, onSelectCustom, onClose }: FoodPickerDialogProps) {
  const [activeCategory, setActiveCategory] = useState<FoodItem["category"] | "all">("all");
  const [search, setSearch] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [customDraft, setCustomDraft] = useState<CustomFoodDraft>(emptyCustomDraft);

  // 每次打开重置分类/搜索/自定义表单，回到「全部」，避免上次残留状态干扰。
  useEffect(() => {
    if (open) {
      setActiveCategory("all");
      setSearch("");
      setCustomMode(false);
      setCustomDraft(emptyCustomDraft);
    }
  }, [open]);

  // Esc 关闭。
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 仅展示实际存在食物的分类标签（按 foodCategories 顺序）。
  const presentCategories = useMemo(
    () => foodCategories.filter((category) => foods.some((food) => food.category === category)),
    [foods]
  );

  const visibleFoods = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = foods.filter((food) => {
      if (activeCategory !== "all" && food.category !== activeCategory) {
        return false;
      }
      if (term && !food.name.toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });
    return sortFoods(filtered);
  }, [foods, activeCategory, search]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="dialog-overlay fixed inset-0 z-50 flex items-end justify-center bg-[#1F1E1D]/30 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="dialog-panel flex max-h-[82vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h3 className="text-base font-semibold text-ink">{customMode ? "自定义食物" : title}</h3>
          <div className="flex items-center gap-2">
            {onSelectCustom ? (
              <button className="btn-secondary h-8 px-2.5 text-xs" type="button" onClick={() => setCustomMode((value) => !value)}>
                <PenLine size={14} />
                {customMode ? "返回食物列表" : "自定义食物"}
              </button>
            ) : null}
            <button className="btn-secondary h-8 px-2" type="button" onClick={onClose} title="关闭">
              <X size={16} />
            </button>
          </div>
        </div>

        {customMode && onSelectCustom ? (
          <CustomFoodForm
            draft={customDraft}
            onChange={setCustomDraft}
            onSubmit={() => {
              onSelectCustom(customDraft);
              onClose();
            }}
          />
        ) : (
          <>
        <div className="border-b border-line px-4 py-3">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="field w-full pl-9"
              placeholder="按名称搜索…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              autoFocus
            />
          </div>
          {/* 先选种类：分类标签页 */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <CategoryChip label="全部" active={activeCategory === "all"} onClick={() => setActiveCategory("all")} />
            {presentCategories.map((category) => (
              <CategoryChip
                key={category}
                label={category}
                active={activeCategory === category}
                onClick={() => setActiveCategory(category)}
              />
            ))}
          </div>
        </div>

        {/* 再选食物：当前分类下的食物列表（按拼音） */}
        <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
          {visibleFoods.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted">没有符合条件的食物。</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {visibleFoods.map((food) => {
                const active = food.id === currentFoodId;
                return (
                  <li key={food.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(food.id);
                        onClose();
                      }}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        active ? "border-accent bg-accent/10 text-accent" : "border-transparent hover:border-line hover:bg-black/[0.03]"
                      }`}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-ink">{food.name}</span>
                        <span className="text-[11px] text-muted">
                          {food.category} · {food.weightBasis === "raw" ? "生重" : "熟重"}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-xs text-muted">{round(calculateFoodKcalPer100g(food), 0)} kcal/100g</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
}

function CustomFoodForm({
  draft,
  onChange,
  onSubmit
}: {
  draft: CustomFoodDraft;
  onChange: (draft: CustomFoodDraft) => void;
  onSubmit: () => void;
}) {
  const kcal = draft.carbsPer100g * 4 + draft.proteinPer100g * 4 + draft.fatPer100g * 9;
  const canSubmit = kcal > 0;

  function numberField(key: "carbsPer100g" | "proteinPer100g" | "fatPer100g", value: string) {
    onChange({ ...draft, [key]: value === "" ? 0 : Math.max(Number(value), 0) });
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-xs text-muted">临时食物只保存在当前计划里，不进食物库。填写每 100g 的三大营养素，热量自动按 4/4/9 计算。</p>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="metric-label mb-1 block">名称</span>
          <input
            className="field w-full"
            value={draft.name}
            placeholder="自定义食物"
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
          />
        </label>
        <label>
          <span className="metric-label mb-1 block">分类</span>
          <select
            className="field w-full"
            value={draft.category}
            onChange={(event) => onChange({ ...draft, category: event.target.value as CustomFoodDraft["category"] })}
          >
            {foodCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <label>
          <span className="metric-label mb-1 block">净碳水 g/100g</span>
          <input className="field w-full" type="number" inputMode="decimal" min="0" value={draft.carbsPer100g} onChange={(event) => numberField("carbsPer100g", event.target.value)} />
        </label>
        <label>
          <span className="metric-label mb-1 block">蛋白 g/100g</span>
          <input className="field w-full" type="number" inputMode="decimal" min="0" value={draft.proteinPer100g} onChange={(event) => numberField("proteinPer100g", event.target.value)} />
        </label>
        <label>
          <span className="metric-label mb-1 block">脂肪 g/100g</span>
          <input className="field w-full" type="number" inputMode="decimal" min="0" value={draft.fatPer100g} onChange={(event) => numberField("fatPer100g", event.target.value)} />
        </label>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-line bg-surface/60 px-3 py-2.5">
        <span className="text-xs text-muted">热量（自动计算）</span>
        <span className="tabular-nums text-sm font-semibold text-accent">{round(kcal, 1)} kcal/100g</span>
      </div>
      <button className="btn-primary h-10" type="button" disabled={!canSubmit} onClick={onSubmit}>
        <Plus size={16} />
        添加此食物
      </button>
      {!canSubmit ? <p className="text-center text-[11px] text-muted">至少填写一项营养素后才能添加。</p> : null}
    </div>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
