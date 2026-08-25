"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FoodLibrary } from "@/components/FoodLibrary";
import { TemplateManager } from "@/components/TemplateManager";
import { useApp } from "@/components/app/AppProvider";

export function ResourcesWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { foods, persistTemplates, preferences, refreshFoods, templates, user } = useApp();
  const tab = searchParams.get("tab") === "templates" ? "templates" : "foods";
  return (
    <section className="space-y-4">
      <nav className="tab-list" aria-label="资源分类">
        <Link className={`tab-button ${tab === "foods" ? "is-active" : ""}`} href="/resources?tab=foods" aria-current={tab === "foods" ? "page" : undefined}>食物库</Link>
        <Link className={`tab-button ${tab === "templates" ? "is-active" : ""}`} href="/resources?tab=templates" aria-current={tab === "templates" ? "page" : undefined}>模板</Link>
      </nav>
      {tab === "foods" ? (
        <FoodLibrary foods={foods} user={user} energyUnit={preferences.energyUnit} onFoodsChanged={refreshFoods} onFoodsUpdated={() => refreshFoods()} />
      ) : (
        <TemplateManager
          templates={templates}
          foods={foods}
          onTemplatesChanged={persistTemplates}
          onApplyDayTemplate={(template) => router.push(`/today?template=${template.id}&section=meals`)}
          locale={preferences.locale}
          timeZone={preferences.timeZone}
        />
      )}
    </section>
  );
}
