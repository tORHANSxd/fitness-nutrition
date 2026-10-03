"use client";

import type { User } from "@supabase/supabase-js";
import { Ruler, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  bodyMetricFields,
  deleteBodyLog,
  filterLogsByRange,
  loadBodyLogs,
  saveBodyLog,
  type BodyLog,
  type BodyMetricKey,
} from "@/lib/bodyLogs";
import { formatDateKey } from "@/lib/dateTime";
import { useZonedToday } from "@/hooks/useZonedToday";
import {
  canonicalLength,
  canonicalWeight,
  displayLength,
  displayWeight,
  type AppLocale,
  type UnitSystem,
} from "@/lib/preferences";
import { StorageAuthError } from "@/lib/storage";
import { round } from "@/lib/nutrition";
import {
  NumericDraftNotice,
  NumericDraftProvider,
  NumericInput,
  useNumericDraftForm,
} from "@/components/NumericInput";
import { roundForStorage } from "@/lib/numericInput";
import { Dialog } from "@/components/Dialog";

interface BodyLogViewProps {
  mode?: "record" | "trend" | "both";
  user: User | null;
  timeZone: string;
  locale: AppLocale;
  unitSystem: UnitSystem;
}

type RangeOption = { label: string; value: number | "all" };

const rangeOptions: RangeOption[] = [
  { label: "7天", value: 7 },
  { label: "30天", value: 30 },
  { label: "90天", value: 90 },
  { label: "1年", value: 365 },
  { label: "全部", value: "all" },
];

const chartGrid = { stroke: "rgba(0,0,0,0.07)", strokeDasharray: "3 3" };
const chartAxis = { fill: "rgb(var(--color-muted))", fontSize: 12 };
const chartTooltip = {
  backgroundColor: "rgb(var(--color-surface))",
  borderColor: "rgb(var(--color-line))",
  borderRadius: 6,
  boxShadow: "0 8px 24px -12px rgba(0,0,0,0.25)",
  color: "rgb(var(--color-ink))",
};

function displayMetricValue(
  key: BodyMetricKey,
  value: number,
  unitSystem: UnitSystem,
): number {
  if (key === "weightKg") {
    return displayWeight(value, unitSystem);
  }
  if (key.endsWith("Cm")) {
    return displayLength(value, unitSystem);
  }
  return value;
}

function canonicalMetricValue(
  key: BodyMetricKey,
  value: number,
  unitSystem: UnitSystem,
): number {
  if (key === "weightKg") {
    return canonicalWeight(value, unitSystem);
  }
  if (key.endsWith("Cm")) {
    return canonicalLength(value, unitSystem);
  }
  return value;
}

function metricUnit(key: BodyMetricKey, unitSystem: UnitSystem): string {
  if (key === "bodyFatPct") {
    return "%";
  }
  return unitSystem === "imperial"
    ? key === "weightKg"
      ? "lb"
      : "in"
    : key === "weightKg"
      ? "kg"
      : "cm";
}

