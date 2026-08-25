"use client";

import { CalendarRange, Droplets, Dumbbell, Flame, RefreshCw, Wheat } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useApp } from "@/components/app/AppProvider";
import { useZonedToday } from "@/hooks/useZonedToday";
import { daysBetween, formatDateKey } from "@/lib/dateTime";
import {
  aggregateHeatmap,
  buildHeatmapDays,
  rangeForPreset,
  validateHeatmapRange,
  type HeatmapDateRange,
  type HeatmapMetric,
  type HeatmapRangePreset,
  type HeatmapTile
} from "@/lib/heatmap";
import { displayEnergy } from "@/lib/preferences";
import {
  loadDailyCheckins,
  loadHeatmapPalette,
  loadPlansInRange,
  saveHeatmapPalette
} from "@/lib/storage";
import type { DailyCheckin, HeatmapPalette, SavedPlan } from "@/lib/types";

const metricOptions = [
  { id: "kcal", label: "热量", icon: Flame },
  { id: "protein", label: "蛋白质", icon: Dumbbell },
  { id: "carbs", label: "碳水", icon: Wheat },
  { id: "fat", label: "脂肪", icon: Droplets }
] as const;

const rangeOptions: { id: HeatmapRangePreset; label: string }[] = [
  { id: "day", label: "本日" },
  { id: "week", label: "本周至今" },
  { id: "month", label: "本月至今" },
  { id: "year", label: "本年至今" },
  { id: "custom", label: "自定义" }
];

const kindLabels = {
  food: "食物",
  exercise: "运动",
  basal: "基础代谢",
  activity: "日常活动",
  target: "目标"
} as const;

type JellyStyle = CSSProperties & {
  "--jelly-strength": number;
  "--jelly-delay": string;
};

function formatValue(value: number, metric: HeatmapMetric, energyUnit: "kcal" | "kj", signed = true) {
  const displayValue = metric === "kcal" ? displayEnergy(value, energyUnit) : value;
  const magnitude = Math.abs(displayValue);
  const digits = magnitude > 0 && magnitude < 10 ? 1 : 0;
  const prefix = !signed || displayValue === 0 ? "" : displayValue > 0 ? "+" : "-";
  return `${prefix}${magnitude.toLocaleString("zh-CN", { maximumFractionDigits: digits })} ${metric === "kcal" ? (energyUnit === "kj" ? "kJ" : "kcal") : "g"}`;
}

