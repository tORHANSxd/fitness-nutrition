"use client";

import { Cloud, CloudOff, LoaderCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NutritionSummary } from "@/components/NutritionSummary";
import { useEffect, useMemo, useState } from "react";
import { MealSplitView } from "@/components/MealSplitView";
import dynamic from "next/dynamic";

import {
  NumericDraftNotice,
  NumericDraftProvider,
  useNumericDraftForm,
} from "@/components/NumericInput";
import { useApp } from "@/components/app/AppProvider";
import { usePlanner } from "@/components/usePlanner";
import { useZonedToday } from "@/hooks/useZonedToday";
import { addDays, isDateKey } from "@/lib/dateTime";
import { loadPlansInRange } from "@/lib/storage";
import { materializeDayTemplate } from "@/lib/templates";
import type { DailyCheckin, SavedPlan } from "@/lib/types";
import { UnsupportedDocumentError } from "@/lib/planProtocol";

const DailyCheckinPanel = dynamic(() =>
  import("@/components/DailyCheckinPanel").then(
    (module) => module.DailyCheckinPanel,
  ),
);
const PlanProtocolPanel = dynamic(() =>
  import("@/components/PlanProtocolPanel").then(
    (module) => module.PlanProtocolPanel,
  ),
);

function stableNonce(value: string): number {
  return [...value].reduce(
    (sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0,
    7,
  );
}

export function TodayWorkspace({
  mode = "today",
}: {
  mode?: "today" | "records" | "goals";
}) {
  const router = useRouter();
  const numericDraftForm = useNumericDraftForm();
  const searchParams = useSearchParams();
  const { foods, persistTemplates, preferences, templates, user } = useApp();
  const zonedToday = useZonedToday(preferences.timeZone);
  const dateParam = searchParams.get("date");
  const requestedDate = isDateKey(dateParam) ? dateParam : zonedToday;
  const requestedTemplateId = searchParams.get("template");
  const [savedPlan, setSavedPlan] = useState<SavedPlan | null | undefined>(
    undefined,
  );
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const [, setCheckin] = useState<DailyCheckin | null>(null);
  const [planError, setPlanError] = useState("");
  const [rawPlan, setRawPlan] = useState<unknown>();

  useEffect(() => {
    let cancelled = false;
    setSavedPlan(undefined);
    setLoadedDate(null);
    setPlanError("");
    setRawPlan(undefined);
    setCheckin(null);
    loadPlansInRange(user, requestedDate, requestedDate)
      .then((plans) => {
        if (!cancelled) {
          setSavedPlan(
            plans.find((plan) => plan.planDate === requestedDate) ?? null,
          );
          setLoadedDate(requestedDate);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPlanError("该日计划读取失败，已暂停打开以保护历史数据。");
          if (error instanceof UnsupportedDocumentError)
            setRawPlan(error.rawDocument);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requestedDate, user]);

  const applyRequest = useMemo(() => {
    const template = templates.dayTemplates.find(
      (item) => item.id === requestedTemplateId,
    );
    if (!template) {
      return null;
    }
    const foodsById = new Map(foods.map((food) => [food.id, food]));
    return {
      meals: materializeDayTemplate(template, foodsById),
      includesMealLayout: template.includesMealLayout,
      nonce: stableNonce(template.id),
    };
  }, [foods, requestedTemplateId, templates.dayTemplates]);

  const dateLoaded = loadedDate === requestedDate && savedPlan !== undefined;
  const openDateRequest = useMemo(
    () =>
      !dateLoaded || savedPlan === undefined
        ? null
        : {
            date: requestedDate,
            plan: savedPlan,
            nonce: stableNonce(`${requestedDate}:${savedPlan?.id ?? "new"}`),
          },
    [dateLoaded, requestedDate, savedPlan],
  );

  const controller = usePlanner({
    suspendWrites: !dateLoaded || Boolean(planError),
    foods,
    templates,
    user,
    timeZone: preferences.timeZone,
    energyUnit: preferences.energyUnit,
    onTemplatesChanged: persistTemplates,
    validateNumericDrafts: numericDraftForm.validateAll,
    applyRequest,
    openDateRequest,
  });

  const draftStatus = {
    loading: { icon: LoaderCircle, label: "正在读取", className: "text-muted" },
    ready: { icon: Cloud, label: "已载入", className: "text-muted" },
    empty: { icon: Cloud, label: "尚未保存", className: "text-muted" },
    dirty: { icon: Cloud, label: "等待同步", className: "text-accent2" },
    saving: {
      icon: LoaderCircle,
      label: "正在保存",
      className: "text-accent2",
    },
    saved: { icon: Cloud, label: "已自动保存", className: "text-accent-text" },
    conflict: {
      icon: CloudOff,
      label: "其他设备有更新，请刷新",
      className: "text-danger",
    },
    error: {
      icon: CloudOff,
      label: "保存失败，请重试",
      className: "text-danger",
    },
  }[controller.draftState];
  const DraftIcon = draftStatus.icon;

  return (
    <NumericDraftProvider form={numericDraftForm}>
      <section className="today-workspace space-y-4">
        <div className="date-toolbar">
          <div className="flex min-w-0 items-center gap-2">
            <button
              className="icon-button"
              type="button"
              aria-label="前一天"
              onClick={() =>
                router.push(
                  `/${mode === "records" ? "records?tab=intake&" : mode === "goals" ? "goals?" : "today?"}date=${addDays(requestedDate, -1)}`,
                )
              }
            >
              <ChevronLeft size={18} />
            </button>
            <input
              className="field w-40"
              type="date"
              aria-label="饮食日期"
              value={requestedDate}
              onChange={(event) => {
                if (isDateKey(event.target.value))
                  router.push(
                    `/${mode === "records" ? "records?tab=intake&" : mode === "goals" ? "goals?" : "today?"}date=${event.target.value}`,
                  );
              }}
            />
            <button
              className="icon-button"
              type="button"
              aria-label="后一天"
              onClick={() =>
                router.push(
                  `/${mode === "records" ? "records?tab=intake&" : mode === "goals" ? "goals?" : "today?"}date=${addDays(requestedDate, 1)}`,
                )
              }
            >
              <ChevronRight size={18} />
            </button>
            {requestedDate !== zonedToday && (
              <Link
                className="btn-text text-xs"
                href={
                  mode === "records"
                    ? "/records"
                    : mode === "goals"
                      ? "/goals"
                      : "/today"
                }
              >
                今天
              </Link>
            )}
          </div>
          <p
            className={`flex items-center gap-2 text-xs ${draftStatus.className}`}
            role="status"
          >
            <DraftIcon
              size={14}
              className={
                controller.draftState === "saving" ? "animate-spin" : ""
              }
            />
            {draftStatus.label}
          </p>
        </div>
        <NumericDraftNotice />
        {planError && <p role="alert">{planError}</p>}
        {(rawPlan ?? controller.rawDocument) != null && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob(
                  [JSON.stringify(rawPlan ?? controller.rawDocument, null, 2)],
                  { type: "application/json" },
                ),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = "preserved-document.json";
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            下载保留的原始文档
          </button>
        )}
        {!planError && controller.rawDocument == null && dateLoaded ? (
          <>
            {mode === "goals" ? (
              <PlanProtocolPanel
                controller={controller}
                user={user}
                preferences={preferences}
              />
            ) : mode === "records" ? (
              <DailyCheckinPanel
                controller={controller}
                date={requestedDate}
                today={zonedToday}
                user={user}
                energyUnit={preferences.energyUnit}
                timeZone={preferences.timeZone}
                hourCycle={preferences.hourCycle}
                onCheckinChange={setCheckin}
                allowV3
              />
            ) : (
              <>
                <NutritionSummary
                  total={controller.result.actualTotals}
                  target={controller.result.dailyTarget}
                  energyUnit={preferences.energyUnit}
                />
                <MealSplitView
                  controller={controller}
                  foods={foods}
                  templates={templates}
                  energyUnit={preferences.energyUnit}
                  hourCycle={preferences.hourCycle}
                  user={user}
                />
                <div className="flex justify-end">
                  <Link
                    className="btn-text text-sm"
                    href={`/records?tab=intake&date=${requestedDate}`}
                  >
                    记录实际吃了什么 →
                  </Link>
                </div>
              </>
            )}
          </>
        ) : !planError && controller.rawDocument == null ? (
          <p role="status">正在读取指定日期…</p>
        ) : null}
      </section>
    </NumericDraftProvider>
  );
}
