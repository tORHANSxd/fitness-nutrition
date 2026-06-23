"use client";

import { CalendarDays, ChevronDown, ChevronRight, Copy, Pencil, Send, Trash2, Utensils } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { calculateFoodTotals, round } from "@/lib/nutrition";
import type { DayTemplate, FoodItem, MacroTotals, MealFoodEntry, MealTemplate, PlannerTemplates } from "@/lib/types";

interface TemplateManagerProps {
  templates: PlannerTemplates;
  foods: FoodItem[];
  onTemplatesChanged: (templates: PlannerTemplates) => void;
  onApplyDayTemplate: (template: DayTemplate) => void;
}

const zeroTotals: MacroTotals = { kcal: 0, carbs: 0, protein: 0, fat: 0 };

function sumEntries(entries: MealFoodEntry[], foodsById: Map<string, FoodItem>): MacroTotals {
  return entries.reduce((total, entry) => {
    const food = foodsById.get(entry.foodId);
    if (!food) {
      return total;
    }
    const part = calculateFoodTotals(food, entry.grams);
    return {
      kcal: total.kcal + part.kcal,
      carbs: total.carbs + part.carbs,
      protein: total.protein + part.protein,
      fat: total.fat + part.fat
    };
  }, zeroTotals);
}

function MacroSummary({ totals }: { totals: MacroTotals }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
      <span className="text-accent">{round(totals.kcal, 0)} kcal</span>
      <span>碳 {round(totals.carbs, 1)}g</span>
      <span>蛋 {round(totals.protein, 1)}g</span>
      <span>脂 {round(totals.fat, 1)}g</span>
    </div>
  );
}

