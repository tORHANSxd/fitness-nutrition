import { Suspense } from "react";
import { TodayWorkspace } from "@/components/workspaces/TodayWorkspace";
export default function GoalsPage() {
  return (
    <Suspense
      fallback={<section className="skeleton-page" aria-label="读取饮食目标" />}
    >
      <TodayWorkspace mode="goals" />
    </Suspense>
  );
}
