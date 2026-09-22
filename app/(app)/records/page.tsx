import { Suspense } from "react";
import { RecordsWorkspace } from "@/components/workspaces/RecordsWorkspace";
export default function RecordsPage() {
  return (
    <Suspense
      fallback={<section className="skeleton-page" aria-label="读取每日记录" />}
    >
      <RecordsWorkspace />
    </Suspense>
  );
}
