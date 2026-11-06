"use client";

import { NumericInput } from "@/components/NumericInput";
import type { MacroMethods } from "@/lib/nutritionGoals/types";

const labels = { protein: "蛋白", fat: "脂肪", carbs: "碳水" };

export function MacroMethodFields<K extends keyof MacroMethods>({ nutrient, value, onChange, grams, gramsLabel, fixedOnly = false }: {
  nutrient: K; value: MacroMethods[K]; onChange: (value: MacroMethods[K]) => void; grams: number; gramsLabel?: string; fixedOnly?: boolean;
}) {
  const label = labels[nutrient];
  const edit = (method: MacroMethods[keyof MacroMethods]) => onChange(method as MacroMethods[K]);
  const number = (name: string, amount: number | null, change: (n: number) => void, max?: number) => <label className="block text-sm">{name}<NumericInput className="field mt-1 w-full" label={name} aria-label={name} required min={0} max={max} value={amount} onValueChange={n => { if (n != null) change(n); }} /></label>;
  return <div className="min-w-0 space-y-2">
    <label className="block text-sm">{label}方法<select className="field mt-1 w-full" value={value.kind} disabled={fixedOnly} onChange={event => {
      const kind = event.target.value;
      edit(kind === "fixed_grams" ? { kind, grams } : kind === "residual" ? { kind } : kind === "energy_share" ? { kind, share: .25 } : kind === "reference_weight" ? { kind, weightKg: 0, coefficient: 0, sourceLabel: "" } : { kind: kind as "body_weight" | "ffm", coefficient: null });
    }}>
      <option value="fixed_grams">固定克数</option><option value="body_weight">全体重 × 倍数</option><option value="ffm">去脂体重 × 倍数</option><option value="residual">按剩余热量自动计算</option>
      {nutrient === "protein" && <option value="reference_weight">专业确认的参考体重</option>}
      {nutrient === "fat" && <option value="energy_share">按能量百分比</option>}
    </select></label>
    {value.kind === "fixed_grams" && number(gramsLabel ?? `手动${label} g`, value.grams, n => edit({ ...value, grams: n }))}
    {(value.kind === "body_weight" || value.kind === "ffm" || value.kind === "reference_weight") && number(`${label}系数 g/kg`, value.coefficient, n => edit({ ...value, coefficient: n }))}
    {value.kind === "energy_share" && number("脂肪供能百分比", value.share * 100, n => edit({ ...value, share: n / 100 }), 100)}
    {value.kind === "reference_weight" && <>{number("专业参考体重 kg", value.weightKg, n => edit({ ...value, weightKg: n }))}<label className="block text-sm">参考体重依据<input className="field mt-1 w-full" maxLength={200} value={value.sourceLabel} onChange={event => edit({ ...value, sourceLabel: event.target.value })} /></label></>}
    {value.kind === "residual" && <p className="text-xs text-muted">扣除另外两项后，剩余热量 ÷ {nutrient === "fat" ? 9 : 4}。</p>}
  </div>;
}