export function TemplateManager({ templates, foods, onTemplatesChanged, onApplyDayTemplate }: TemplateManagerProps) {
  const foodsById = useMemo(() => new Map(foods.map((food) => [food.id, food])), [foods]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function renameDayTemplate(templateId: string, name: string) {
    onTemplatesChanged({
      ...templates,
      dayTemplates: templates.dayTemplates.map((template) => (template.id === templateId ? { ...template, name } : template))
    });
  }

  function renameMealTemplate(templateId: string, name: string) {
    onTemplatesChanged({
      ...templates,
      mealTemplates: templates.mealTemplates.map((template) => (template.id === templateId ? { ...template, name } : template))
    });
  }

  function deleteDayTemplate(templateId: string) {
    onTemplatesChanged({ ...templates, dayTemplates: templates.dayTemplates.filter((template) => template.id !== templateId) });
  }

  function deleteMealTemplate(templateId: string) {
    onTemplatesChanged({ ...templates, mealTemplates: templates.mealTemplates.filter((template) => template.id !== templateId) });
  }

  function duplicateDayTemplate(template: DayTemplate) {
    const copy: DayTemplate = {
      id: crypto.randomUUID(),
      name: `${template.name} 副本`,
      createdAt: new Date().toISOString(),
      meals: template.meals.map((meal) => ({ ...meal, entries: meal.entries.map((entry) => ({ ...entry, id: crypto.randomUUID() })) }))
    };
    onTemplatesChanged({ ...templates, dayTemplates: [copy, ...templates.dayTemplates] });
  }

  function duplicateMealTemplate(template: MealTemplate) {
    const copy: MealTemplate = {
      ...template,
      id: crypto.randomUUID(),
      name: `${template.name} 副本`,
      createdAt: new Date().toISOString(),
      entries: template.entries.map((entry) => ({ ...entry, id: crypto.randomUUID() }))
    };
    onTemplatesChanged({ ...templates, mealTemplates: [copy, ...templates.mealTemplates] });
  }

  return (
    <section className="space-y-4">
      <div className="panel overflow-hidden">
        <div className="border-b border-line bg-surface/80 p-4">
          <h2 className="text-xl font-semibold text-gradient">模板管理</h2>
          <p className="mt-1 text-sm text-muted">预览模板内容与宏量、复制、重命名、删除；全天模板可一键应用到当天计划。删除不影响已保存的历史计划。</p>
        </div>
        <div className="grid gap-4 p-4 xl:grid-cols-2">
          <TemplateSection count={templates.dayTemplates.length} emptyText="还没有全天模板。" icon="day" title="全天模板">
            {templates.dayTemplates.map((template) => {
              const isOpen = expanded.has(template.id);
              const dayTotals = template.meals.reduce((total, meal) => {
                const mealTotals = sumEntries(meal.entries, foodsById);
                return {
                  kcal: total.kcal + mealTotals.kcal,
                  carbs: total.carbs + mealTotals.carbs,
                  protein: total.protein + mealTotals.protein,
                  fat: total.fat + mealTotals.fat
                };
              }, zeroTotals);
              return (
                <div key={template.id} className="rounded-xl border border-line bg-surface/70 p-3 backdrop-blur">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <label className="min-w-0 flex-1">
                      <span className="metric-label mb-1 flex items-center gap-1"><Pencil size={13} /> 模板名</span>
                      <input className="field w-full" value={template.name} onChange={(event) => renameDayTemplate(template.id, event.target.value)} />
                    </label>
                    <div className="flex gap-1.5">
                      <button className="btn-primary h-11 px-3" type="button" onClick={() => onApplyDayTemplate(template)} title="应用到当天计划">
                        <Send size={15} />
                      </button>
                      <button className="btn-secondary h-11 px-3" type="button" onClick={() => duplicateDayTemplate(template)} title="复制模板">
                        <Copy size={15} />
                      </button>
                      <button className="btn-danger h-11 px-3" type="button" onClick={() => deleteDayTemplate(template.id)} title="删除全天模板">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <button type="button" className="mt-2 flex w-full items-center justify-between text-xs text-muted hover:text-ink" onClick={() => toggleExpand(template.id)}>
                    <span className="flex items-center gap-1">
                      {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {template.meals.length} 餐 · {new Date(template.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                    <MacroSummary totals={dayTotals} />
                  </button>
                  {isOpen ? (
                    <div className="mt-2 space-y-2 border-t border-line pt-2">
                      {template.meals.map((meal) => (
                        <div key={meal.id} className="rounded-lg bg-panel/40 p-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-ink">{meal.name}</span>
                            <MacroSummary totals={sumEntries(meal.entries, foodsById)} />
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {meal.entries.length === 0 ? (
                              <span className="text-[11px] text-muted">（空）</span>
                            ) : (
                              meal.entries.map((entry) => (
                                <span key={entry.id} className="rounded border border-line bg-surface/60 px-1.5 py-0.5 text-[11px] text-ink">
                                  {foodsById.get(entry.foodId)?.name ?? "未知食物"} <span className="text-muted">{round(entry.grams, 1)}g</span>
                                </span>
                              ))
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </TemplateSection>

          <TemplateSection count={templates.mealTemplates.length} emptyText="还没有单餐模板，可在分餐计划中保存。" icon="meal" title="单餐模板">
            {templates.mealTemplates.map((template) => {
              const isOpen = expanded.has(template.id);
              const lockedCount = template.entries.filter((entry) => entry.locked).length;
              const totals = sumEntries(template.entries, foodsById);
              return (
                <div key={template.id} className="rounded-xl border border-line bg-surface/70 p-3 backdrop-blur">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <label className="min-w-0 flex-1">
                      <span className="metric-label mb-1 flex items-center gap-1"><Pencil size={13} /> 模板名</span>
                      <input className="field w-full" value={template.name} onChange={(event) => renameMealTemplate(template.id, event.target.value)} />
                    </label>
                    <div className="flex gap-1.5">
                      <button className="btn-secondary h-11 px-3" type="button" onClick={() => duplicateMealTemplate(template)} title="复制模板">
                        <Copy size={15} />
                      </button>
                      <button className="btn-danger h-11 px-3" type="button" onClick={() => deleteMealTemplate(template.id)} title="删除单餐模板">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <button type="button" className="mt-2 flex w-full items-center justify-between text-xs text-muted hover:text-ink" onClick={() => toggleExpand(template.id)}>
                    <span className="flex items-center gap-1">
                      {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {template.sourceMealName} · {template.entries.length} 种 · {lockedCount} 锁定
                    </span>
                    <MacroSummary totals={totals} />
                  </button>
                  {isOpen ? (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line pt-2">
                      {template.entries.length === 0 ? (
                        <span className="text-[11px] text-muted">（空）</span>
                      ) : (
                        template.entries.map((entry) => (
                          <span key={entry.id} className="rounded border border-line bg-surface/60 px-1.5 py-0.5 text-[11px] text-ink">
                            {foodsById.get(entry.foodId)?.name ?? "未知食物"} <span className="text-muted">{round(entry.grams, 1)}g</span>
                            {entry.locked ? <span className="ml-1 text-accent">锁</span> : null}
                          </span>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </TemplateSection>
        </div>
      </div>
    </section>
  );
}

function TemplateSection({ children, count, emptyText, icon, title }: { children: ReactNode; count: number; emptyText: string; icon: "day" | "meal"; title: string }) {
  const Icon = icon === "day" ? CalendarDays : Utensils;
  return (
    <section className="rounded-md border border-line bg-panel p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent ring-1 ring-accent/20">
            <Icon size={18} />
          </div>
          <h3 className="text-base font-semibold text-ink">{title}</h3>
        </div>
        <span className="rounded-md bg-surface px-2 py-1 text-xs font-semibold text-accent ring-1 ring-accent/20">{count} 个</span>
      </div>
      <div className="grid gap-2">
        {count === 0 ? <p className="rounded-md border border-dashed border-line bg-surface/50 p-3 text-sm text-muted">{emptyText}</p> : children}
      </div>
    </section>
  );
}
