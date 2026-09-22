"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { NumericDraftProvider, NumericInput, NumericDraftNotice, useNumericDraftForm } from "@/components/NumericInput";
import { NutritionCalculationDetails } from "@/components/NutritionCalculationDetails";
import type { PlannerController } from "@/components/usePlanner";
import { canonicalEnergy, canonicalLength, canonicalWeight, displayEnergy, displayLength, displayWeight, type AppPreferences } from "@/lib/preferences";
import { calculateNutritionTarget, nutritionInputFingerprint } from "@/lib/nutritionGoals/calculator";
import { createNutritionPolicy, goalPresets } from "@/lib/nutritionGoals/presets";
import { resolveCalculationBodySnapshot } from "@/lib/nutritionGoals/bodySnapshot";
import { createNutritionSnapshot } from "@/lib/nutritionGoals/snapshot";
import type { CalculationBodySnapshot, GoalPresetId, NutritionPolicyV1 } from "@/lib/nutritionGoals/types";
import { createTreProtocol } from "@/lib/planPresets";
import { targetForAllocation } from "@/lib/planProtocol";
import { activatePlanProtocol } from "@/lib/protocolStorage";
import { buildNutritionResult } from "@/lib/nutrition";
import { loadBodyLogs, type BodyLog } from "@/lib/bodyLogs";
import type { PlanProtocol } from "@/lib/types";
import { todayKey } from "@/lib/dateTime";

function GoalNumber({ label, value, onChange, preferences, unit }: { label: string; value: number | null | undefined; onChange: (value: number) => void; preferences: AppPreferences; unit?: "energy" | "weight" | "length" }) {
  const display = (n: number) => unit === "energy" ? displayEnergy(n, preferences.energyUnit) : unit === "weight" ? displayWeight(n, preferences.unitSystem) : unit === "length" ? displayLength(n, preferences.unitSystem) : n;
  const canonical = (n: number) => unit === "energy" ? canonicalEnergy(n, preferences.energyUnit) : unit === "weight" ? canonicalWeight(n, preferences.unitSystem) : unit === "length" ? canonicalLength(n, preferences.unitSystem) : n;
  const suffix = unit === "energy" ? preferences.energyUnit === "kj" ? "kJ" : "kcal" : unit === "weight" ? preferences.unitSystem === "imperial" ? "lb" : "kg" : unit === "length" ? preferences.unitSystem === "imperial" ? "in" : "cm" : "";
  return <label className="block min-w-0 text-sm">{label}{suffix && ` (${suffix})`}<NumericInput className="field mt-1 w-full min-w-0" label={label} aria-label={label} required value={value} formatKey={`${preferences.unitSystem}/${preferences.energyUnit}`} formatValue={n => Number(display(n).toFixed(4))} toValue={canonical} onValueChange={n => { if (n != null) onChange(n); }} /></label>;
}

