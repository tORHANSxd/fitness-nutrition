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
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">当天热量缺口</h2><span className="text-xs text-muted">仅 {profile.planDate}</span></div>
    {result.targetError && <p role="alert" className="text-danger text-sm">{result.targetError}</p>}
    {result.dailyTarget.kcal <= 0 ? <p className="text-sm"><Link className="text-accent2 underline" href={`/goals?date=${profile.planDate}`}>先设置热量与蛋白质、脂肪目标</Link>，再调整当天缺口。</p> : <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">估算维持热量（{unit}/天）<NumericInput className="field" aria-label="估算维持热量" label="估算维持热量" required value={tdee} minExclusive={0} max={displayEnergy(10000, energyUnit)} formatKey={energyUnit} formatValue={v => Number(displayEnergy(v, energyUnit).toFixed(2))} toValue={v => canonicalEnergy(v, energyUnit)} onValueChange={v => setTdee(v ?? null)} placeholder="填写日均总消耗" disabled={disabled} /></label>
        <label className="grid gap-1 text-sm">当天缺口（{unit}）<NumericInput className="field" aria-label="当天缺口" label="当天缺口" required value={deficit} min={0} max={displayEnergy(10000, energyUnit)} formatKey={energyUnit} formatValue={v => Number(displayEnergy(v, energyUnit).toFixed(2))} toValue={v => canonicalEnergy(v, energyUnit)} onValueChange={v => setDeficit(v ?? null)} disabled={disabled} /></label>
      </div>
      <div className="flex flex-wrap gap-2">{[0, 300, 500, 800, 1000].map(value => <button type="button" className="btn-secondary text-xs" disabled={disabled} key={value} onClick={() => setDeficit(value)}>{value === 0 ? "维持" : Math.round(displayEnergy(value, energyUnit))} {value > 0 ? unit : ""}</button>)}</div>
      <p className="text-xs text-muted">维持热量是估算日均总消耗，已含通常训练时无需再加运动消耗。蛋白质和脂肪沿用目标，碳水按剩余热量计算；具体食物由你选择。</p>
      <NumericDraftNotice />
      {preview && <p className="text-sm" aria-label="当天目标预览">目标 {Math.round(displayEnergy(preview.kcal, energyUnit))} {unit} · 碳水 {preview.carbs.toFixed(1)} g · 蛋白质 {preview.protein.toFixed(1)} g · 脂肪 {preview.fat.toFixed(1)} g</p>}
      {tdee != null && deficit != null && deficit / tdee > .25 && <p className="text-sm text-warning">缺口超过估算维持热量的 25%，请结合饥饿、睡眠和训练表现复核；这不是通用安全界线。</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={disabled || !preview || Boolean(error)} onClick={() => { if (numeric.validateAll()) void controller.applyDailyEnergyAdjustment?.({ tdeeKcal: tdee!, deficitKcal: deficit! }); }}>{controller.saving ? "正在保存…" : "保存当天目标"}</button>{profile.dailyEnergyAdjustment && <button type="button" className="btn-secondary" disabled={disabled} onClick={() => controller.applyDailyEnergyAdjustment?.()}>恢复原目标</button>}</div>
    </>}
    {controller.message && <p className="text-sm" role="status">{controller.message}</p>}
  </section></NumericDraftProvider>;
}
