"use client";

import type { User } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthPanel } from "@/components/AuthPanel";
import { BrandMark } from "@/components/BrandMark";

export function LoginScreen({ configured }: { configured: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleSignedIn(user: User | null) {
    if (!user) {
      return;
    }
    const next = searchParams.get("next");
    const safeNext = next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/overview";
    router.replace(safeNext);
    router.refresh();
  }

  return (
    <main className="auth-stage">
      <section className="auth-brand" aria-label="NutriTrain">
        <div className="flex items-center gap-3">
          <BrandMark size={34} />
          <span className="text-lg font-bold">NUTRITRAIN</span>
        </div>
        <div>
          <p className="auth-brand-index mb-5">TRAINING / NUTRITION / PROGRESS</p>
          <h1 className="auth-brand-title">让每一次训练，都有数据回应。</h1>
        </div>
        <p className="max-w-md text-sm leading-6 text-white/60">训练、饮食与身体趋势，按你的本地日期准确归档。</p>
      </section>
      <div className="auth-frame">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark size={38} />
            <div>
              <h1 className="text-2xl text-ink">NutriTrain</h1>
              <p className="mt-1 text-xs font-medium text-muted">训练与营养计划器</p>
            </div>
          </div>
          {configured ? (
            <AuthPanel user={null} onSignedIn={handleSignedIn} />
          ) : (
            <section className="auth-panel px-6 py-8" aria-labelledby="cloud-config-title">
              <h2 id="cloud-config-title" className="text-xl text-ink">应用尚未连接云端</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                管理员需要配置 <code className="rounded bg-black/[0.06] px-1">NEXT_PUBLIC_SUPABASE_URL</code> 与
                <code className="ml-1 rounded bg-black/[0.06] px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> 后重启应用。
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
