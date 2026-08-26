"use client";

import { CalendarRange, Droplets, Dumbbell, Flame, RefreshCw, Wheat } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useApp } from "@/components/app/AppProvider";
import { useZonedToday } from "@/hooks/useZonedToday";
import { daysBetween, formatDateKey } from "@/lib/dateTime";
import {
  aggregateHeatmap,
  buildHeatmapDays,
  layoutHeatmapTiles,
  rangeForPreset,
  validateHeatmapRange,
  type HeatmapDateRange,
  type HeatmapMetric,
  type HeatmapRangePreset,
  type HeatmapTile,
  type HeatmapTileLayout
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
  "--tile-x": string;
  "--tile-y": string;
  "--tile-width": string;
  "--tile-height": string;
  "--jelly-delay": string;
};

const defaultTreemapSize = { width: 1600, height: 1000 };

function formatValue(value: number, metric: HeatmapMetric, energyUnit: "kcal" | "kj", signed = true) {
  const displayValue = metric === "kcal" ? displayEnergy(value, energyUnit) : value;
  const magnitude = Math.abs(displayValue);
  const digits = magnitude > 0 && magnitude < 10 ? 1 : 0;
  const prefix = !signed || displayValue === 0 ? "" : displayValue > 0 ? "+" : "-";
  return `${prefix}${magnitude.toLocaleString("zh-CN", { maximumFractionDigits: digits })} ${metric === "kcal" ? (energyUnit === "kj" ? "kJ" : "kcal") : "g"}`;
}