export function BodyLogView({
  user,
  timeZone,
  locale,
  unitSystem,
  mode = "both",
}: BodyLogViewProps) {
  const numericDraftForm = useNumericDraftForm();
  const today = useZonedToday(timeZone);
  const [logs, setLogs] = useState<BodyLog[]>([]);
  const [form, setForm] = useState<BodyLog>({ logDate: today });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // 折线图显示控制：日期范围 + 显示哪些系列（缩放由图内 Brush 拖选完成）。
  const [range, setRange] = useState<number | "all">(90);
  const [visibleKeys, setVisibleKeys] = useState<Set<BodyMetricKey>>(
    new Set(["weightKg"]),
  );

  useEffect(() => {
    setForm((current) =>
      current.logDate ? current : { ...current, logDate: today },
    );
  }, [today]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    if (!user) {
      setLogs([]);
      setLoading(false);
      return;
    }
    try {
      setLogs(await loadBodyLogs(user));
    } catch {
      setLoadError("身体数据读取失败，请重试。");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 选中日期已有记录时带入表单，方便修正。
  useEffect(() => {
    const existing = logs.find((log) => log.logDate === form.logDate);
    if (existing) {
      setForm(existing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.logDate, logs.length]);

  const chartLogs = useMemo(
    () => filterLogsByRange(logs, range, today),
    [logs, range, today],
  );
  const chartData = useMemo(
    () =>
      chartLogs.map((log) => {
        const point: Record<string, number | string | null> = {
          date: log.logDate,
        };
        for (const field of bodyMetricFields) {
          point[field.key] =
            log[field.key] == null
              ? null
              : round(
                  displayMetricValue(
                    field.key,
                    log[field.key] as number,
                    unitSystem,
                  ),
                  2,
                );
        }
        return point;
      }),
    [chartLogs, unitSystem],
  );
  const activeFields = bodyMetricFields.filter((field) =>
    visibleKeys.has(field.key),
  );
  const hasChartValues = chartData.some((point) =>
    activeFields.some((field) => typeof point[field.key] === "number"),
  );

  function toggleKey(key: BodyMetricKey) {
    setVisibleKeys(new Set([key]));
  }

  function updateField(key: BodyMetricKey, value: number | null | undefined) {
    setForm((current) => ({ ...current, [key]: value ?? null }));
  }

  async function submit() {
    if (!numericDraftForm.validateAll()) {
      setMessage("请先修正标红的数字，再保存体测记录。");
      return;
    }
    const normalizedForm: BodyLog = { ...form };
    let precisionChanged = false;
    for (const field of bodyMetricFields) {
      const value = normalizedForm[field.key];
      if (value != null) {
        const rounded = roundForStorage(value, 2);
        precisionChanged ||= rounded !== value;
        normalizedForm[field.key] = rounded;
      }
    }
    setBusy(true);
    setMessage("");
    try {
      await saveBodyLog(normalizedForm, user);
      await refresh();
      setForm(normalizedForm);
      setMessage(
        `已保存 ${form.logDate} 的体测记录${precisionChanged ? "，数值按 2 位小数记录" : ""}。`,
      );
    } catch (error) {
      setMessage(
        error instanceof StorageAuthError ? error.message : "保存失败。",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeLog(logDate: string) {
    setBusy(true);
    setMessage("");
    try {
      await deleteBodyLog(logDate, user);
      await refresh();
      setPendingDelete(null);
      setMessage(`已删除 ${logDate} 的记录。`);
    } catch (error) {
      setMessage(
        error instanceof StorageAuthError ? error.message : "删除失败。",
      );
    } finally {
      setBusy(false);
    }
  }

  const recentLogs = useMemo(
    () =>
      [...logs].sort((a, b) => b.logDate.localeCompare(a.logDate)).slice(0, 14),
    [logs],
  );

  return (
    <NumericDraftProvider form={numericDraftForm}>
      <section
        className={
          mode === "both"
            ? "grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]"
            : "space-y-4"
        }
      >
        {loadError && (
          <div
            role="alert"
            className="panel flex items-center justify-between gap-3 p-4 text-sm text-danger xl:col-span-full"
          >
            <span>{loadError}</span>
            <button
              className="btn-text"
              type="button"
              onClick={() => void refresh()}
            >
              重试
            </button>
          </div>
        )}
        {mode !== "trend" && (
          <div className="space-y-4">
            <section className="panel p-4">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent-text ring-1 ring-accent/30">
                  <Ruler size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-ink">体测记录</h2>
                  <p className="text-sm text-muted">
                    只填当天量过的项，空白项不记录。
                  </p>
                </div>
              </div>
              <div className="grid gap-3">
                <label>
                  <span className="metric-label mb-1 block">记录日期</span>
                  <input
                    className="field w-full"
                    type="date"
                    value={form.logDate}
                    onChange={(event) =>
                      setForm({ logDate: event.target.value })
                    }
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {bodyMetricFields.map((field) => (
                    <label key={field.key}>
                      <span className="metric-label mb-1 block">
                        {field.label} {metricUnit(field.key, unitSystem)}
                      </span>
                      <NumericInput
                        blankValue={null}
                        className="field w-full"
                        formatKey={unitSystem}
                        formatValue={(value) =>
                          round(
                            displayMetricValue(field.key, value, unitSystem),
                            2,
                          )
                        }
                        label={field.label}
                        min={field.key === "bodyFatPct" ? 3 : 0}
                        max={field.key === "bodyFatPct" ? 60 : undefined}
                        toValue={(value) =>
                          canonicalMetricValue(field.key, value, unitSystem)
                        }
                        value={form[field.key]}
                        onValueChange={(value) => updateField(field.key, value)}
                      />
                    </label>
                  ))}
                </div>
                <NumericDraftNotice />
                <button
                  className="btn-primary h-11"
                  type="button"
                  onClick={submit}
                  disabled={busy || loading || Boolean(loadError)}
                >
                  <Save size={16} />
                  保存记录
                </button>
                {message ? (
                  <p
                    className="rounded border border-accent/20 bg-accent/10 px-3 py-2 text-sm text-accent2"
                    role="status"
                    aria-live="polite"
                  >
                    {message}
                  </p>
                ) : null}
              </div>
            </section>

            <section className="panel p-4">
              <h3 className="mb-2 text-sm font-semibold text-ink">最近记录</h3>
              {recentLogs.length === 0 ? (
                <p className="rounded-md border border-dashed border-line bg-surface/50 p-3 text-sm text-muted">
                  {loading
                    ? "正在读取记录…"
                    : loadError
                      ? "暂时无法读取记录。"
                      : "还没有体测记录。"}
                </p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {recentLogs.map((log) => (
                    <li
                      key={log.logDate}
                      className="flex items-center justify-between gap-2 py-2"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-ink">
                          {formatDateKey(log.logDate, locale, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                        <div className="truncate text-xs text-muted">
                          {bodyMetricFields
                            .filter((field) => log[field.key] != null)
                            .map(
                              (field) =>
                                `${field.label} ${round(displayMetricValue(field.key, log[field.key] as number, unitSystem), 1)}${metricUnit(field.key, unitSystem)}`,
                            )
                            .join(" · ") || "（空）"}
                        </div>
                      </div>
                      <button
                        className="icon-button shrink-0 text-muted"
                        type="button"
                        onClick={() => setPendingDelete(log.logDate)}
                        disabled={busy || loading}
                        aria-label={`删除 ${log.logDate} 的体测记录`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {mode !== "record" && (
          <section className="panel p-4">
            <div className="mb-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-ink">变化趋势</h3>
                <div className="flex flex-wrap gap-1.5">
                  {rangeOptions.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setRange(option.value)}
                      className={`min-h-10 rounded-full border px-3 py-2 text-xs transition-colors ${
                        range === option.value
                          ? "border-accent bg-accent/15 text-accent-text"
                          : "border-line text-muted hover:text-ink"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="mt-1 flex items-center gap-3 text-sm text-muted">
                查看指标
                <select
                  className="field flex-1 sm:max-w-56"
                  aria-label="趋势指标"
                  value={activeFields[0]?.key ?? "weightKg"}
                  onChange={(event) =>
                    toggleKey(event.target.value as BodyMetricKey)
                  }
                >
                  {bodyMetricFields.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}（{metricUnit(field.key, unitSystem)}）
                    </option>
                  ))}
                </select>
              </label>
              {hasChartValues && (
                <p className="text-xs text-muted">
                  拖动下方滑块，可缩小查看范围。
                </p>
              )}
            </div>
            <div className="h-[280px] sm:h-[360px]">
              {!hasChartValues ? (
                <div className="flex h-full items-center justify-center rounded-md border border-dashed border-line text-sm text-muted">
                  {loading
                    ? "正在读取记录…"
                    : loadError
                      ? "暂时无法读取趋势。"
                      : chartData.length
                        ? "所选指标还没有记录。"
                        : "所选范围内没有记录。"}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ left: 8, right: 18, top: 8 }}
                  >
                    <CartesianGrid {...chartGrid} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(value) =>
                        String(value).slice(2).replaceAll("-", "/")
                      }
                      tick={chartAxis}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(value) =>
                        new Intl.NumberFormat(locale, {
                          maximumFractionDigits: 2,
                          notation:
                            Math.abs(value) >= 10000 ? "compact" : "standard",
                        }).format(value)
                      }
                      tick={chartAxis}
                      axisLine={false}
                      tickLine={false}
                      domain={["auto", "auto"]}
                      width={44}
                    />
                    <Tooltip contentStyle={chartTooltip} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {activeFields.map((field) => (
                    <Line
                      key={field.key}
                      isAnimationActive={false}
                      type="monotone"
                        dataKey={field.key}
                        name={`${field.label} ${metricUnit(field.key, unitSystem)}`}
                        stroke={field.color}
                        strokeWidth={2}
                        dot={{ r: 2.5 }}
                        connectNulls
                      />
                    ))}
                    <Brush
                      dataKey="date"
                      height={26}
                      travellerWidth={8}
                      stroke="rgb(var(--color-accent-2))"
                      fill="rgb(var(--color-panel))"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            {chartData.length > 0 ? (
              <details className="mt-4 min-w-0">
                <summary className="cursor-pointer py-2 text-sm text-muted">
                  查看数据明细
                </summary>
                <table className="w-full table-fixed border-collapse text-left text-[10px] sm:text-xs">
                  <caption className="sr-only">当前趋势数据表</caption>
                  <thead>
                    <tr className="border-b border-line text-muted">
                      <th className="break-words px-1 py-2 sm:px-2">日期</th>
                      {activeFields.map((field) => (
                        <th
                          key={field.key}
                          className="break-words px-1 py-2 leading-tight sm:px-2"
                        >
                          {field.label} ({metricUnit(field.key, unitSystem)})
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.slice(-14).map((point) => (
                      <tr
                        key={String(point.date)}
                        className="border-b border-line/70"
                      >
                        <td className="break-words px-1 py-2 text-muted sm:px-2">
                          {point.date}
                        </td>
                        {activeFields.map((field) => (
                          <td
                            key={field.key}
                            className="break-words px-1 py-2 font-medium tabular-nums text-ink sm:px-2"
                          >
                            {point[field.key] ?? "--"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ) : null}
          </section>
        )}
      </section>
      <Dialog
        open={pendingDelete !== null}
        title="删除体测记录"
        onClose={() => {
          if (!busy) setPendingDelete(null);
        }}
      >
        <p className="mb-5 text-sm">将删除 {pendingDelete} 的身体数据。</p>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            type="button"
            disabled={busy}
            onClick={() => setPendingDelete(null)}
          >
            取消
          </button>
          <button
            className="btn-danger"
            type="button"
            disabled={busy}
            onClick={() => {
              if (pendingDelete) void removeLog(pendingDelete);
            }}
          >
            {busy ? "删除中…" : "确认删除"}
          </button>
        </div>
      </Dialog>
    </NumericDraftProvider>
  );
}
