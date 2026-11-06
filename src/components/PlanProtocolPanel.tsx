"use client";
import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { PlannerController } from "@/components/usePlanner";
import { loadPlanProtocols, protocolSchemaReady } from "@/lib/protocolStorage";
import { displayEnergy, type AppPreferences } from "@/lib/preferences";
import type { MealEvent, PlanProtocol } from "@/lib/types";
import { NutritionGoalPanel } from "@/components/NutritionGoalPanel";
import { tutorialAction } from "@/lib/tutorial";
import { resolveProtocol } from "@/lib/planProtocol";
import { todayKey } from "@/lib/dateTime";

export function PlanProtocolPanel({
  controller,
  user,
  preferences,
  hasSavedPlan = false,
}: {
  controller: PlannerController;
  user: User;
  preferences: AppPreferences;
  hasSavedPlan?: boolean;
  events?: MealEvent[];
}) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [protocols, setProtocols] = useState<PlanProtocol[]>([]);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    Promise.all([protocolSchemaReady(user, 3), loadPlanProtocols(user)])
      .then(([available, versions]) => {
        if (!cancelled) {
          setReady(available);
          setProtocols(versions);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReady(false);
          setError("目标读取失败，请刷新后重试。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);
  const loading = ready === null || controller.draftState === "loading";
  const today = todayKey(preferences.timeZone);
  const active = resolveProtocol(protocols, today);
  const upcoming = protocols.filter(protocol => protocol.effectiveFrom > today && resolveProtocol(protocols, protocol.effectiveFrom)?.id === protocol.id).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return (
    <section className="panel p-5" aria-label="饮食目标设置">
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}
      {!loading && <NutritionGoalPanel
        key={active?.id ?? "new-goal"}
        activeProtocol={active}
        hasSavedPlan={hasSavedPlan}
        controller={controller}
        user={user}
        preferences={preferences}
        protocols={protocols}
        ready={ready}
        onApplied={(saved) => {
          setApplied(true);
          tutorialAction("goal-saved");
          controller.applyProtocol?.(saved);
          setProtocols((rows) => [
            ...rows.filter((p) => p.id !== saved.id),
            saved,
          ]);
        }}
      />}
      {loading && <p role="status">正在读取日常目标…</p>}
      {upcoming.map(protocol => <div key={protocol.id} className="mt-3 rounded-lg border border-line p-3 text-sm" aria-label="待生效的日常目标"><p>已安排新目标：{protocol.effectiveFrom} 起使用。</p><p className="mt-1">{Math.round(displayEnergy(protocol.dailyTarget.kcal, preferences.energyUnit))} {preferences.energyUnit === "kj" ? "kJ" : "kcal"} · 蛋白质 {Number(protocol.dailyTarget.protein.toFixed(1))} g · 脂肪 {Number(protocol.dailyTarget.fat.toFixed(1))} g · 碳水 {Number(protocol.dailyTarget.carbs.toFixed(1))} g</p><p className="mt-1 text-xs text-muted">已保存日期仍保留各自的目标。</p></div>)}
      {applied && controller.message && <p role="status" className="mt-3 text-sm">{controller.message}</p>}
    </section>
  );
}
