import { Suspense } from "react";
import { TodayWorkspace } from "@/components/workspaces/TodayWorkspace";

export default function TodayPage() {
  return <Suspense fallback={<section className="skeleton-page" aria-label="正在恢复今日计划" />}><TodayWorkspace /></Suspense>;
}
