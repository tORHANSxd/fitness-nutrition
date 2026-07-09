"use client";

import { CalendarDays, Send, Trash2, Utensils } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { resolveTemplateFood } from "@/lib/templates";
import type { DayTemplate, FoodItem, MealTemplate, PlannerTemplates, TemplateFoodRef } from "@/lib/types";

interface TemplateManagerProps {
  templates: PlannerTemplates;
  foods: FoodItem[];
  onTemplatesChanged: (templates: PlannerTemplates) => void;
  onApplyDayTemplate: (template: DayTemplate) => void;
}

export function TemplateManager({ templates, foods, onTemplatesChanged, onApplyDayTemplate }: TemplateManagerProps) {
  const foodsById = useMemo(() => new Map(foods.map((food) => [food.id, food])), [foods]);

  function deleteDayTemplate(templateId: string) {
    onTemplatesChanged({ ...templates, dayTemplates: templates.dayTemplates.filter((template) => template.id !== templateId) });
  }

  function deleteMealTemplate(templateId: string) {
    onTemplatesChanged({ ...templates, mealTemplates: templates.mealTemplates.filter((template) => template.id !== templateId) });
  }

  return (
    <section className="space-y-4">
      <div className="panel overflow-hidden">
        <div className="border-b border-line bg-surface/80 p-4">
          <h2 className="text-xl font-semibold text-ink">模板管理</h2>
          <p className="mt-1 text-sm text-muted">
            模板只记录食物组合（不含克重），名字由食物按分类和拼音自动生成、同名不可重复创建。应用模板后克重取分类默认值，推荐由求解器实时计算。
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-2">
          <TemplateSection count={templates.dayTemplates.length} emptyText="还没有全天模板，可在分餐计划中保存。" icon="day" title="全天模板">
            {templates.dayTemplates.map((template) => (
              <div key={template.id} className="hover-lift rounded-xl border border-line bg-surface/70 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink" title={template.name}>{template.name}</div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {template.meals.length} 餐 · {new Date(template.createdAt).toLocaleDateString("zh-CN")}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button className="btn-primary h-9 px-3" type="button" onClick={() => onApplyDayTemplate(template)} title="应用到分餐计划">
                      <Send size={14} />
                    </button>
                    <button className="btn-danger h-9 px-3" type="button" onClick={() => deleteDayTemplate(template.id)} title="删除全天模板">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="mt-2 space-y-1.5 border-t border-line pt-2">
                  {template.meals.map((meal) => (
                    <div key={meal.id} className="flex flex-wrap items-center gap-1.5">
                      <span className="w-14 shrink-0 text-[11px] font-medium text-muted">{meal.name}</span>
                      <FoodChips refs={meal.foods} foodsById={foodsById} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </TemplateSection>

          <TemplateSection count={templates.mealTemplates.length} emptyText="还没有单餐模板，可在分餐计划中保存。" icon="meal" title="单餐模板">
            {templates.mealTemplates.map((template) => (
              <div key={template.id} className="hover-lift rounded-xl border border-line bg-surface/70 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink" title={template.name}>{template.name}</div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {template.foods.length} 种食物 · {new Date(template.createdAt).toLocaleDateString("zh-CN")}
                    </div>
                  </div>
                  <button className="btn-danger h-9 shrink-0 px-3" type="button" onClick={() => deleteMealTemplate(template.id)} title="删除单餐模板">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-2 border-t border-line pt-2">
                  <FoodChips refs={template.foods} foodsById={foodsById} />
                </div>
              </div>
            ))}
          </TemplateSection>
        </div>
      </div>
    </section>
  );
}

function FoodChips({ refs, foodsById }: { refs: TemplateFoodRef[]; foodsById: Map<string, FoodItem> }) {
  if (refs.length === 0) {
    return <span className="text-[11px] text-muted">（空）</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {refs.map((ref, index) => {
        const food = resolveTemplateFood(ref, foodsById);
        return (
          <span key={`${ref.foodId}-${index}`} className="rounded border border-line bg-surface/60 px-1.5 py-0.5 text-[11px] text-ink">
            {food?.name ?? "未知食物"}
            <span className="ml-1 text-muted">{food?.category ?? ""}</span>
            {ref.customFood ? <span className="ml-1 text-accent">自定义</span> : null}
          </span>
        );
      })}
    </div>
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