function JellyTile({
  tile,
  metric,
  energyUnit,
  maxMagnitude,
  index,
  selected,
  onSelect
}: {
  tile: HeatmapTile;
  metric: HeatmapMetric;
  energyUnit: "kcal" | "kj";
  maxMagnitude: number;
  index: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const strength = maxMagnitude > 0 ? Math.sqrt(Math.abs(tile.value) / maxMagnitude) : 0;
  const style: JellyStyle = {
    "--jelly-strength": strength,
    "--jelly-delay": `${Math.min(index * 42, 420)}ms`
  };
  const direction = tile.value >= 0 ? "盈" : "亏";

  return (
    <button
      className={`jelly-tile ${tile.value >= 0 ? "is-positive" : "is-negative"} ${selected ? "is-selected" : ""}`}
      style={style}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${tile.label}，${direction}，${formatValue(tile.value, metric, energyUnit)}`}
    >
      <span className="jelly-sheen" aria-hidden="true" />
      <span className="jelly-kind">{kindLabels[tile.kind]}</span>
      <strong className="jelly-name">{tile.label}</strong>
      <span className="jelly-value">{formatValue(tile.value, metric, energyUnit)}</span>
      <span className="jelly-direction">{direction}</span>
    </button>
  );
}

export function HeatmapView() {
  const { foods, preferences, user } = useApp();
  const today = useZonedToday(preferences.timeZone);
  const [metric, setMetric] = useState<HeatmapMetric>("kcal");
  const [preset, setPreset] = useState<HeatmapRangePreset>("day");
  const [customRange, setCustomRange] = useState<HeatmapDateRange>(() => rangeForPreset("day", today, preferences.weekStartsOn));
  const [includeIncomplete, setIncludeIncomplete] = useState(false);
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [checkins, setCheckins] = useState<DailyCheckin[]>([]);
  const [palette, setPalette] = useState<HeatmapPalette>("red-positive");
  const [paletteSaving, setPaletteSaving] = useState(false);
  const [paletteError, setPaletteError] = useState("");
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);

  const range = preset === "custom" ? customRange : rangeForPreset(preset, today, preferences.weekStartsOn);

  useEffect(() => {
    let cancelled = false;
    loadHeatmapPalette(user)
      .then((savedPalette) => {
        if (!cancelled) {
          setPalette(savedPalette);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  const rangeError = validateHeatmapRange(range) ?? (range.to > today ? "结束日期不能晚于今天。" : null);

  useEffect(() => {
    if (rangeError) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      loadPlansInRange(user, range.from, range.to),
      loadDailyCheckins(user, range.from, range.to)
    ])
      .then(([nextPlans, nextCheckins]) => {
        if (!cancelled) {
          setPlans(nextPlans);
          setCheckins(nextCheckins);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setPlans([]);
          setCheckins([]);
          setError(loadError instanceof Error ? loadError.message : "热力图数据加载失败。");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, rangeError, reloadNonce, user]);

  const days = useMemo(
    () => buildHeatmapDays({ plans, checkins, foods, today, includeIncomplete }),
    [checkins, foods, includeIncomplete, plans, today]
  );
  const datasets = useMemo(
    () => Object.fromEntries(metricOptions.map((option) => [option.id, aggregateHeatmap(days, option.id)])) as Record<HeatmapMetric, ReturnType<typeof aggregateHeatmap>>,
    [days]
  );
  const dataset = datasets[metric];
  const selectedTile = dataset.tiles.find((tile) => tile.id === selectedTileId) ?? null;
  const totalDays = rangeError ? 0 : daysBetween(range.from, range.to) + 1;
  const completeDays = checkins.filter(
    (checkin) => checkin.completed && checkin.planDate >= range.from && checkin.planDate <= range.to
  ).length;
  const recordedDays = new Set([...plans.map((plan) => plan.planDate), ...checkins.map((checkin) => checkin.planDate)]).size;

  function choosePreset(nextPreset: HeatmapRangePreset) {
    if (nextPreset === "custom" && preset !== "custom") {
      setCustomRange(range);
    }
    setPreset(nextPreset);
    setSelectedTileId(null);
  }

  function updateCustomRange(key: keyof HeatmapDateRange, value: string) {
    setPreset("custom");
    setSelectedTileId(null);
    setCustomRange((current) => ({ ...current, [key]: value }));
  }

  async function togglePalette() {
    const previous = palette;
    const next: HeatmapPalette = palette === "red-positive" ? "green-positive" : "red-positive";
    setPalette(next);
    setPaletteSaving(true);
    setPaletteError("");
    try {
      await saveHeatmapPalette(next, user);
    } catch (saveError) {
      setPalette(previous);
      setPaletteError(saveError instanceof Error ? saveError.message : "颜色偏好保存失败。");
    } finally {
      setPaletteSaving(false);
    }
  }

  return (
    <section className="heatmap-workspace animate-view space-y-5" data-palette={palette}>
      <div className="flex flex-col gap-4 border-b border-line pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="eyebrow">ENERGY LEDGER</p>
          <h2 className="mt-1 text-2xl text-ink">热量与营养素收支</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="palette-switch-wrap" aria-label="热力图颜色映射">
            <span className={palette === "red-positive" ? "is-active" : ""}>红盈</span>
            <button
              className="palette-switch"
              type="button"
              role="switch"
              aria-checked={palette === "green-positive"}
              aria-label={palette === "red-positive" ? "当前红盈绿亏，切换为红亏绿盈" : "当前红亏绿盈，切换为红盈绿亏"}
              onClick={togglePalette}
              disabled={paletteSaving}
            >
              <span aria-hidden="true" />
            </button>
            <span className={palette === "green-positive" ? "is-active" : ""}>红亏</span>
          </div>
          <button className="icon-button" type="button" onClick={() => setReloadNonce((value) => value + 1)} aria-label="刷新热力图" title="刷新" disabled={loading}>
            <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
          </button>
          {paletteError ? <span className="text-xs text-rose" role="status">{paletteError}</span> : null}
        </div>
      </div>

      <div className="heatmap-range-band">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <CalendarRange size={17} className="text-accent2" />
          时间范围
        </div>
        <div className="heatmap-range-options" aria-label="时间范围">
          {rangeOptions.map((option) => (
            <button
              key={option.id}
              className={`segmented-option ${preset === option.id ? "is-active" : ""}`}
              type="button"
              aria-pressed={preset === option.id}
              onClick={() => choosePreset(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {preset === "custom" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-muted">
              开始日期
              <input className="field" type="date" value={range.from} max={today} onChange={(event) => updateCustomRange("from", event.target.value)} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted">
              结束日期
              <input className="field" type="date" value={range.to} max={today} onChange={(event) => updateCustomRange("to", event.target.value)} />
            </label>
          </div>
        ) : null}
        <label className="heatmap-check-control">
          <input type="checkbox" checked={includeIncomplete} onChange={(event) => setIncludeIncomplete(event.target.checked)} />
          包含未完成日期
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricOptions.map((option) => {
          const Icon = option.icon;
          const value = datasets[option.id].net;
          return (
            <button
              key={option.id}
              className={`heatmap-metric-card ${metric === option.id ? "is-active" : ""}`}
              type="button"
              aria-pressed={metric === option.id}
              onClick={() => {
                setMetric(option.id);
                setSelectedTileId(null);
              }}
            >
              <span className="flex items-center gap-2 metric-label"><Icon size={15} />{option.label}</span>
              <strong className="metric-number mt-2 block text-2xl text-ink">{formatValue(value, option.id, preferences.energyUnit)}</strong>
              <span className={`heatmap-sign mt-1 block text-xs font-semibold ${value >= 0 ? "is-positive" : "is-negative"}`}>{value >= 0 ? "盈" : "亏"}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 border-y border-line py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="metric-label">数据覆盖</p>
          <p className="mt-1 text-sm font-semibold text-ink">{completeDays}/{totalDays} 天完成 · {recordedDays} 天有记录</p>
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold text-muted">
          <span className="flex items-center gap-1.5"><i className="heatmap-legend-dot is-positive" />正值 · 盈</span>
          <span className="flex items-center gap-1.5"><i className="heatmap-legend-dot is-negative" />负值 · 亏</span>
        </div>
      </div>

      {rangeError ? <div className="panel p-5 text-sm text-rose" role="alert">{rangeError}</div> : null}
      {error ? <div className="panel p-5 text-sm text-rose" role="alert">{error}</div> : null}

      {!rangeError && !error ? (
        loading ? (
          <div className="heatmap-grid" role="status" aria-live="polite" aria-busy="true" aria-label="正在加载热力图">
            {Array.from({ length: 8 }, (_, index) => <span key={index} className="jelly-skeleton" />)}
          </div>
        ) : dataset.tiles.length === 0 ? (
          <div className="panel flex min-h-56 flex-col items-center justify-center gap-3 p-6 text-center">
            <Flame size={26} className="text-muted-soft" />
            <p className="text-sm font-semibold text-ink">当前范围没有可统计记录</p>
            <Link className="btn-secondary" href={`/today?date=${today}`}>前往今日计划</Link>
          </div>
        ) : (
          <div className="heatmap-grid" data-palette={palette} aria-label={`${metricOptions.find((option) => option.id === metric)?.label}热力图`}>
            {dataset.tiles.map((tile, index) => (
              <JellyTile
                key={tile.id}
                tile={tile}
                metric={metric}
                energyUnit={preferences.energyUnit}
                maxMagnitude={dataset.maxMagnitude}
                index={index}
                selected={selectedTileId === tile.id}
                onSelect={() => setSelectedTileId((current) => current === tile.id ? null : tile.id)}
              />
            ))}
          </div>
        )
      ) : null}

      {selectedTile ? (
        <section className="heatmap-detail" aria-live="polite">
          <header className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="metric-label">{kindLabels[selectedTile.kind]}</p>
              <h3 className="mt-1 text-xl text-ink">{selectedTile.label}</h3>
            </div>
            <strong className="metric-number text-2xl text-ink">{formatValue(selectedTile.value, metric, preferences.energyUnit)}</strong>
          </header>
          <div className="divide-y divide-line">
            {selectedTile.details.map((detail) => (
              <div key={detail.date} className="flex min-h-11 items-center justify-between gap-4 py-2 text-sm">
                <span className="text-muted">{formatDateKey(detail.date, preferences.locale, { year: "numeric", month: "short", day: "numeric" })}</span>
                <span className="font-mono font-semibold tabular-nums text-ink">{formatValue(detail.value, metric, preferences.energyUnit)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
