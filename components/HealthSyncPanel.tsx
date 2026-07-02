"use client";

import type { User } from "@supabase/supabase-js";
import { Activity, Check, Copy, HeartPulse, RefreshCw, Watch } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  applyHealthMetricToProfile,
  ensureHealthSyncToken,
  getHealthSyncToken,
  healthMetricDisplay,
  loadLatestHealthMetric,
  type HealthMetric
} from "@/lib/health";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { UserProfile } from "@/lib/types";

interface HealthSyncPanelProps {
  user: User | null;
  profile: UserProfile;
  onApply: (metric: HealthMetric) => void;
}

export function HealthSyncPanel({ user, profile, onApply }: HealthSyncPanelProps) {
  const [latest, setLatest] = useState<HealthMetric | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const configured = isSupabaseConfigured();

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [metric, existingToken] = await Promise.all([loadLatestHealthMetric(user), getHealthSyncToken(user)]);
      setLatest(metric);
      setToken(existingToken);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setLatest(null);
    setToken(null);
    refresh().catch(() => undefined);
  }, [refresh]);

  const endpoint = token && typeof window !== "undefined" ? `${window.location.origin}/api/health-sync?token=${token}` : null;

  async function handleGenerate() {
    if (!user) return;
    setLoading(true);
    try {
      const next = await ensureHealthSyncToken(user);
      setToken(next);
      setMessage(next ? "已生成同步令牌，复制下方地址填入 iOS 快捷指令 / Health Auto Export。" : "生成令牌失败，请确认已执行 health_metrics.sql 且已登录。");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!endpoint) return;
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage("复制失败，请手动长按选择地址复制。");
    }
  }

  function handleApply() {
    if (!latest) return;
    onApply(latest);
    const bits: string[] = [];
    if (latest.weightKg != null) bits.push(`体重 ${latest.weightKg}kg`);
    if (latest.activeEnergyKcal != null) bits.push(`运动消耗 ${Math.round(latest.activeEnergyKcal)}kcal`);
    setMessage(bits.length ? `已应用到档案：${bits.join(" / ")}（自动重算 TDEE 与目标）。` : "该条数据没有可用于档案的体重/活动能量。");
  }

  if (!configured) {
    return null;
  }

  const hasApplyable = latest != null && (latest.weightKg != null || latest.activeEnergyKcal != null);

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line bg-surface/80 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent ring-1 ring-accent/30">
          <Watch size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">Apple 健康同步</h2>
          <p className="truncate text-xs text-muted">{latest ? `最新数据：${latest.metricDate}` : "尚无同步数据"}</p>
        </div>
        <button className="btn-secondary h-8 px-2.5 text-xs" type="button" onClick={() => refresh()} title="刷新">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="space-y-3 p-4">
        {latest ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {healthMetricDisplay.map(({ field, label, unit }) => {
              const value = latest[field];
              if (value == null) return null;
              return (
                <div key={field} className="rounded-lg border border-line bg-surface/50 p-2.5">
                  <div className="metric-label">{label}</div>
                  <div className="mt-0.5 text-sm font-semibold text-ink">
                    {typeof value === "number" ? value : String(value)}
                    {unit ? <span className="ml-0.5 text-[11px] font-normal text-muted">{unit}</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-line bg-panel/40 p-3 text-center text-xs text-muted">
            还没有同步数据。生成下方令牌并在 iPhone 上配置一次自动化，之后每天的体重、活动能量、静息心率等会自动写入这里。
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button className="btn-cta h-9 flex-1 px-3 text-xs" type="button" onClick={handleApply} disabled={!hasApplyable}>
            <Activity size={14} />
            应用最新到档案
          </button>
        </div>

        {/* 接入配置：令牌 + 端点地址 */}
        <div className="rounded-lg border border-line bg-panel/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="metric-label flex items-center gap-1.5">
              <HeartPulse size={13} /> 接入令牌
            </span>
            <button className="text-xs font-medium text-accent hover:underline" type="button" onClick={() => setShowGuide((v) => !v)}>
              {showGuide ? "收起步骤" : "怎么配置？"}
            </button>
          </div>

          {endpoint ? (
            <div className="mt-2 flex items-stretch gap-2">
              <code className="scrollbar-thin min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-line bg-ground/50 px-2.5 py-2 text-[11px] text-ink">
                {endpoint}
              </code>
              <button className="btn-secondary h-auto shrink-0 px-2.5 text-xs" type="button" onClick={handleCopy} title="复制地址">
                {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              </button>
            </div>
          ) : (
            <button className="btn-secondary mt-2 h-9 w-full px-3 text-xs" type="button" onClick={handleGenerate} disabled={loading || !user}>
              生成同步令牌
            </button>
          )}

          {showGuide ? (
            <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-muted">
              <li>先在 Supabase SQL Editor 执行仓库里的 <code className="rounded bg-white/10 px-1">supabase/health_metrics.sql</code>（仅一次）。</li>
              <li>在 Vercel/本地配置 <code className="rounded bg-white/10 px-1">SUPABASE_SERVICE_ROLE_KEY</code> 环境变量后重启。</li>
              <li>iPhone 装 App Store 的「Health Auto Export – JSON API」，新建 Automation：数据选 体重/活动能量/静息心率/HRV/睡眠，Aggregation 选每日，输出 JSON，URL 填上面复制的地址（POST）。设为每天自动。</li>
              <li>或用「快捷指令」：获取健康样本 → 组成 JSON → 「获取 URL 内容」POST 到上面的地址。</li>
              <li>回到本页点刷新，数据出现后点「应用最新到档案」。详见 <code className="rounded bg-white/10 px-1">docs/apple-health-sync.md</code>。</li>
            </ol>
          ) : null}
        </div>

        {message ? <p className="rounded-lg border border-accent/20 bg-accent/10 px-3 py-2 text-xs text-accent">{message}</p> : null}
      </div>
    </section>
  );
}
