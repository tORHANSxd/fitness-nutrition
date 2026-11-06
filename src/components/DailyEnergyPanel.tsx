"use client";

import { useState } from "react";
import Link from "next/link";
import type { PlannerController } from "@/components/usePlanner";
import { NumericDraftNotice, NumericDraftProvider, NumericInput, useNumericDraftForm } from "@/components/NumericInput";
import { calculateDailyTarget, targetTdee } from "@/lib/nutrition";
import { adjustDailyEnergy } from "@/lib/nutritionStrategy";
import { canonicalEnergy, displayEnergy, type EnergyUnit } from "@/lib/preferences";
import { MacroMethodFields } from "@/components/MacroMethodFields";
import { dailyFfmKg, type DailyMacroInputs } from "@/lib/nutritionGoals/flexibleMacros";

export function DailyEnergyPanel({ controller, energyUnit }: { controller: PlannerController; energyUnit: EnergyUnit }) {
  const numeric = useNumericDraftForm();
  const { profile, result } = controller;
  const estimate = targetTdee(profile);
  const [mode, setMode] = useState<"deficit" | "fixed">(profile.dailyEnergyAdjustment?.targetKcal != null ? "fixed" : "deficit");
  const [targetKcal, setTargetKcal] = useState<number | null>(profile.dailyEnergyAdjustment?.targetKcal ?? result.dailyTarget.kcal);
  const [tdee, setTdee] = useState<number | null>(estimate);
  const [deficit, setDeficit] = useState<number | null>(profile.dailyEnergyAdjustment?.deficitKcal ?? (estimate == null ? 0 : Math.max(0, estimate - result.dailyTarget.kcal)));
  const [customMacros, setCustomMacros] = useState(!!profile.dailyEnergyAdjustment?.macroInputs);
  const [macroInputs, setMacroInputs] = useState<DailyMacroInputs>(() => {
    if (profile.dailyEnergyAdjustment?.macroInputs) return structuredClone(profile.dailyEnergyAdjustment.macroInputs);
    const nutrition = profile.protocolSnapshot?.nutrition;
    const methods = nutrition?.policy.policyVersion === "nutrition-goals-v5.1" ? nutrition.policy : null;
    return { version: 1, weightKg: nutrition?.body.weightKg ?? (profile.weightKg > 0 ? profile.weightKg : null), bodyFatPct: nutrition?.body.bodyFatPct ?? profile.bodyFatPct ?? null,
      ...(nutrition?.body.ffmInput === "direct" ? { ffmInput: "direct" as const, ffmKg: nutrition.body.ffmKg ?? null } : {}),
      protein: methods?.protein ?? { kind: "fixed_grams", grams: result.dailyTarget.protein }, fat: methods?.fat ?? { kind: "fixed_grams", grams: result.dailyTarget.fat }, carbs: methods?.carbs ?? { kind: "residual" },
    };
  });
  const extra = customMacros ? { macroInputs } : {};
  const adjustment = mode === "fixed" ? targetKcal != null ? { targetKcal, ...extra } : undefined : tdee != null && deficit != null ? { tdeeKcal: tdee, deficitKcal: deficit, ...extra } : undefined;
  const unit = energyUnit === "kj" ? "kJ" : "kcal";
  let preview = null, error = "";
  try {
    if (adjustment) preview = adjustDailyEnergy(calculateDailyTarget({ ...profile, dailyEnergyAdjustment: undefined }), adjustment);
  } catch (cause) { error = cause instanceof Error ? cause.message : "请检查热量设置。"; }
  const disabled = controller.saving || result.dailyTarget.kcal <= 0;
  return <NumericDraftProvider form={numeric}><section className="panel space-y-3 p-4" aria-label="当天热量缺口">
    <p className="text-sm" aria-label="当天目标来源">{profile.dailyEnergyAdjustment ? `${profile.planDate} 已单独调整目标` : profile.protocolSnapshot ? `本日使用 ${profile.protocolSnapshot.effectiveFrom} 起的日常目标${profile.protocolSnapshot.nutritionStrategy?.mode === "weekly_cycle" ? "（按训练日 / 休息日分配）" : ""}` : "尚未设置日常目标"}</p>
    {result.targetError && <p role="alert" className="text-danger text-sm">{result.targetError}</p>}
    {result.dailyTarget.kcal <= 0 ? <p className="text-sm"><Link className="text-accent2 underline" href="/goals">先设置日常目标</Link>，之后每天会自动带入。</p> : <details>
      <summary className="cursor-pointer text-sm font-medium">仅调整这一天</summary>
      <div className="mt-4 space-y-3">
      <p className="text-sm text-muted">只修改 {profile.planDate}，不改变日常目标。默认保留蛋白质和脂肪，也可单独填写当天身体数据与营养素规则。</p>
      <label className="block text-sm">当天热量方式<select className="field mt-1 w-full" value={mode} disabled={disabled} onChange={event => setMode(event.target.value as "deficit" | "fixed")}><option value="deficit">维持热量减缺口</option><option value="fixed">直接填写摄入热量</option></select></label>
      {mode === "fixed" ? <label className="block text-sm">当天摄入热量（{unit}）<NumericInput className="field mt-1 w-full" label="当天摄入热量" aria-label="当天摄入热量" required value={targetKcal} minExclusive={0} max={displayEnergy(10000, energyUnit)} formatKey={energyUnit} formatValue={v => Number(displayEnergy(v, energyUnit).toFixed(2))} toValue={v => canonicalEnergy(v, energyUnit)} onValueChange={v => setTargetKcal(v ?? null)} disabled={disabled} /></label> : <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">估算维持热量（{unit}/天）<NumericInput className="field" aria-label="估算维持热量" label="估算维持热量" required value={tdee} minExclusive={0} max={displayEnergy(10000, energyUnit)} formatKey={energyUnit} formatValue={v => Number(displayEnergy(v, energyUnit).toFixed(2))} toValue={v => canonicalEnergy(v, energyUnit)} onValueChange={v => setTdee(v ?? null)} placeholder="填写日均总消耗" disabled={disabled} /></label>
        <label className="grid gap-1 text-sm">当天缺口（{unit}）<NumericInput className="field" aria-label="当天缺口" label="当天缺口" required value={deficit} min={0} max={displayEnergy(10000, energyUnit)} formatKey={energyUnit} formatValue={v => Number(displayEnergy(v, energyUnit).toFixed(2))} toValue={v => canonicalEnergy(v, energyUnit)} onValueChange={v => setDeficit(v ?? null)} disabled={disabled} /></label>
      </div>
      <button type="button" className="btn-secondary text-xs" disabled={disabled} onClick={() => setDeficit(0)}>今天吃到维持热量</button>
      <p className="text-xs text-muted">维持热量是估算的日均总消耗，已包含通常训练时，不要再加手表上的运动热量。</p>
      </>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={customMacros} onChange={event => setCustomMacros(event.target.checked)} disabled={disabled} />单独调整当天体重、体脂和三大营养素</label>
      {customMacros && <fieldset disabled={disabled} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">当天计算体重（kg）<NumericInput className="field mt-1 w-full" label="当天计算体重" aria-label="当天计算体重" value={macroInputs.weightKg} minExclusive={0} onValueChange={n => setMacroInputs(current => ({ ...current, weightKg: n ?? null }))} /></label>
          {macroInputs.ffmInput === "direct" ? <label className="text-sm">当天去脂体重（kg）<NumericInput className="field mt-1 w-full" label="当天去脂体重" aria-label="当天去脂体重" value={macroInputs.ffmKg} minExclusive={0} onValueChange={n => setMacroInputs(current => ({ ...current, ffmKg: n ?? null }))} /></label> : <label className="text-sm">当天体脂率（%）<NumericInput className="field mt-1 w-full" label="当天体脂率" aria-label="当天体脂率" value={macroInputs.bodyFatPct} min={0} max={100} onValueChange={n => setMacroInputs(current => ({ ...current, bodyFatPct: n ?? null }))} /></label>}
        </div>
        <label className="block text-sm">当天去脂体重来源<select className="field mt-1 w-full" value={macroInputs.ffmInput ?? "body_fat"} onChange={event => setMacroInputs(current => ({ ...current, ffmInput: event.target.value as "body_fat" | "direct", ffmKg: null }))}><option value="body_fat">体重 × (1 − 体脂率)</option><option value="direct">直接填写去脂体重</option></select></label>
        <p className="text-xs text-muted">{dailyFfmKg(macroInputs) != null && `当前去脂体重 ${dailyFfmKg(macroInputs)!.toFixed(2)} kg。`}这些输入仅保存在本日，不写入体测档案。</p>
        <div className="grid gap-3 sm:grid-cols-3">{(["protein", "fat", "carbs"] as const).map(key => <MacroMethodFields key={key} nutrient={key} value={macroInputs[key]} grams={result.dailyTarget[key]} onChange={method => setMacroInputs(current => ({ ...current, [key]: method }))} />)}</div>
        <p className="text-xs text-muted">最多一项使用剩余热量；三项全部指定时，合计热量须等于目标。倍数按实际乘积计算。</p>
      </fieldset>}
      <NumericDraftNotice />
      {preview && <p className="text-sm" aria-label="当天目标预览">目标 {Math.round(displayEnergy(preview.kcal, energyUnit))} {unit} · 碳水 {preview.carbs.toFixed(1)} g · 蛋白质 {preview.protein.toFixed(1)} g · 脂肪 {preview.fat.toFixed(1)} g</p>}
      {mode === "deficit" && tdee != null && deficit != null && deficit / tdee > .25 && <p className="text-sm text-warning">缺口超过估算维持热量的 25%，请结合饥饿、睡眠和训练表现复核；这不是通用安全界线。</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={disabled || !preview || Boolean(error)} onClick={() => { if (numeric.validateAll() && adjustment) void controller.applyDailyEnergyAdjustment?.(adjustment); }}>{controller.saving ? "正在保存…" : "保存当天目标"}</button>{profile.dailyEnergyAdjustment && <button type="button" className="btn-secondary" disabled={disabled} onClick={() => controller.applyDailyEnergyAdjustment?.()}>取消当天调整</button>}</div>
      {profile.dailyEnergyAdjustment && <p className="text-xs text-muted">取消后恢复本日保存的基础目标，不会替换为后来设置的新目标。</p>}
      </div>
    </details>}
    {controller.message && <p className="text-sm" role="status">{controller.message}</p>}
  </section></NumericDraftProvider>;
}
