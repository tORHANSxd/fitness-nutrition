import { Suspense } from "react";
import { ProgressWorkspace } from "@/components/workspaces/ProgressWorkspace";

export default function ProgressPage() {
  return <Suspense fallback={<section className="skeleton-page" aria-label="正在恢复进度" />}><ProgressWorkspace /></Suspense>;
}
