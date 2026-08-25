"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BodyLogView } from "@/components/BodyLogView";
import { HistoryView } from "@/components/HistoryView";
import { useApp } from "@/components/app/AppProvider";

const tabs = [
  { id: "body", label: "趋势与体测" },
  { id: "nutrition", label: "饮食历史" },
  { id: "training", label: "训练历史" }
] as const;

export function ProgressWorkspace() {
  const searchParams = useSearchParams();
  const { preferences, user } = useApp();
  const tab = tabs.some((item) => item.id === searchParams.get("tab")) ? searchParams.get("tab") : "body";
  return (
    <section className="space-y-4">
      <nav className="tab-list" aria-label="进度分类">
        {tabs.map((item) => (
          <Link key={item.id} className={`tab-button ${tab === item.id ? "is-active" : ""}`} href={`/progress?tab=${item.id}`} aria-current={tab === item.id ? "page" : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>
      {tab === "body" ? <BodyLogView user={user} timeZone={preferences.timeZone} locale={preferences.locale} unitSystem={preferences.unitSystem} /> : null}
      {tab === "nutrition" ? <HistoryView user={user} locale={preferences.locale} energyUnit={preferences.energyUnit} /> : null}
      {tab === "training" ? (
        <section className="panel p-5">
          <h2 className="text-xl text-ink">训练历史</h2>
          <p className="mt-2 text-sm text-muted">训练记录、周训练量和估算最大重量集中在训练页。</p>
          <Link className="btn-primary mt-4 w-fit" href="/training?section=history">查看训练历史</Link>
        </section>
      ) : null}
    </section>
  );
}
