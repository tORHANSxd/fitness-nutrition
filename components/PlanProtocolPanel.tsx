"use client";
import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { PlannerController } from "@/components/usePlanner";
import { loadPlanProtocols, protocolSchemaReady } from "@/lib/protocolStorage";
import type { AppPreferences } from "@/lib/preferences";
import type { MealEvent, PlanProtocol } from "@/lib/types";
import { NutritionGoalPanel } from "@/components/NutritionGoalPanel";

export function PlanProtocolPanel({
  controller,
  user,
  preferences,
}: {
  controller: PlannerController;
  user: User;
  preferences: AppPreferences;
  events?: MealEvent[];
}) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [protocols, setProtocols] = useState<PlanProtocol[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    Promise.all([protocolSchemaReady(user, 2), loadPlanProtocols(user)])
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
  return (
    <section className="panel p-5" aria-label="饮食目标设置">
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}
      <NutritionGoalPanel
        key={controller.profile.protocolSnapshot?.id ?? "legacy"}
        controller={controller}
        user={user}
        preferences={preferences}
        protocols={protocols}
        ready={ready}
        onApplied={(saved) => {
          controller.applyProtocol?.(saved);
          setProtocols((rows) => [
            ...rows.filter((p) => p.id !== saved.id),
            saved,
          ]);
        }}
      />
    </section>
  );
}
