"use client";

import { CalendarDays, Pencil, Trash2, Utensils } from "lucide-react";
import type { ReactNode } from "react";
import type { PlannerTemplates } from "@/lib/types";

interface TemplateManagerProps {
  templates: PlannerTemplates;
  onTemplatesChanged: (templates: PlannerTemplates) => void;
}

export function TemplateManager({ templates, onTemplatesChanged }: TemplateManagerProps) {
  function renameMealTemplate(templateId: string, name: string) {
    onTemplatesChanged({
      ...templates,
      mealTemplates: templates.mealTemplates.map((template) => (template.id === templateId ? { ...template, name } : template))
    });
  }

  function renameDayTemplate(templateId: string, name: string) {
    onTemplatesChanged({
      ...templates,
      dayTemplates: templates.dayTemplates.map((template) => (template.id === templateId ? { ...template, name } : template))
    });
  }

  function deleteMealTemplate(templateId: string) {
    onTemplatesChanged({
      ...templates,
      mealTemplates: templates.mealTemplates.filter((template) => template.id !== templateId)
    });
  }

  function deleteDayTemplate(templateId: string) {
    onTemplatesChanged({
      ...templates,
      dayTemplates: templates.dayTemplates.filter((template) => template.id !== templateId)
    });
  }

  return (
    <section className="space-y-4">
      <div className="panel overflow-hidden">
        <div className="border-b border-line bg-surface/80 p-4">
          <h2 className="text-xl font-semibold text-gradient">模板管理</h2>
          <p className="mt-1 text-sm text-muted">集中重命名单餐模板和全天模板，删除后不会影响已保存的历史计划。</p>
        </div>
        <div className="grid gap-4 p-4 xl:grid-cols-2">
          <TemplateList
            count={templates.dayTemplates.length}
            emptyText="还没有全天模板。"
            icon="day"
            title="全天模板"
          >
            {templates.dayTemplates.map((template) => (
              <div key={template.id} className="rounded-xl border border-line bg-surface/70 backdrop-blur p-3 hover-lift">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <label className="min-w-0 flex-1">
                    <span className="metric-label mb-1 flex items-center gap-1">
                      <Pencil size={13} />
                      模板名
                    </span>
                    <input className="field w-full" value={template.name} onChange={(event) => renameDayTemplate(template.id, event.target.value)} />
                  </label>
                  <button className="btn-danger h-11 px-3" type="button" onClick={() => deleteDayTemplate(template.id)} title="删除全天模板">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="mt-2 text-xs text-muted">
                  {template.meals.length} 餐 · {new Date(template.createdAt).toLocaleString("zh-CN")}
                </div>
              </div>
            ))}
          </TemplateList>

          <TemplateList
            count={templates.mealTemplates.length}
            emptyText="还没有单餐模板，可在分餐计划中保存。"
            icon="meal"
            title="单餐模板"
          >
            {templates.mealTemplates.map((template) => {
              const lockedCount = template.entries.filter((entry) => entry.locked).length;
              return (
                <div key={template.id} className="rounded-xl border border-line bg-surface/70 backdrop-blur p-3 hover-lift">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <label className="min-w-0 flex-1">
                      <span className="metric-label mb-1 flex items-center gap-1">
                        <Pencil size={13} />
                        模板名
                      </span>
                      <input className="field w-full" value={template.name} onChange={(event) => renameMealTemplate(template.id, event.target.value)} />
                    </label>
                    <button className="btn-danger h-11 px-3" type="button" onClick={() => deleteMealTemplate(template.id)} title="删除单餐模板">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-muted">
                    {template.sourceMealName} · {template.entries.length} 种食物 · {lockedCount} 个锁定
                  </div>
                </div>
              );
            })}
          </TemplateList>
        </div>
      </div>
    </section>
  );
}

function TemplateList({
  children,
  count,
  emptyText,
  icon,
  title
}: {
  children: ReactNode;
  count: number;
  emptyText: string;
  icon: "day" | "meal";
  title: string;
}) {
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
