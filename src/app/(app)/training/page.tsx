import { Suspense } from "react";
import { TrainingWorkspace } from "@/components/workspaces/TrainingWorkspace";

export default function TrainingPage() {
  return <Suspense fallback={<section className="skeleton-page" aria-label="正在恢复训练记录" />}><TrainingWorkspace /></Suspense>;
}
