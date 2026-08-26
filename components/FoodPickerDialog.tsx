"use client";

import { PenLine, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NumericDraftNotice, NumericDraftProvider, NumericInput, useNumericDraftForm } from "@/components/NumericInput";
import { sortFoods } from "@/lib/foods";
import { calculateFoodKcalPer100g, round, weightBasisLabel } from "@/lib/nutrition";
import { displayEnergy, type EnergyUnit } from "@/lib/preferences";
import { foodCategories, type CustomFoodDraft, type FoodItem } from "@/lib/types";

interface FoodPickerDialogProps {
  open: boolean;
  foods: FoodItem[];
  energyUnit?: EnergyUnit;
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
export function FoodPickerDialog({ open, foods, energyUnit = "kcal", currentFoodId, title = "选择食物", onSelect, onSelectCustom, onClose }: FoodPickerDialogProps) {
  const [activeCategory, setActiveCategory] = useState<FoodItem["category"] | "all">("all");
  const [search, setSearch] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [customDraft, setCustomDraft] = useState<CustomFoodDraft>(emptyCustomDraft);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const energyLabel = energyUnit === "kj" ? "kJ" : "kcal";

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // 每次打开重置分类/搜索/自定义表单，回到「全部」，避免上次残留状态干扰。
  useEffect(() => {
    if (open) {
      setActiveCategory("all");
      setSearch("");
      setCustomMode(false);
      setCustomDraft(emptyCustomDraft);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => {
      const initialFocus = dialogRef.current?.querySelector<HTMLElement>("[autofocus], input, select, button, [href], [tabindex]:not([tabindex='-1'])");
      (initialFocus ?? dialogRef.current)?.focus();
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")
      ).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKey);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

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

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="dialog-panel flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h3 className="text-base font-semibold text-ink">{customMode ? "自定义食物" : title}</h3>
          <div className="flex items-center gap-2">
            {onSelectCustom ? (
              <button className="btn-secondary h-11 px-2.5 text-xs" type="button" onClick={() => setCustomMode((value) => !value)}>
                <PenLine size={14} />
                {customMode ? "返回食物列表" : "自定义食物"}
              </button>
            ) : null}
            <button className="btn-secondary h-11 w-11 p-0" type="button" onClick={onClose} aria-label="关闭食物选择" title="关闭">
              <X size={16} />
            </button>
          </div>
        </div>

        {customMode && onSelectCustom ? (
          <CustomFoodForm
            draft={customDraft}
            energyUnit={energyUnit}
            onChange={setCustomDraft}
            onSubmit={(nextDraft) => {
              onSelectCustom(nextDraft);
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
              aria-label="搜索食物"
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
                      className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        active ? "border-accent bg-accent/10 text-accent-text" : "border-transparent hover:border-line hover:bg-black/[0.03]"
                      }`}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-ink">{food.name}</span>
                        <span className="text-[11px] text-muted">
                          {food.category} · {weightBasisLabel(food.weightBasis)}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-xs text-muted">{round(displayEnergy(calculateFoodKcalPer100g(food), energyUnit), 0)} {energyLabel}/100g</span>
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
    </div>,
    document.body
  );
}

function CustomFoodForm({
  draft,
  energyUnit,
  onChange,
  onSubmit
}: {
  draft: CustomFoodDraft;
  energyUnit: EnergyUnit;
  onChange: (draft: CustomFoodDraft) => void;
  onSubmit: (draft: CustomFoodDraft) => void;
}) {
  const numericDraftForm = useNumericDraftForm();
  const kcal = draft.carbsPer100g * 4 + draft.proteinPer100g * 4 + draft.fatPer100g * 9;
  const energyLabel = energyUnit === "kj" ? "kJ" : "kcal";
  const canSubmit = kcal > 0;
  const roundedDraft = {
    ...draft,
    carbsPer100g: Math.round(draft.carbsPer100g * 100) / 100,
    proteinPer100g: Math.round(draft.proteinPer100g * 100) / 100,
    fatPer100g: Math.round(draft.fatPer100g * 100) / 100
  };
  const precisionChanged = roundedDraft.carbsPer100g !== draft.carbsPer100g
    || roundedDraft.proteinPer100g !== draft.proteinPer100g
    || roundedDraft.fatPer100g !== draft.fatPer100g;

  function submit() {
    if (numericDraftForm.validateAll() && canSubmit) {
      onSubmit(roundedDraft);
    }
  }

  return (
    <NumericDraftProvider form={numericDraftForm}>
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
          <NumericInput className="field w-full" label="净碳水" min={0} required value={draft.carbsPer100g} onValueChange={(value) => onChange({ ...draft, carbsPer100g: value as number })} />
        </label>
        <label>
          <span className="metric-label mb-1 block">蛋白 g/100g</span>
          <NumericInput className="field w-full" label="蛋白" min={0} required value={draft.proteinPer100g} onValueChange={(value) => onChange({ ...draft, proteinPer100g: value as number })} />
        </label>
        <label>
          <span className="metric-label mb-1 block">脂肪 g/100g</span>
          <NumericInput className="field w-full" label="脂肪" min={0} required value={draft.fatPer100g} onValueChange={(value) => onChange({ ...draft, fatPer100g: value as number })} />
        </label>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-line bg-surface/60 px-3 py-2.5">
        <span className="text-xs text-muted">热量（自动计算）</span>
        <span className="tabular-nums text-sm font-semibold text-accent-text">{round(displayEnergy(kcal, energyUnit), 1)} {energyLabel}/100g</span>
      </div>
      <NumericDraftNotice />
      {precisionChanged ? <p className="text-[11px] text-warning">保存时将按 2 位小数记录营养素。</p> : null}
      <button className="btn-primary h-11" type="button" disabled={!canSubmit} onClick={submit}>
        <Plus size={16} />
        添加此食物
      </button>
      {!canSubmit ? <p className="text-center text-[11px] text-muted">至少填写一项营养素后才能添加。</p> : null}
    </div>
    </NumericDraftProvider>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active ? "border-accent bg-accent/15 text-accent-text" : "border-line text-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
