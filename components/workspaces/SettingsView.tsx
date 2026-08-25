"use client";

import { Save } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useApp } from "@/components/app/AppProvider";
import { formatDateKey, formatInstant, todayKey } from "@/lib/dateTime";
import { displayEnergy, displayLength, displayWeight, type AppPreferences } from "@/lib/preferences";

const commonTimeZones = [
  "Asia/Shanghai",
  "Asia/Tokyo",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/Berlin",
  "Pacific/Kiritimati",
  "Pacific/Pago_Pago",
  "UTC"
];

export function SettingsView() {
  const { preferences, syncState, updatePreferences, user } = useApp();
  const [draft, setDraft] = useState<AppPreferences>(preferences);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(preferences), [preferences]);

  function update<K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const saved = await updatePreferences(draft);
    setMessage(saved ? "偏好已保存到云端。" : "保存失败；如果尚未执行 migration，请先更新 Supabase。" );
    setSaving(false);
  }

  const previewDate = todayKey(draft.timeZone);
  const energy = displayEnergy(2300, draft.energyUnit);

  return (
    <form className="settings-layout grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]" onSubmit={save}>
      <div className="space-y-6">
        <section className="settings-section" aria-labelledby="region-settings-title">
          <div>
            <p className="eyebrow">REGION</p>
            <h2 id="region-settings-title" className="mt-1 text-xl text-ink">地区与单位</h2>
          </div>
          <div className="settings-grid">
            <label>
              <span className="metric-label mb-1 block">语言</span>
              <select className="field w-full" value={draft.locale} onChange={(event) => update("locale", event.target.value as AppPreferences["locale"])}>
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              <span className="metric-label mb-1 block">时区模式</span>
              <select className="field w-full" value={draft.timeZoneMode} onChange={(event) => update("timeZoneMode", event.target.value as AppPreferences["timeZoneMode"])}>
                <option value="auto">自动跟随设备</option>
                <option value="fixed">固定时区</option>
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="metric-label mb-1 block">IANA 时区</span>
              <input
                className="field w-full"
                list="time-zone-options"
                value={draft.timeZone}
                onChange={(event) => update("timeZone", event.target.value)}
                disabled={draft.timeZoneMode === "auto"}
              />
              <datalist id="time-zone-options">{commonTimeZones.map((zone) => <option key={zone} value={zone} />)}</datalist>
            </label>
            <label>
              <span className="metric-label mb-1 block">一周起始日</span>
              <select className="field w-full" value={draft.weekStartsOn} onChange={(event) => update("weekStartsOn", Number(event.target.value))}>
                <option value={1}>周一</option>
                <option value={0}>周日</option>
                <option value={6}>周六</option>
              </select>
            </label>
            <label>
              <span className="metric-label mb-1 block">时间格式</span>
              <select className="field w-full" value={draft.hourCycle} onChange={(event) => update("hourCycle", event.target.value as AppPreferences["hourCycle"])}>
                <option value="h23">24 小时</option>
                <option value="h12">12 小时</option>
              </select>
            </label>
            <label>
              <span className="metric-label mb-1 block">身体单位</span>
              <select className="field w-full" value={draft.unitSystem} onChange={(event) => update("unitSystem", event.target.value as AppPreferences["unitSystem"])}>
                <option value="metric">公制（kg / cm）</option>
                <option value="imperial">英制（lb / in）</option>
              </select>
            </label>
            <label>
              <span className="metric-label mb-1 block">能量单位</span>
              <select className="field w-full" value={draft.energyUnit} onChange={(event) => update("energyUnit", event.target.value as AppPreferences["energyUnit"])}>
                <option value="kcal">kcal</option>
                <option value="kj">kJ</option>
              </select>
            </label>
          </div>
        </section>

        <section className="settings-section" aria-labelledby="appearance-settings-title">
          <div>
            <p className="eyebrow">APPEARANCE</p>
            <h2 id="appearance-settings-title" className="mt-1 text-xl text-ink">外观与无障碍</h2>
          </div>
          <div className="settings-grid">
            <label>
              <span className="metric-label mb-1 block">主题</span>
              <select className="field w-full" value={draft.theme} onChange={(event) => update("theme", event.target.value as AppPreferences["theme"])}>
                <option value="system">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </label>
            <label>
              <span className="metric-label mb-1 block">动态效果</span>
              <select
                className="field w-full"
                value={draft.reduceMotion == null ? "system" : draft.reduceMotion ? "reduce" : "full"}
                onChange={(event) => update("reduceMotion", event.target.value === "system" ? null : event.target.value === "reduce")}
              >
                <option value="system">跟随系统</option>
                <option value="reduce">减少动态效果</option>
                <option value="full">完整动态效果</option>
              </select>
            </label>
          </div>
        </section>

        <section className="settings-section" aria-labelledby="account-settings-title">
          <div>
            <p className="eyebrow">ACCOUNT</p>
            <h2 id="account-settings-title" className="mt-1 text-xl text-ink">账户与同步</h2>
          </div>
          <p className="text-sm text-muted">{user.email}</p>
          {syncState === "schema-required" ? (
            <p className="rounded border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber" role="alert">
              当前 Supabase 尚缺少全局偏好列。请执行仓库中的 migration 后再保存这些设置。
            </p>
          ) : null}
        </section>

        <div className="sticky bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-10 flex items-center justify-between gap-3 border border-line bg-surface/95 p-3 shadow-soft backdrop-blur lg:bottom-4">
          <p className="text-sm text-muted" role="status" aria-live="polite">{message || "显示单位只影响界面，数据库仍存 kg、cm 与 kcal。"}</p>
          <button className="btn-primary shrink-0" type="submit" disabled={saving}>
            <Save size={17} />{saving ? "保存中" : "保存偏好"}
          </button>
        </div>
      </div>

      <aside className="settings-preview xl:sticky xl:top-8 xl:self-start" aria-label="格式预览">
        <p className="metric-label">格式预览</p>
        <p className="mt-3 text-lg font-semibold text-ink">{formatDateKey(previewDate, draft.locale, { dateStyle: "full" })}</p>
        <dl className="mt-5 grid gap-3 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted">时间</dt><dd className="font-semibold text-ink">{formatInstant("2026-08-25T08:30:00Z", draft.locale, draft.timeZone, { hour: "numeric", minute: "2-digit", hourCycle: draft.hourCycle })}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">体重</dt><dd className="font-semibold text-ink">{displayWeight(93.2, draft.unitSystem).toFixed(1)} {draft.unitSystem === "imperial" ? "lb" : "kg"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">身高</dt><dd className="font-semibold text-ink">{displayLength(174, draft.unitSystem).toFixed(1)} {draft.unitSystem === "imperial" ? "in" : "cm"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted">目标能量</dt><dd className="font-semibold text-ink">{Math.round(energy).toLocaleString(draft.locale)} {draft.energyUnit === "kj" ? "kJ" : "kcal"}</dd></div>
        </dl>
      </aside>
    </form>
  );
}
