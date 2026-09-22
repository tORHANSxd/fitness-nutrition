"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TodayWorkspace } from "@/components/workspaces/TodayWorkspace";
import { TrainingWorkspace } from "@/components/workspaces/TrainingWorkspace";
import { BodyLogView } from "@/components/BodyLogView";
import { useApp } from "@/components/app/AppProvider";

export function RecordsWorkspace() {
  const params = useSearchParams();
  const { user, preferences } = useApp();
  const tab = ["training", "body"].includes(params.get("tab") ?? "")
    ? params.get("tab")
    : "intake";
  const date = params.get("date");
  return (
    <section className="space-y-5">
      <nav className="tab-list" aria-label="记录分类">
        {[
          { id: "intake", label: "饮食" },
          { id: "training", label: "训练" },
          { id: "body", label: "身体数据" },
        ].map((item) => (
          <Link
            key={item.id}
            className={`tab-button ${tab === item.id ? "is-active" : ""}`}
            href={`/records?tab=${item.id}${date ? `&date=${date}` : ""}`}
            aria-current={tab === item.id ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {tab === "intake" ? (
        <TodayWorkspace mode="records" />
      ) : tab === "training" ? (
        <TrainingWorkspace />
      ) : (
        <BodyLogView
          user={user}
          timeZone={preferences.timeZone}
          locale={preferences.locale}
          unitSystem={preferences.unitSystem}
          mode="record"
        />
      )}
    </section>
  );
}