export function NutritionGoalPanel({ controller, user, preferences, protocols, ready, onApplied }: { controller: PlannerController; user: User; preferences: AppPreferences; protocols: PlanProtocol[]; ready: boolean | null; onApplied: (p: PlanProtocol) => void }) {
  const active = controller.profile.protocolSnapshot;
  const saved = active?.nutrition;
  const [editing, setEditing] = useState(!saved);
  const [policy, setPolicy] = useState<NutritionPolicyV1>(() => saved ? structuredClone(saved.policy) : { ...createNutritionPolicy("cut_recomp"), presetId: "custom", rmr: { kind: "not_used" }, tdee: { kind: "not_used" }, energy: { kind: "from_macros" }, protein: { kind: "fixed_grams", grams: 0 }, fat: { kind: "fixed_grams", grams: 0 }, carbs: { kind: "fixed_grams", grams: 0 } });
  const [body, setBody] = useState<CalculationBodySnapshot>(() => saved ? { ...structuredClone(saved.body), calculationDate: todayKey(preferences.timeZone) } : {
    calculationDate: todayKey(preferences.timeZone), timeZone: preferences.timeZone,
    weightKg: controller.profile.weightKg > 0 ? controller.profile.weightKg : null, weightSource: "manual",
    heightCm: controller.profile.heightCm > 0 ? controller.profile.heightCm : null,
    ageYears: controller.profile.age > 0 ? controller.profile.age : null, ageSource: "confirmed_years", calculationSex: null,
    scope: { adultAttested: false }, recovery: "unknown",
  });
  const [pendingPreset, setPendingPreset] = useState<GoalPresetId | null>(null);
  const [logs, setLogs] = useState<BodyLog[]>([]);
  const [logMessage, setLogMessage] = useState("");
  const [morningConfirmed, setMorningConfirmed] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState<string>(todayKey(preferences.timeZone));
  const [preview, setPreview] = useState<PlanProtocol | null>(null);
  const [previewMealsKey, setPreviewMealsKey] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const numeric = useNumericDraftForm();
  useEffect(() => { let live = true; loadBodyLogs(user, 60).then(rows => { if (live) setLogs(rows); }).catch(() => { if (live) setLogMessage("体测读取失败，仍可明确手填计算输入。"); }); return () => { live = false; }; }, [user]);
  const resolvedBody = useMemo(() => resolveCalculationBodySnapshot({ ...body, timeZone: preferences.timeZone }, logs, morningConfirmed), [body, logs, morningConfirmed, preferences.timeZone]);
  const result = useMemo(() => calculateNutritionTarget(policy, resolvedBody), [policy, resolvedBody]);
  const previewCurrent = preview?.nutrition?.result.inputFingerprint === result.inputFingerprint && previewMealsKey === nutritionInputFingerprint(controller.meals);
  const energy = (v: number) => `${Number(displayEnergy(v, preferences.energyUnit).toFixed(2))} ${preferences.energyUnit === "kj" ? "kJ" : "kcal"}`;
  const editPolicy = (patch: Partial<NutritionPolicyV1>, custom = true) => { setPolicy(current => ({ ...current, ...(custom ? { presetId: "custom", originPreset: current.presetId === "custom" ? current.originPreset : current.presetId, ...(current.energy.kind === "preset_percent" ? { energy: { kind: "percent", deltaRatio: current.presetDeltaRatio } } : {}) } as const : {}), ...patch })); setPreview(null); };
  const editBody = (patch: Partial<CalculationBodySnapshot>) => { setBody(current => ({ ...current, ...patch })); setPreview(null); };
  const setPreset = (id: GoalPresetId, keep: boolean) => {
    const next = createNutritionPolicy(id);
    next.rmr = policy.rmr.kind === "not_used" ? { kind: "mifflin_st_jeor" } : policy.rmr;
    next.tdee = policy.tdee.kind === "not_used" ? next.tdee : policy.tdee;
    if (keep) {
      if (policy.energy.kind === "fixed_kcal" || policy.energy.kind === "from_macros") { next.energy = policy.energy; next.carbs = policy.carbs; }
      if (policy.protein.kind === "fixed_grams") next.protein = policy.protein;
      if (policy.fat.kind === "fixed_grams") next.fat = policy.fat;
      next.originPreset = id === "custom" ? policy.originPreset : id; next.presetId = "custom";
      if (next.energy.kind === "preset_percent") next.energy = { kind: "percent", deltaRatio: next.presetDeltaRatio };
    }
    setPolicy(next); setPendingPreset(null); setPreview(null);
  };
  const locked = controller.meals.filter(m => m.locked && preview && (["protein", "carbs", "fat"] as const).some(k => {
    const slot = preview.mealSlots.find(s => s.id === m.id);
    const old = controller.result.mealRecommendations.find(r => r.mealId === m.id)?.target;
    return !slot || !old || Math.abs(targetForAllocation(preview.dailyTarget, slot.targetAllocation)[k] - old[k]) > 1e-6;
  }));
  const previewResult = useMemo(() => preview ? buildNutritionResult({ ...controller.profile, targetMode: "calibrated", allocationMode: "explicitMacros", protocolSnapshot: preview }, controller.meals.map((meal, i) => ({ ...meal, targetAllocation: preview.mealSlots[i]?.targetAllocation })), [...controller.foodsById.values()]) : null, [preview, controller.profile, controller.meals, controller.foodsById]);
  const makePreview = () => {
    if (!numeric.validateAll() || result.status !== "valid") return;
    try {
      const previous = [...protocols].sort((a, b) => b.version - a.version)[0];
      if (!effectiveFrom || effectiveFrom < todayKey(preferences.timeZone) || effectiveFrom < body.calculationDate) throw new Error("请选择今天或未来的生效日期，不覆盖过去计划。");
      const ratioSum = controller.meals.reduce((sum, m) => sum + m.ratio, 0);
      if (!controller.meals.length || ratioSum <= 0) throw new Error("请先设置有效餐次与份额。");
      const mealSlots = controller.meals.map((m, index) => {
        const minutes = 690 + Math.round(index * 510 / Math.max(1, controller.meals.length - 1));
        const clock = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
        return { id: m.id, name: m.name, kind: m.kind ?? "main" as const, schedule: m.schedule ?? { start: clock(minutes), end: clock(minutes + 20), endDayOffset: 0 as const }, targetAllocation: m.targetAllocation ?? { protein: m.ratio / ratioSum, carbs: m.ratio / ratioSum, fat: m.ratio / ratioSum } };
      });
      setPreview(createTreProtocol({ id: crypto.randomUUID(), effectiveFrom, cycleAnchorDate: active?.trainingCycle.anchorDate ?? effectiveFrom, timeZone: preferences.timeZone, previous, mealSlots, nutrition: createNutritionSnapshot(policy, resolvedBody), changeReason: "用户预览并确认营养目标策略" }));
      setPreviewMealsKey(nutritionInputFingerprint(controller.meals)); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "无法预览，请检查输入。"); }
  };
  const confirm = async () => {
    if (!preview || !previewCurrent || result.status !== "valid" || !ready || busy || locked.length || !numeric.validateAll()) return;
    setBusy(true); setMessage("");
    try { const protocol = await activatePlanProtocol(preview, user); onApplied(protocol); setPreview(null); setEditing(false); setMessage(`目标已保存，${protocol.effectiveFrom} 起生效。`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "保存失败，可使用同一请求重试。"); } finally { setBusy(false); }
  };
  const p = policy.protein, f = policy.fat, e = policy.energy, t = policy.tdee, r = policy.rmr;
  const usesTdee = e.kind !== "fixed_kcal" && e.kind !== "from_macros";
  const usesRmr = usesTdee && t.kind !== "manual";
  const needsFfm = (usesRmr && r.kind === "cunningham_1980") || p.kind === "ffm";
  const needsDemographics = usesRmr && r.kind === "mifflin_st_jeor";
  const needsWeight = needsDemographics || p.kind === "body_weight" || f.kind === "body_weight" || needsFfm;
  const number = (label: string, value: number | null | undefined, onChange: (n: number) => void, unit?: "energy" | "weight" | "length") => <GoalNumber label={label} value={value} onChange={onChange} preferences={preferences} unit={unit} />;
  return <NumericDraftProvider form={numeric}><section className="min-w-0 space-y-4" aria-label="自动营养目标">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg">每日营养目标</h2><button className="btn-secondary" type="button" onClick={() => setEditing(v => !v)}>{editing ? "收起设置" : "调整目标"}</button></div>
    {saved && <div className="rounded-xl bg-panel p-4"><p className="text-sm">{energy(active.dailyTarget.kcal)} · 碳水 {active.dailyTarget.carbs} g · 蛋白质 {active.dailyTarget.protein} g · 脂肪 {active.dailyTarget.fat} g</p><p className="mt-1 text-xs text-muted">{active.effectiveFrom} 起生效</p></div>}
    {saved && <details><summary className="cursor-pointer py-2 text-sm text-muted">查看计算依据</summary><NutritionCalculationDetails result={saved.result} policy={saved.policy} energyUnit={preferences.energyUnit} frozen /></details>}
    {saved && logs.some(l => l.logDate > saved.body.calculationDate && l.logDate <= body.calculationDate && l.weightKg != null) && <p className="text-sm">有更新体测，可打开编辑重新计算；已生效目标不变。</p>}
    {ready === false && <p role="status" className="text-sm text-muted">目标保存暂不可用，可以先计算预览。</p>}
    {editing && <fieldset disabled={busy} className="min-w-0 space-y-4">
      <div className="grid grid-cols-2 gap-3"><button type="button" className={e.kind === "from_macros" ? "btn-primary" : "btn-secondary"} onClick={() => editPolicy({ rmr: {kind:"not_used"}, tdee: {kind:"not_used"}, energy: {kind:"from_macros"}, protein:{kind:"fixed_grams",grams:controller.result.dailyTarget.protein}, fat:{kind:"fixed_grams",grams:controller.result.dailyTarget.fat}, carbs:{kind:"fixed_grams",grams:controller.result.dailyTarget.carbs} })}>手动设置</button><button type="button" className={usesTdee ? "btn-primary" : "btn-secondary"} onClick={() => setPreset("cut_recomp",false)}>按身体数据计算</button></div>
      {e.kind === "from_macros" && <div className="grid gap-3 sm:grid-cols-3">{p.kind === "fixed_grams" && number("每日蛋白质 g", p.grams,n=>editPolicy({protein:{...p,grams:n}}))}{f.kind === "fixed_grams" && number("每日脂肪 g",f.grams,n=>editPolicy({fat:{...f,grams:n}}))}{policy.carbs.kind === "fixed_grams" && number("每日碳水 g",policy.carbs.grams,n=>editPolicy({carbs:{kind:"fixed_grams",grams:n}}))}</div>}
      {e.kind !== "from_macros" && <>
      <label className="block text-sm">我的目标场景<select className="field mt-1 w-full" value={policy.presetId} onChange={event => {
        const id = event.target.value as GoalPresetId;
        if (e.kind === "fixed_kcal" || p.kind === "fixed_grams" || f.kind === "fixed_grams") setPendingPreset(id); else setPreset(id, false);
      }}>{Object.entries(goalPresets).map(([id, preset]) => <option key={id} value={id}>{preset.name}</option>)}<option value="custom">自定义计算</option></select></label>

      <details className="rounded border border-line p-3"><summary className="cursor-pointer">选择依据：训练背景与活动情况</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
        {([
          ["resistanceTraining", "是否规律抗阻训练", ["是", "否"]], ["experience", "抗阻训练经历", ["刚开始", "恢复训练", "已有连续训练经验"]],
          ["weightIntent", "当前主动体重方向", ["减重", "维持", "增重"]], ["workActivity", "工作活动", ["主要坐着", "经常走动", "体力劳动"]],
          ["dailySteps", "日常步数参考", ["少于5000", "5000至10000", "超过10000"]], ["trainingFrequency", "每周训练频率", ["无规律训练", "1至2天", "3至4天", "5至7天"]],
        ] as const).map(([key, label, options]) => <label key={key} className="text-sm">{label}<select className="field mt-1 w-full" value={body.selectionContext?.[key] ?? ""} onChange={ev => editBody({ selectionContext: { ...body.selectionContext, [key]: ev.target.value } })}><option value="">未说明 / 不确定</option>{options.map(option => <option key={option}>{option}</option>)}</select></label>)}
      </div><p className="mt-2 text-xs text-muted">仅用于帮助选择适合的活动水平。</p></details>
      {pendingPreset && <div role="group" aria-label="切换场景时处理手动锁定" className="flex flex-wrap gap-2 rounded border border-line p-3"><p className="w-full text-sm">切换目标时，是否保留手动数值？</p><button type="button" className="btn-secondary" onClick={() => setPreset(pendingPreset, true)}>保留手动项</button><button type="button" className="btn-secondary" onClick={() => setPreset(pendingPreset, false)}>全部采用场景默认</button></div>}
      <button type="button" className="btn-secondary" onClick={() => {
        const target = controller.result.dailyTarget;
        if (target.kcal <= 0) { setMessage("当前没有有效目标可继承。"); return; }
        editPolicy({ presetId: "custom", rmr: { kind: "not_used" }, tdee: { kind: "not_used" }, energy: { kind: "fixed_kcal", kcal: target.kcal }, protein: { kind: "fixed_grams", grams: target.protein }, fat: { kind: "fixed_grams", grams: target.fat }, carbs: { kind: "residual" } });
      }}>沿用当前目标</button>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {needsWeight && number("计算体重", body.weightKg, n => { setMorningConfirmed(false); editBody({ weightKg: n, weightSource: "manual", weightDates: [body.calculationDate] }); }, "weight")}
        {needsDemographics && <>{number("身高", body.heightCm, n => editBody({ heightCm: n }), "length")}
        {!body.birthDate && number("当前周岁", body.ageYears, n => editBody({ ageYears: n, ageSource: "confirmed_years", birthDate: undefined }))}
        <label className="text-sm">计算所用性别<select className="field mt-1 w-full" value={body.calculationSex ?? ""} onChange={event => editBody({ calculationSex: event.target.value as "male" | "female" || null })}><option value="">请选择（不默认）</option><option value="male">男性</option><option value="female">女性</option></select></label></>}
      </div>
      <div className="space-y-2 text-sm">
        <label className="flex items-start gap-2"><input type="checkbox" checked={morningConfirmed} onChange={event => { setMorningConfirmed(event.target.checked); setPreview(null); }} />确认最近体重记录是晨重，使用截至计算日7天内≥4个日期的均重</label>
        <p className="text-xs text-muted">本次体重来源：{resolvedBody.weightSource === "seven_day_mean" ? `${resolvedBody.weightDates?.length}天均重 ${resolvedBody.weightKg} kg` : "手动填写的体重"}。{logMessage}</p>
        <button className="btn-secondary" type="button" onClick={() => {
          const latest = [...logs].filter(l => l.logDate <= body.calculationDate && l.weightKg != null && l.weightKg > 0).sort((a, b) => b.logDate.localeCompare(a.logDate))[0];
          if (!latest) { setLogMessage("没有可用体测，请手填确认值。"); return; }
          editBody({ weightKg: latest.weightKg, weightSource: "confirmed", weightDates: [latest.logDate] }); setLogMessage(`候选使用 ${latest.logDate} 体重；当前协议未改变。`);
        }}>使用最近一次体重</button>
      </div>
      <label className="block text-sm">每日总消耗来源<select className="field mt-1 w-full" value={t.kind} onChange={event => editPolicy({ tdee: event.target.value === "pal_total" ? { kind: "pal_total", multiplier: null, includesExercise: true } : event.target.value === "manual" ? { kind: "manual", kcal: 0, source: "user_estimate" } : event.target.value === "non_exercise_plus_planned" ? { kind: "non_exercise_plus_planned", multiplier: 1.3, cycleDays: active?.trainingCycle.lengthDays ?? 7, netExercise: [], netConfirmed: false } : { kind: "not_used" } }, false)}><option value="pal_total">总活动系数（已包含通常训练）</option><option value="manual">自行填写总消耗</option><option value="not_used">未使用（固定能量 / 宏量优先）</option></select></label>
      {!usesTdee && <p className="text-xs text-muted">手动目标无需补填身体数据。</p>}
      {usesTdee && t.kind === "pal_total" && <>{number("总活动系数", t.multiplier, n => editPolicy({ tdee: { ...t, multiplier: n } }, false))}<p className="text-xs text-muted">数值越大，代表日常活动越多；已包含通常的运动。</p></>}
      {usesTdee && t.kind === "manual" && <div className="grid gap-3 sm:grid-cols-2">{number("每日总消耗", t.kcal, n => editPolicy({ tdee: { ...t, kcal: n } }, false), "energy")}<label className="text-sm">数据依据<select className="field mt-1 w-full" value={t.source} onChange={ev => editPolicy({ tdee: { ...t, source: ev.target.value as typeof t.source } }, false)}><option value="user_estimate">经验估计</option><option value="observational">稳定摄入与体重观察</option><option value="measured_total">正规总消耗测定</option></select></label></div>}
      <details className="rounded border border-line p-3"><summary className="cursor-pointer">更多计算选项</summary><div className="mt-3 space-y-3">
        <label className="block text-sm">静息消耗来源<select className="field mt-1 w-full" value={r.kind} onChange={ev => editPolicy({ rmr: ev.target.value === "measured" ? { kind: "measured", kcal: 0, measuredOn: "", sourceLabel: "" } : { kind: ev.target.value as "mifflin_st_jeor" | "cunningham_1980" | "not_used" } }, false)}><option value="mifflin_st_jeor">按身高、体重与年龄估算</option><option value="cunningham_1980">按去脂体重估算</option><option value="measured">填写测得的静息消耗</option><option value="not_used">未使用</option></select></label>
        {usesRmr && r.kind === "measured" && <div className="grid gap-3 sm:grid-cols-3">{number("静息消耗测量值", r.kcal, n => editPolicy({ rmr: { ...r, kcal: n } }, false), "energy")}<label>静息消耗测量日期<input className="field mt-1 w-full" type="date" value={r.measuredOn} onChange={ev => editPolicy({ rmr: { ...r, measuredOn: ev.target.value } }, false)} /></label><label>测量方式<input className="field mt-1 w-full" maxLength={200} value={r.sourceLabel} onChange={ev => editPolicy({ rmr: { ...r, sourceLabel: ev.target.value } }, false)} /></label></div>}
        {usesTdee && t.kind === "non_exercise_plus_planned" && <div className="space-y-3">{number("不含训练的活动系数", t.multiplier, n => editPolicy({ tdee: { ...t, multiplier: n } }, false))}{number("完整计划周期天数", t.cycleDays, n => editPolicy({ tdee: { ...t, cycleDays: n } }, false))}
          {t.netExercise.map((event, index) => <div key={event.id} className="flex items-end gap-2">{number(`周期净运动 ${index + 1}`, event.kcal, n => editPolicy({ tdee: { ...t, netExercise: t.netExercise.map(x => x.id === event.id ? { ...x, kcal: n } : x) } }, false), "energy")}<button className="btn-secondary" type="button" onClick={() => editPolicy({ tdee: { ...t, netExercise: t.netExercise.filter(x => x.id !== event.id) } }, false)}>删除事件 {index + 1}</button></div>)}
          <button className="btn-secondary" type="button" onClick={() => editPolicy({ tdee: { ...t, netExercise: [...t.netExercise, { id: crypto.randomUUID(), kcal: 0 }] } }, false)}>添加一个计划净运动事件</button>
          <label className="flex gap-2"><input type="checkbox" checked={t.netConfirmed} onChange={ev => editPolicy({ tdee: { ...t, netConfirmed: ev.target.checked } }, false)} />已核对净消耗口径，事件无重复；空列表表示确认无计划运动</label></div>}
        <label className="block text-sm">能量控制方式<select className="field mt-1 w-full" value={e.kind} onChange={ev => {
          const kind = ev.target.value;
          if (kind === "from_macros") editPolicy({ energy: { kind }, protein: { kind: "fixed_grams", grams: result.candidateTarget?.protein ?? 0 }, fat: { kind: "fixed_grams", grams: result.candidateTarget?.fat ?? 0 }, carbs: { kind: "fixed_grams", grams: result.candidateTarget?.carbs ?? 0 } });
          else editPolicy({ energy: kind === "fixed_kcal" ? { kind, kcal: result.candidateTarget?.kcal ?? null } : kind === "percent" ? { kind, deltaRatio: policy.presetDeltaRatio } : kind === "delta_kcal" ? { kind, deltaKcal: 0 } : { kind: "preset_percent" }, carbs: { kind: "residual" } });
        }}><option value="preset_percent" disabled={policy.presetId === "custom"}>场景已保存的百分比</option><option value="percent">自定义百分比</option><option value="delta_kcal">固定热量差</option><option value="fixed_kcal">固定每日能量（锁定E）</option><option value="from_macros">宏量优先（E派生）</option></select></label>
        {e.kind === "preset_percent" && <p>场景能量偏移 {policy.presetDeltaRatio >= 0 ? "+" : ""}{policy.presetDeltaRatio * 100}%（0有效）。</p>}
        {e.kind === "percent" && number("能量偏移百分比（负为缺口）", e.deltaRatio * 100, n => editPolicy({ energy: { kind: "percent", deltaRatio: n / 100 } }))}
        {e.kind === "delta_kcal" && number("能量差（负为缺口）", e.deltaKcal, n => editPolicy({ energy: { kind: "delta_kcal", deltaKcal: n } }), "energy")}
        {e.kind === "fixed_kcal" && number("手动每日能量", e.kcal, n => editPolicy({ energy: { kind: "fixed_kcal", kcal: n } }), "energy")}
        <label className="block text-sm">蛋白方法<select className="field mt-1 w-full" value={p.kind} onChange={ev => editPolicy({ protein: ev.target.value === "fixed_grams" ? { kind: "fixed_grams", grams: result.candidateTarget?.protein ?? 0 } : ev.target.value === "ffm" ? { kind: "ffm", coefficient: 2.6, contextConfirmed: false } : ev.target.value === "reference_weight" ? { kind: "reference_weight", coefficient: 0, weightKg: 0, sourceLabel: "" } : { kind: "body_weight", coefficient: goalPresets[policy.originPreset ?? (policy.presetId === "custom" ? "maintain" : policy.presetId)].proteinPerKg } })}><option value="body_weight">按体重（自动）</option><option value="ffm">按去脂体重</option><option value="reference_weight">专业确认的参考体重</option><option value="fixed_grams">固定克数</option></select></label>
        {p.kind === "fixed_grams" ? number("手动蛋白 g", p.grams, n => editPolicy({ protein: { ...p, grams: n } })) : number("蛋白系数 g/kg", p.coefficient, n => editPolicy({ protein: { ...p, coefficient: n } }))}
        {p.kind === "ffm" && <label className="flex gap-2"><input type="checkbox" checked={p.contextConfirmed} onChange={ev => editPolicy({ protein: { ...p, contextConfirmed: ev.target.checked } })} />确认较瘦、抗阻训练且限制热量的背景；每公斤去脂体重使用 2.3–3.1 g 蛋白质</label>}
        {p.kind === "reference_weight" && <>{number("专业参考体重", p.weightKg, n => editPolicy({ protein: { ...p, weightKg: n } }), "weight")}<label className="block">参考体重依据<input className="field mt-1 w-full" maxLength={200} value={p.sourceLabel} onChange={ev => editPolicy({ protein: { ...p, sourceLabel: ev.target.value } })} /></label></>}
        <label className="block text-sm">脂肪方法<select className="field mt-1 w-full" value={f.kind} onChange={ev => editPolicy({ fat: ev.target.value === "fixed_grams" ? { kind: "fixed_grams", grams: result.candidateTarget?.fat ?? 0 } : ev.target.value === "energy_share" ? { kind: "energy_share", share: 0.25 } : { kind: "body_weight", coefficient: goalPresets[policy.originPreset ?? (policy.presetId === "custom" ? "maintain" : policy.presetId)].fatPerKg, minimumEnergyShare: 0.2 } })}><option value="body_weight">按体重＋20%供能检查（自动）</option><option value="energy_share">按能量百分比（自动）</option><option value="fixed_grams">固定克数</option></select></label>
        {f.kind === "fixed_grams" ? number("手动脂肪 g", f.grams, n => editPolicy({ fat: { ...f, grams: n } })) : f.kind === "energy_share" ? number("脂肪供能百分比", f.share * 100, n => editPolicy({ fat: { ...f, share: n / 100 } })) : number("脂肪系数 g/kg", f.coefficient, n => editPolicy({ fat: { ...f, coefficient: n } }))}
        {policy.carbs.kind === "fixed_grams" && number("手动碳水 g", policy.carbs.grams, n => editPolicy({ carbs: { kind: "fixed_grams", grams: n } }))}
        {needsFfm && <div className="space-y-3"><label className="block">去脂体重来源<select className="field mt-1 w-full" value={body.ffmInput ?? ""} onChange={ev => editBody({ ffmInput: ev.target.value as "body_fat" | "direct" })}><option value="">请选择</option><option value="body_fat">同日体重＋体脂率</option><option value="direct">直接填写去脂体重</option></select></label>
          {body.ffmInput === "direct" ? <>{number("去脂体重", body.ffmKg, n => editBody({ ffmKg: n }), "weight")}<label className="block">测量日期<input className="field mt-1 w-full" type="date" value={body.ffmMeasuredOn ?? ""} onChange={ev => editBody({ ffmMeasuredOn: ev.target.value })} /></label><label className="block">测量来源<input className="field mt-1 w-full" maxLength={200} value={body.ffmSourceLabel ?? ""} onChange={ev => editBody({ ffmSourceLabel: ev.target.value })} /></label></> : <>{number("体脂率 %", body.bodyFatPct, n => editBody({ bodyFatPct: n }))}{number("体脂测量同日体重", body.bodyFatWeightKg, n => editBody({ bodyFatWeightKg: n }), "weight")}<label className="block">体脂测量日期<input className="field mt-1 w-full" type="date" value={body.bodyFatMeasuredOn ?? ""} onChange={ev => editBody({ bodyFatMeasuredOn: ev.target.value })} /></label><label className="block">体脂测量方式<input className="field mt-1 w-full" maxLength={200} value={body.bodyFatSource ?? ""} onChange={ev => editBody({ bodyFatSource: ev.target.value })} /></label></>}
        </div>}
        <label className="block">出生日期（可选）<input className="field mt-1 w-full" type="date" value={body.birthDate ?? ""} onChange={ev => editBody({ birthDate: ev.target.value || undefined, ageYears: null, ageSource: "birth_date" })} /></label>
      </div></details>
      </>}
      <div className="space-y-2 text-sm">
        <label className="flex gap-2"><input type="checkbox" checked={body.scope.adultAttested} onChange={ev => editBody({ scope: { ...body.scope, adultAttested: ev.target.checked } })} />我已成年，适用一般成人营养计算</label>
        <label className="flex gap-2"><input type="checkbox" checked={body.scope.excluded ?? false} onChange={ev => editBody({ scope: { ...body.scope, excluded: ev.target.checked } })} />处于孕哺期或需要特殊营养治疗</label>
        <label className="flex gap-2"><input type="checkbox" checked={body.scope.unexplainedWeightLoss ?? false} onChange={ev => editBody({ scope: { ...body.scope, unexplainedWeightLoss: ev.target.checked } })} />近期存在不明原因消瘦，需先复核</label>
        <label className="flex gap-2"><input type="checkbox" checked={body.scope.enduranceOrCompetitive ?? false} onChange={ev => editBody({ scope: { ...body.scope, enduranceOrCompetitive: ev.target.checked } })} />高强度长时间耐力或专业竞技训练</label>
        <label className="block">恢复状态<select className="field mt-1 w-full" value={body.recovery ?? "unknown"} onChange={ev => editBody({ recovery: ev.target.value as CalculationBodySnapshot["recovery"] })}><option value="unknown">未知 / 尚未记录</option><option value="stable">自述稳定</option><option value="concern">持续疲劳或恢复变差，先复核</option></select></label>
      </div>
      <NumericDraftNotice />
      <NutritionCalculationDetails result={result} policy={policy} energyUnit={preferences.energyUnit} />
      <label className="block text-sm">新目标生效日期<input className="field mt-1 w-full" type="date" min={todayKey(preferences.timeZone)} value={effectiveFrom} onChange={ev => { setEffectiveFrom(ev.target.value); setPreview(null); }} /></label>
      <button className="btn-secondary" type="button" disabled={result.status !== "valid" || numeric.hasPending || !!pendingPreset} onClick={makePreview}>预览调整</button>
      {preview && <div aria-label="自动目标应用预览" className="space-y-3 rounded border border-line p-3">
        <p>旧目标 {energy(controller.result.dailyTarget.kcal)} → 新目标 {energy(preview.dailyTarget.kcal)}；差额 {energy(preview.dailyTarget.kcal - controller.result.dailyTarget.kcal)}。{effectiveFrom} 生效。</p>
        <ul className="space-y-2 text-sm">{preview.mealSlots.map(slot => { const next = targetForAllocation(preview.dailyTarget, slot.targetAllocation), old = controller.result.mealRecommendations.find(m => m.mealId === slot.id)?.target; return <li key={slot.id}>{slot.name} {slot.schedule.start}—{slot.schedule.end}：蛋白质 {old?.protein.toFixed(1) ?? "—"}→{next.protein.toFixed(1)} / 脂肪 {old?.fat.toFixed(1) ?? "—"}→{next.fat.toFixed(1)} / 碳水 {old?.carbs.toFixed(1) ?? "—"}→{next.carbs.toFixed(1)} g</li>; })}</ul>
        {locked.length > 0 && <div role="alert"><p>以下餐次已固定目标，请先解除固定：{locked.map(m => m.name).join("、")}。</p><button className="btn-secondary mt-2" type="button" onClick={() => { locked.forEach(m => controller.updateMeal(m.id, meal => ({ ...meal, locked: false }))); setPreview(null); }}>解除固定并重新预览</button></div>}
        {!!previewResult?.conflicts.length && <details><summary>食物推荐与锁定冲突（目标不会反改）</summary><ul className="text-sm">{previewResult.conflicts.map(text => <li key={text}>{text}</li>)}</ul></details>}
        <p className="text-xs text-muted">确认后更新目标，保留已有餐食和实际记录。</p>
        {!previewCurrent && <p role="status">计算依据或餐食已改变，请重新生成预览。</p>}
        <button className="btn-primary" type="button" disabled={!ready || !previewCurrent || busy || locked.length > 0 || numeric.hasPending || result.status !== "valid"} onClick={() => void confirm()}>确认目标</button>
      </div>}
    </fieldset>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section></NumericDraftProvider>;
}
