"use client";

import { Cloud, CloudOff, LoaderCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MealSplitView } from "@/components/MealSplitView";
import { PlannerProfileView } from "@/components/PlannerProfileView";
import { useApp } from "@/components/app/AppProvider";
import { usePlanner } from "@/components/usePlanner";
import { useZonedToday } from "@/hooks/useZonedToday";
import { isDateKey } from "@/lib/dateTime";
import { loadPlans } from "@/lib/storage";
import { materializeDayTemplate } from "@/lib/templates";
import type { SavedPlan } from "@/lib/types";

function stableNonce(value: string): number {
  return [...value].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, 7);
}

export function TodayWorkspace() {
  const searchParams = useSearchParams();
  const { foods, persistTemplates, preferences, templates, user } = useApp();
  const zonedToday = useZonedToday(preferences.timeZone);
  const dateParam = searchParams.get("date");
  const requestedDate = isDateKey(dateParam) ? dateParam : zonedToday;
  const requestedTemplateId = searchParams.get("template");
  const [savedPlan, setSavedPlan] = useState<SavedPlan | null | undefined>(undefined);
  const section = searchParams.get("section") === "profile" ? "profile" : "meals";

  useEffect(() => {
    let cancelled = false;
    setSavedPlan(undefined);
    loadPlans(user)
      .then((plans) => {
        if (!cancelled) {
          setSavedPlan(plans.find((plan) => plan.planDate === requestedDate) ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSavedPlan(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requestedDate, user]);

  const applyRequest = useMemo(() => {
    const template = templates.dayTemplates.find((item) => item.id === requestedTemplateId);
    if (!template) {
      return null;
    }
    const foodsById = new Map(foods.map((food) => [food.id, food]));
    return { meals: materializeDayTemplate(template, foodsById), nonce: stableNonce(template.id) };
  }, [foods, requestedTemplateId, templates.dayTemplates]);

  const openDateRequest = useMemo(() => savedPlan === undefined
    ? null
    : { date: requestedDate, plan: savedPlan, nonce: stableNonce(`${requestedDate}:${savedPlan?.id ?? "new"}`) },
  [requestedDate, savedPlan]);

  const controller = usePlanner({
    foods,
    templates,
    user,
    timeZone: preferences.timeZone,
    energyUnit: preferences.energyUnit,
    onTemplatesChanged: persistTemplates,
    applyRequest,
    openDateRequest
  });

  const draftStatus = {
    idle: { icon: Cloud, label: "等待修改", className: "text-muted" },
    saving: { icon: LoaderCircle, label: "正在保存草稿", className: "text-accent2" },
    saved: { icon: Cloud, label: "草稿已同步", className: "text-success" },
    error: { icon: CloudOff, label: "草稿同步失败，可继续编辑", className: "text-rose" }
  }[controller.draftState];
  const DraftIcon = draftStatus.icon;

  return (
    <section className="today-workspace space-y-4">
      <div className="flex flex-col gap-3 border-b border-line pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">{requestedDate === zonedToday ? "TODAY" : "PLANNED DAY"}</p>
          <h2 className="mt-1 text-2xl text-ink">{requestedDate === zonedToday ? "今天吃什么" : `${requestedDate} 的计划`}</h2>
          <p className="mt-1 text-sm text-muted">调整目标、编辑餐次、应用推荐并保存，不必来回切页。</p>
        </div>
        <p className={`flex min-h-6 items-center gap-2 text-xs ${draftStatus.className}`} role="status" aria-live="polite">
          <DraftIcon size={15} className={controller.draftState === "saving" ? "animate-spin" : ""} />
          {draftStatus.label}
        </p>
      </div>

      <div className="grid grid-cols-2 rounded border border-line bg-panel p-1 lg:hidden" aria-label="今日计划分区">
        <a className={`segmented-option ${section === "profile" ? "is-active" : ""}`} href={`?date=${requestedDate}&section=profile`}>目标</a>
        <a className={`segmented-option ${section === "meals" ? "is-active" : ""}`} href={`?date=${requestedDate}&section=meals`}>餐次</a>
      </div>

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.55fr)]">
        <div className={section === "profile" ? "min-w-0" : "hidden min-w-0 lg:block"}>
          <PlannerProfileView controller={controller} timeZone={preferences.timeZone} unitSystem={preferences.unitSystem} energyUnit={preferences.energyUnit} />
        </div>
        <div className={section === "meals" ? "min-w-0" : "hidden min-w-0 lg:block"}>
          <MealSplitView controller={controller} foods={foods} templates={templates} energyUnit={preferences.energyUnit} />
        </div>
      </div>
    </section>
  );
}
