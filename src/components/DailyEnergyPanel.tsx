"use client";

import { useState } from "react";
import Link from "next/link";
import type { PlannerController } from "@/components/usePlanner";
import { NumericDraftNotice, NumericDraftProvider, NumericInput, useNumericDraftForm } from "@/components/NumericInput";
import { calculateDailyTarget, targetTdee } from "@/lib/nutrition";
import { adjustDailyEnergy } from "@/lib/nutritionStrategy";
import { canonicalEnergy, displayEnergy, type EnergyUnit } from "@/lib/preferences";

export function DailyEnergyPanel({ controller, energyUnit }: { controller: PlannerController; energyUnit: EnergyUnit }) {
  const numeric = useNumericDraftForm();
  const { profile, result } = controller;
  const estimate = targetTdee(profile);
  const [tdee, setTdee] = useState<number | null>(estimate);
  const [deficit, setDeficit] = useState<number | null>(profile.dailyEnergyAdjustment?.deficitKcal ?? (estimate == null ? 0 : Math.max(0, estimate - result.dailyTarget.kcal)));
  const unit = energyUnit === "kj" ? "kJ" : "kcal";
  let preview = null, error = "";
  try {
    if (tdee != null && deficit != null) preview = adjustDailyEnergy(calculateDailyTarget({ ...profile, dailyEnergyAdjustment: undefined }), { tdeeKcal: tdee, deficitKcal: deficit });
  } catch (cause) { error = cause instanceof Error ? cause.message : "请检查热量设置。"; }
  const disabled = controller.saving || result.dailyTarget.kcal <= 0;
  return <NumericDraftProvider form={numeric}><section className="panel space-y-3 p-4" aria-label="当天热量缺口">
    <p className="text-sm" aria-label="当天目标来源">{profile.dailyEnergyAdjustment ? `${profile.planDate} 已单独调整目标` : profile.protocolSnapshot ? `本日使用 ${profile.protocolSnapshot.effectiveFrom} 起的日常目标${profile.protocolSnapshot.nutritionStrategy?.mode === "weekly_cycle" ? "（按训练日 / 休息日分配）" : ""}` : "尚未设置日常目标"}</p>
    {result.targetError && <p role="alert" className="text-danger text-sm">{result.targetError}</p>}
    {result.dailyTarget.kcal <= 0 ? <p className="text-sm"><Link className="text-accent2 underline" href="/goals">先设置日常目标</Link>，之后每天会自动带入。</p> : <details>
      <summary className="cursor-pointer text-sm font-medium">仅调整这一天</summary>
      <div className="mt-4 space-y-3">
      <p className="text-sm text-muted">只修改 {profile.planDate}，不改变日常目标。蛋白质和脂肪保持不变，热量变化由碳水调整。</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">估算维持热量（{unit}/天）<NumericInput className="field" aria-label="估算维持热量" label="估算维持热量" required value={tdee} minExclusive={0} max={displayEnergy(10000, energyUnit)} formatKey={energyUnit} formatValue={v => Number(displayEnergy(v, energyUnit).toFixed(2))} toValue={v => canonicalEnergy(v, energyUnit)} onValueChange={v => setTdee(v ?? null)} placeholder="填写日均总消耗" disabled={disabled} /></label>
        <label className="grid gap-1 text-sm">当天缺口（{unit}）<NumericInput className="field" aria-label="当天缺口" label="当天缺口" required value={deficit} min={0} max={displayEnergy(10000, energyUnit)} formatKey={energyUnit} formatValue={v => Number(displayEnergy(v, energyUnit).toFixed(2))} toValue={v => canonicalEnergy(v, energyUnit)} onValueChange={v => setDeficit(v ?? null)} disabled={disabled} /></label>
      </div>
      <button type="button" className="btn-secondary text-xs" disabled={disabled} onClick={() => setDeficit(0)}>今天吃到维持热量</button>
      <p className="text-xs text-muted">维持热量是估算的日均总消耗，已包含通常训练时，不要再加手表上的运动热量。</p>
      <NumericDraftNotice />
      {preview && <p className="text-sm" aria-label="当天目标预览">目标 {Math.round(displayEnergy(preview.kcal, energyUnit))} {unit} · 碳水 {preview.carbs.toFixed(1)} g · 蛋白质 {preview.protein.toFixed(1)} g · 脂肪 {preview.fat.toFixed(1)} g</p>}
      {tdee != null && deficit != null && deficit / tdee > .25 && <p className="text-sm text-warning">缺口超过估算维持热量的 25%，请结合饥饿、睡眠和训练表现复核；这不是通用安全界线。</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={disabled || !preview || Boolean(error)} onClick={() => { if (numeric.validateAll()) void controller.applyDailyEnergyAdjustment?.({ tdeeKcal: tdee!, deficitKcal: deficit! }); }}>{controller.saving ? "正在保存…" : "保存当天目标"}</button>{profile.dailyEnergyAdjustment && <button type="button" className="btn-secondary" disabled={disabled} onClick={() => controller.applyDailyEnergyAdjustment?.()}>取消当天调整</button>}</div>
      {profile.dailyEnergyAdjustment && <p className="text-xs text-muted">取消后恢复本日保存的基础目标，不会替换为后来设置的新目标。</p>}
      </div>
    </details>}
    {controller.message && <p className="text-sm" role="status">{controller.message}</p>}
  </section></NumericDraftProvider>;
}
