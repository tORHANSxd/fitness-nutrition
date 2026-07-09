"use client";

import type { User } from "@supabase/supabase-js";
import { Ruler, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Brush, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  bodyMetricFields,
  deleteBodyLog,
  filterLogsByRange,
  loadBodyLogs,
  saveBodyLog,
  type BodyLog,
  type BodyMetricKey
} from "@/lib/bodyLogs";
import { StorageAuthError } from "@/lib/storage";
import { round } from "@/lib/nutrition";

interface BodyLogViewProps {
  user: User | null;
}

type RangeOption = { label: string; value: number | "all" };

const rangeOptions: RangeOption[] = [
  { label: "近7天", value: 7 },
  { label: "近30天", value: 30 },
  { label: "近90天", value: 90 },
  { label: "近1年", value: 365 },
  { label: "全部", value: "all" }
];

const chartGrid = { stroke: "rgba(0,0,0,0.07)", strokeDasharray: "3 3" };
const chartAxis = { fill: "rgba(110,108,102,0.85)", fontSize: 12 };
const chartTooltip = {
  backgroundColor: "#FFFFFF",
  borderColor: "rgba(0,0,0,0.10)",
  borderRadius: 10,
  boxShadow: "0 8px 24px -12px rgba(0,0,0,0.25)",
  color: "#1F1E1D"
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function BodyLogView({ user }: BodyLogViewProps) {
  const [logs, setLogs] = useState<BodyLog[]>([]);
  const [form, setForm] = useState<BodyLog>({ logDate: todayKey() });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  // 折线图显示控制：日期范围 + 显示哪些系列（缩放由图内 Brush 拖选完成）。
  const [range, setRange] = useState<number | "all">(90);
  const [visibleKeys, setVisibleKeys] = useState<Set<BodyMetricKey>>(new Set(["weightKg", "waistCm"]));

  const refresh = useCallback(async () => {
    if (!user) {
      setLogs([]);
      return;
    }
    try {
      setLogs(await loadBodyLogs(user));
    } catch {
      setLogs([]);
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

  const chartLogs = useMemo(() => filterLogsByRange(logs, range, todayKey()), [logs, range]);
  const chartData = useMemo(
    () =>
      chartLogs.map((log) => {
        const point: Record<string, number | string | null> = { date: log.logDate.slice(5) };
        for (const field of bodyMetricFields) {
          point[field.key] = log[field.key] ?? null;
        }
        return point;
      }),
    [chartLogs]
  );
  const activeFields = bodyMetricFields.filter((field) => visibleKeys.has(field.key));

  function toggleKey(key: BodyMetricKey) {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function updateField(key: BodyMetricKey, value: string) {
    setForm((current) => ({ ...current, [key]: value === "" ? null : Number(value) }));
  }

  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      await saveBodyLog(form, user);
      await refresh();
      setMessage(`已保存 ${form.logDate} 的体测记录。`);
    } catch (error) {
      setMessage(error instanceof StorageAuthError ? error.message : "保存失败。");
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
      setMessage(`已删除 ${logDate} 的记录。`);
    } catch (error) {
      setMessage(error instanceof StorageAuthError ? error.message : "删除失败。");
    } finally {
      setBusy(false);
    }
  }

  const recentLogs = useMemo(() => [...logs].sort((a, b) => b.logDate.localeCompare(a.logDate)).slice(0, 14), [logs]);

  return (
    <section className="animate-fade-up grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-4">
        <section className="panel p-4">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent ring-1 ring-accent/30">
              <Ruler size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-ink">体测记录</h2>
              <p className="text-sm text-muted">只填当天量过的项，空白项不记录。</p>
            </div>
          </div>
          <div className="grid gap-3">
            <label>
              <span className="metric-label mb-1 block">记录日期</span>
              <input className="field w-full" type="date" value={form.logDate} onChange={(event) => setForm({ logDate: event.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              {bodyMetricFields.map((field) => (
                <label key={field.key}>
                  <span className="metric-label mb-1 block">
                    {field.label} {field.unit}
                  </span>
                  <input
                    className="field w-full"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    value={form[field.key] ?? ""}
                    onChange={(event) => updateField(field.key, event.target.value)}
                  />
                </label>
              ))}
            </div>
            <button className="btn-primary h-10" type="button" onClick={submit} disabled={busy}>
              <Save size={16} />
              保存记录
            </button>
            {message ? <p className="rounded-lg border border-accent/20 bg-accent/10 px-3 py-2 text-sm text-accent">{message}</p> : null}
          </div>
        </section>

        <section className="panel p-4">
          <h3 className="mb-2 text-sm font-semibold text-ink">最近记录</h3>
          {recentLogs.length === 0 ? (
            <p className="rounded-md border border-dashed border-line bg-surface/50 p-3 text-sm text-muted">还没有体测记录。</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {recentLogs.map((log) => (
                <li key={log.logDate} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <div className="font-medium text-ink">{log.logDate}</div>
                    <div className="truncate text-xs text-muted">
                      {bodyMetricFields
                        .filter((field) => log[field.key] != null)
                        .map((field) => `${field.label} ${round(log[field.key] as number, 1)}${field.unit}`)
                        .join(" · ") || "（空）"}
                    </div>
                  </div>
                  <button className="btn-danger h-8 shrink-0 px-2" type="button" onClick={() => removeLog(log.logDate)} disabled={busy} title="删除">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel p-4">
        <div className="mb-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold tracking-tight text-ink">变化趋势</h3>
            <div className="flex flex-wrap gap-1.5">
              {rangeOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setRange(option.value)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    range === option.value ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-ink"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {/* 显示内容：系列开关 */}
          <div className="flex flex-wrap gap-1.5">
            {bodyMetricFields.map((field) => {
              const active = visibleKeys.has(field.key);
              return (
                <button
                  key={field.key}
                  type="button"
                  onClick={() => toggleKey(field.key)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    active ? "border-accent/50 bg-accent/10 text-ink" : "border-line text-muted hover:text-ink"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active ? field.color : "rgba(0,0,0,0.2)" }} />
                  {field.label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted">拖动图表下方的滑块可以缩放查看任意区间。</p>
        </div>
        <div className="h-[420px]">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-line text-sm text-muted">
              所选范围内没有记录。
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 8, right: 18, top: 8 }}>
                <CartesianGrid {...chartGrid} />
                <XAxis dataKey="date" tick={chartAxis} axisLine={false} tickLine={false} />
                <YAxis tick={chartAxis} axisLine={false} tickLine={false} domain={["auto", "auto"]} width={44} />
                <Tooltip contentStyle={chartTooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {activeFields.map((field) => (
                  <Line
                    key={field.key}
                    type="monotone"
                    dataKey={field.key}
                    name={`${field.label} ${field.unit}`}
                    stroke={field.color}
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                    connectNulls
                  />
                ))}
                <Brush dataKey="date" height={26} travellerWidth={8} stroke="#D97757" fill="rgba(217,119,87,0.06)" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </section>
  );
}
