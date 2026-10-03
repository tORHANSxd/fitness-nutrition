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
    const safeNext = next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/today";
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
          <p className="auth-brand-index mb-5">饮食 · 记录 · 趋势</p>
          <h1 className="auth-brand-title">吃得清楚，
记录从容。</h1>
        </div>
        <p className="max-w-md text-sm leading-6 text-white/60">从今天的一餐开始，找到适合自己的节奏。</p>
      </section>
      <div className="auth-frame">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark size={38} />
            <div>
              <h1 className="text-2xl text-ink">NutriTrain</h1>
              <p className="mt-1 text-xs font-medium text-muted">日常营养与训练记录</p>
            </div>
          </div>
          {configured ? (
            <AuthPanel user={null} onSignedIn={handleSignedIn} />
          ) : (
            <section className="auth-panel px-6 py-8" aria-labelledby="cloud-config-title">
              <h2 id="cloud-config-title" className="text-xl text-ink">服务暂未就绪</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                暂时无法登录，请稍后重试或联系管理员。
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
