import { Suspense } from "react";
import { ResourcesWorkspace } from "@/components/workspaces/ResourcesWorkspace";

export default function ResourcesPage() {
  return <Suspense fallback={<section className="skeleton-page" aria-label="正在恢复资源" />}><ResourcesWorkspace /></Suspense>;
}
