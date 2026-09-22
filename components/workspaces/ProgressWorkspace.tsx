"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BodyLogView } from "@/components/BodyLogView";
import { HistoryView } from "@/components/HistoryView";
import { useApp } from "@/components/app/AppProvider";
import { TrainingLog } from "@/components/TrainingLog";
import { ProgressReviewPanel } from "@/components/ProgressReviewPanel";

const tabs = [
  { id: "body", label: "身体变化" },
  { id: "nutrition", label: "饮食计划" },
  { id: "training", label: "训练记录" },
] as const;

export function ProgressWorkspace() {
  const searchParams = useSearchParams();
  const { preferences, user } = useApp();
  const tab = tabs.some((item) => item.id === searchParams.get("tab"))
    ? searchParams.get("tab")
    : "body";
  return (
    <section className="space-y-4">
      <nav className="tab-list" aria-label="进度分类">
        {tabs.map((item) => (
          <Link
            key={item.id}
            className={`tab-button ${tab === item.id ? "is-active" : ""}`}
            href={`/progress?tab=${item.id}`}
            aria-current={tab === item.id ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {tab === "body" ? (
        <>
          <BodyLogView
            user={user}
            timeZone={preferences.timeZone}
            locale={preferences.locale}
            unitSystem={preferences.unitSystem}
            mode="trend"
          />
          <details className="panel p-5">
            <summary className="cursor-pointer text-sm">回顾饮食目标</summary>
            <div className="mt-4">
              <ProgressReviewPanel
                user={user}
                timeZone={preferences.timeZone}
                energyUnit={preferences.energyUnit}
                unitSystem={preferences.unitSystem}
              />
            </div>
          </details>
        </>
      ) : null}
      {tab === "nutrition" ? (
        <HistoryView
          user={user}
          locale={preferences.locale}
          energyUnit={preferences.energyUnit}
        />
      ) : null}
      {tab === "training" ? (
        <TrainingLog
          user={user}
          onRequireLogin={() => {}}
          timeZone={preferences.timeZone}
          locale={preferences.locale}
          weekStartsOn={preferences.weekStartsOn}
          unitSystem={preferences.unitSystem}
          historyOnly
        />
      ) : null}
    </section>
  );
}