function formatShare(share: number) {
  return `${(share * 100).toLocaleString("zh-CN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function useTreemapSize() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(defaultTreemapSize);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) {
        return;
      }
      setSize((current) => Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
        ? current
        : { width, height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { containerRef, size };
}

function JellyTile({
  layout,
  metric,
  energyUnit,
  index,
  selected,
  onSelect,
  canvasWidth,
  canvasHeight
}: {
  layout: HeatmapTileLayout;
  metric: HeatmapMetric;
  energyUnit: "kcal" | "kj";
  index: number;
  selected: boolean;
  onSelect: () => void;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const { tile, x, y, width, height } = layout;
  const labelMode = width >= 124 && height >= 112 ? "is-large" : width >= 74 && height >= 48 ? "is-medium" : "is-small";
  const style: JellyStyle = {
    "--tile-x": `${x / canvasWidth * 100}%`,
    "--tile-y": `${y / canvasHeight * 100}%`,
    "--tile-width": `${width / canvasWidth * 100}%`,
    "--tile-height": `${height / canvasHeight * 100}%`,
    "--jelly-delay": `${Math.min(index * 42, 420)}ms`
  };
  const direction = tile.value >= 0 ? "盈" : "亏";
  const tooltip = `${kindLabels[tile.kind]} · ${tile.label} · ${formatValue(tile.value, metric, energyUnit)} · 绝对贡献 ${formatShare(tile.share)}`;

  return (
    <button
      className={`jelly-tile ${labelMode} ${tile.value >= 0 ? "is-positive" : "is-negative"} ${selected ? "is-selected" : ""}`}
      style={style}
      type="button"
      tabIndex={labelMode === "is-small" ? -1 : 0}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`热力图项目：${tile.label}，${direction}，${formatValue(tile.value, metric, energyUnit)}，绝对贡献占比 ${formatShare(tile.share)}`}
      title={tooltip}
      data-share={tile.share}
    >
      <span className="jelly-sheen" aria-hidden="true" />
      {labelMode !== "is-small" ? (
        <span className="jelly-copy">
          {labelMode === "is-large" ? <span className="jelly-kind">{kindLabels[tile.kind]}</span> : null}
          <strong className="jelly-name">{tile.label}</strong>
          <span className="jelly-value">{formatValue(tile.value, metric, energyUnit)}</span>
        </span>
      ) : null}
      {labelMode === "is-large" ? <span className="jelly-direction">{direction}</span> : null}
    </button>
  );
}

function JellyTreemap({
  tiles,
  metric,
  metricLabel,
  energyUnit,
  selectedTileId,
  onSelect
}: {
  tiles: HeatmapTile[];
  metric: HeatmapMetric;
  metricLabel: string;
  energyUnit: "kcal" | "kj";
  selectedTileId: string | null;
  onSelect: (tileId: string) => void;
}) {
  const { containerRef, size } = useTreemapSize();
  const layouts = useMemo(
    () => layoutHeatmapTiles(tiles, size.width, size.height),
    [size.height, size.width, tiles]
  );

  return (
    <div
      ref={containerRef}
      className="heatmap-treemap"
      role="group"
      aria-label={`${metricLabel}热力图，共 ${tiles.length} 个项目`}
    >
      {layouts.map((layout, index) => (
        <JellyTile
          key={layout.tile.id}
          layout={layout}
          metric={metric}
          energyUnit={energyUnit}
          index={index}
          selected={selectedTileId === layout.tile.id}
          onSelect={() => onSelect(layout.tile.id)}
          canvasWidth={size.width}
          canvasHeight={size.height}
        />
      ))}
    </div>
  );
}

function HeatmapItemIndex({
  tiles,
  metric,
  energyUnit,
  selectedTileId,
  onSelect
}: {
  tiles: HeatmapTile[];
  metric: HeatmapMetric;
  energyUnit: "kcal" | "kj";
  selectedTileId: string | null;
  onSelect: (tileId: string) => void;
}) {
  return (
    <section className="heatmap-item-index" aria-labelledby="heatmap-item-index-title">
      <header className="heatmap-item-index-header">
        <h3 id="heatmap-item-index-title">全部项目</h3>
        <span>{tiles.length}</span>
      </header>
      <ol className="heatmap-item-index-list">
        {tiles.map((tile, index) => {
          const direction = tile.value >= 0 ? "盈" : "亏";
          return (
            <li key={tile.id}>
              <button
                className={`heatmap-index-item ${selectedTileId === tile.id ? "is-selected" : ""}`}
                type="button"
                aria-pressed={selectedTileId === tile.id}
                aria-label={`项目索引：${tile.label}，${direction}，${formatValue(tile.value, metric, energyUnit)}，绝对贡献占比 ${formatShare(tile.share)}`}
                onClick={() => onSelect(tile.id)}
              >
                <span className="heatmap-index-rank">{index + 1}</span>
                <i className={`heatmap-index-dot ${tile.value >= 0 ? "is-positive" : "is-negative"}`} aria-hidden="true" />
                <span className="heatmap-index-name">
                  <strong>{tile.label}</strong>
                  <small>{kindLabels[tile.kind]}</small>
                </span>
                <span className="heatmap-index-value">
                  <strong>{formatValue(tile.value, metric, energyUnit)}</strong>
                  <small>{formatShare(tile.share)}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
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
  const metricLabel = metricOptions.find((option) => option.id === metric)?.label ?? "";
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
          {paletteError ? <span className="text-xs text-danger" role="status">{paletteError}</span> : null}
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

      {rangeError ? <div className="panel p-5 text-sm text-danger" role="alert">{rangeError}</div> : null}
      {error ? <div className="panel p-5 text-sm text-danger" role="alert">{error}</div> : null}

      {!rangeError && !error ? (
        loading ? (
          <div className="heatmap-treemap is-loading" role="status" aria-live="polite" aria-busy="true" aria-label="正在加载热力图">
            <span className="jelly-skeleton" />
          </div>
        ) : dataset.tiles.length === 0 ? (
          <div className="panel flex min-h-56 flex-col items-center justify-center gap-3 p-6 text-center">
            <Flame size={26} className="text-muted-soft" />
            <p className="text-sm font-semibold text-ink">当前范围没有可统计记录</p>
            <Link className="btn-secondary" href={`/today?date=${today}`}>前往今日计划</Link>
          </div>
        ) : (
          <div className="space-y-4">
            <JellyTreemap
              tiles={dataset.tiles}
              metric={metric}
              metricLabel={metricLabel}
              energyUnit={preferences.energyUnit}
              selectedTileId={selectedTileId}
              onSelect={(tileId) => setSelectedTileId((current) => current === tileId ? null : tileId)}
            />
            <HeatmapItemIndex
              tiles={dataset.tiles}
              metric={metric}
              energyUnit={preferences.energyUnit}
              selectedTileId={selectedTileId}
              onSelect={(tileId) => setSelectedTileId((current) => current === tileId ? null : tileId)}
            />
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
            <div className="text-left sm:text-right">
              <strong className="metric-number text-2xl text-ink">{formatValue(selectedTile.value, metric, preferences.energyUnit)}</strong>
              <span className="metric-label mt-1 block">{formatShare(selectedTile.share)} 绝对贡献</span>
            </div>
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
