"use client";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Copy, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useZonedToday } from "@/hooks/useZonedToday";
import { addDays, formatDateKey } from "@/lib/dateTime";
import {
  canonicalWeight,
  displayWeight,
  type AppLocale,
  type UnitSystem,
} from "@/lib/preferences";
import {
  muscleGroupLabels,
  muscleGroupOrder,
  sessionTonnage,
} from "@/lib/training";
import {
  deleteWorkoutSession,
  loadWorkoutSessions,
  saveWorkoutSession,
} from "@/lib/trainingStorage";
import type { WorkoutSession, WorkoutSet } from "@/lib/types";
import {
  NumericDraftNotice,
  NumericDraftProvider,
  NumericInput,
  useNumericDraftForm,
} from "@/components/NumericInput";
import { Dialog } from "@/components/Dialog";

interface TrainingLogProps {
  user: User | null;
  onRequireLogin: () => void;
  dateRequest?: { date: string; nonce: number } | null;
  timeZone: string;
  locale: AppLocale;
  weekStartsOn: number;
  unitSystem: UnitSystem;
  historyOnly?: boolean;
}
function blankSession(date: string): WorkoutSession {
  return {
    status: "recorded",
    id: "",
    sessionDate: date,
    splitLabel: "",
    bodyweightKg: null,
    recovery: null,
    note: "",
    sets: [],
    createdAt: "",
  };
}
function newSet(partial?: Partial<WorkoutSet>): WorkoutSet {
  return {
    id: crypto.randomUUID(),
    exercise: partial?.exercise ?? "",
    muscleGroup: partial?.muscleGroup ?? "chest",
    weightKg: partial?.weightKg ?? null,
    reps: partial?.reps ?? null,
    rir: partial?.rir ?? null,
    isWarmup: partial?.isWarmup ?? false,
    completed: false,
    loadType: partial?.loadType ?? "external",
    durationSeconds: partial?.durationSeconds,
  };
}
export function TrainingLog({
  user,
  onRequireLogin,
  dateRequest,
  timeZone,
  locale,
  unitSystem,
  historyOnly = false,
}: TrainingLogProps) {
  const today = useZonedToday(timeZone);
  const numeric = useNumericDraftForm();
  const [date, setDate] = useState(dateRequest?.date ?? today);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [draft, setDraft] = useState<WorkoutSession>(() => blankSession(date));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [removed, setRemoved] = useState<WorkoutSet | null>(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  useEffect(() => {
    if (dateRequest) {
      if (dirtyRef.current) setPendingDate(dateRequest.date);
      else setDate(dateRequest.date);
    }
  }, [dateRequest]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    let live = true;
    setLoaded(false);
    setMessage("");
    loadWorkoutSessions(user, addDays(date, -365), date > today ? date : today)
      .then((rows) => {
        if (live) {
          setSessions(rows);
          if (!dirtyRef.current) {
            setDraft(
              structuredClone(
                rows.find((s) => s.sessionDate === date) ?? blankSession(date),
              ),
            );
            setDirty(false);
          }
          setLoaded(true);
          setRemoved(null);
        }
      })
      .catch(() => {
        if (live) setMessage("训练记录读取失败，请刷新后重试。");
      });
    return () => {
      live = false;
    };
  }, [date, today, user]);
  const change = (next: WorkoutSession) => {
    setDraft(next);
    setDirty(true);
    dirtyRef.current = true;
  };
  const updateSet = (id: string, patch: Partial<WorkoutSet>) =>
    change({
      ...draft,
      sets: draft.sets.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  async function save() {
    if (!user) {
      onRequireLogin();
      return;
    }
    if (!loaded || !numeric.validateAll() || date > today) return;
    if (draft.sets.some((s) => !s.exercise.trim())) {
      setMessage("请填写每组动作名称。");
      return;
    }
    if (!draft.sets.length) {
      setMessage("请先添加训练组。");
      return;
    }
    if (
      draft.sets.some(
        (s) =>
          s.completed &&
          (s.loadType === "timed"
            ? !(s.durationSeconds && s.durationSeconds > 0)
            : !(s.reps && s.reps > 0) ||
              ((s.loadType ?? "external") !== "bodyweight" &&
                s.weightKg == null)),
      )
    ) {
      setMessage("请补全已完成组的次数与重量，计时动作需填写时长。");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const saved = await saveWorkoutSession(
        { ...draft, status: "recorded", sessionDate: date },
        user,
      );
      setDraft(saved);
      setSessions((rows) => [
        saved,
        ...rows.filter((s) => s.sessionDate !== date),
      ]);
      setMessage("训练记录已保存。");
      setDirty(false);
      dirtyRef.current = false;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  }
  function selectDate(next: string) {
    if (!next) return;
    if (dirty) setPendingDate(next);
    else setDate(next);
  }
  return (
    <NumericDraftProvider form={numeric}>
      <section className="space-y-4" aria-label="手动训练记录">
        {!historyOnly && (
          <section className="panel p-4 sm:p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg">记录训练</h2>
              <input
                type="date"
                className="field"
                aria-label="训练日期"
                max={today}
                value={date}
                onChange={(e) => selectDate(e.target.value)}
              />
            </div>
            {!loaded ? (
              <p role="status" className="text-sm text-muted">
                {message || "正在读取记录…"}
              </p>
            ) : (
              <fieldset disabled={saving || date > today} className="space-y-4">
                <label className="block text-sm">
                  训练名称
                  <input
                    className="field mt-1 w-full"
                    maxLength={80}
                    placeholder="例如：上肢训练（可选）"
                    value={draft.splitLabel}
                    onChange={(e) =>
                      change({ ...draft, splitLabel: e.target.value })
                    }
                  />
                </label>
                {draft.sets.length === 0 && (
                  <div className="empty-state">
                    <span className="empty-food-icon">
                      <Plus size={25} />
                    </span>
                    <p>从一个动作开始记录</p>
                    <span className="text-sm text-muted">
                      填写你实际完成的重量、次数或时长。
                    </span>
                  </div>
                )}
                <div className="space-y-3">
                  {draft.sets.map((s, i) => (
                    <article key={s.id} className="training-set">
                      <div className="flex items-center gap-2">
                        <span className="set-number">{i + 1}</span>
                        <input
                          className="field min-w-0 flex-1"
                          aria-label={`第${i + 1}组动作`}
                          maxLength={120}
                          placeholder="动作名称"
                          value={s.exercise}
                          onChange={(e) =>
                            updateSet(s.id, { exercise: e.target.value })
                          }
                        />
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`复制第${i + 1}组`}
                          onClick={() =>
                            change({
                              ...draft,
                              sets: [...draft.sets, newSet(s)],
                            })
                          }
                        >
                          <Copy size={16} />
                        </button>
                        <button
                          className="icon-button text-muted"
                          type="button"
                          aria-label={`删除第${i + 1}组`}
                          onClick={() => {
                            setRemoved(s);
                            change({
                              ...draft,
                              sets: draft.sets.filter((v) => v.id !== s.id),
                            });
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <label className="text-xs text-muted">
                          记录方式
                          <select
                            className="field mt-1 w-full"
                            value={s.loadType ?? "external"}
                            onChange={(e) =>
                              updateSet(s.id, {
                                loadType: e.target
                                  .value as WorkoutSet["loadType"],
                              })
                            }
                          >
                            <option value="external">器械 / 自由重量</option>
                            <option value="bodyweight">自重</option>
                            <option value="weighted_bodyweight">
                              自重加负重
                            </option>
                            <option value="assisted">辅助自重</option>
                            <option value="timed">按时长</option>
                          </select>
                        </label>
                        {s.loadType === "timed" ? (
                          <label className="text-xs text-muted">
                            时长（秒）
                            <NumericInput
                              className="field mt-1 w-full"
                              label={`第${i + 1}组时长`}
                              aria-label={`第${i + 1}组时长`}
                              minExclusive={0}
                              required={s.completed === true}
                              value={s.durationSeconds}
                              onValueChange={(n) =>
                                updateSet(s.id, {
                                  durationSeconds: n ?? undefined,
                                })
                              }
                            />
                          </label>
                        ) : (
                          <>
                            <label className="text-xs text-muted">
                              {s.loadType === "assisted"
                                ? "辅助重量"
                                : s.loadType === "weighted_bodyweight"
                                  ? "额外负重"
                                  : "重量"}
                              （{unitSystem === "imperial" ? "lb" : "kg"}）
                              <NumericInput
                                className="field mt-1 w-full"
                                label={`第${i + 1}组重量`}
                                aria-label={`第${i + 1}组重量`}
                                min={0}
                                disabled={s.loadType === "bodyweight"}
                                required={
                                  s.completed === true &&
                                  s.loadType !== "bodyweight"
                                }
                                value={s.weightKg}
                                formatKey={unitSystem}
                                formatValue={(n) =>
                                  Number(
                                    displayWeight(n, unitSystem).toFixed(2),
                                  )
                                }
                                toValue={(n) => canonicalWeight(n, unitSystem)}
                                blankValue={null}
                                onValueChange={(n) =>
                                  updateSet(s.id, { weightKg: n ?? null })
                                }
                              />
                            </label>
                            <label className="text-xs text-muted">
                              次数
                              <NumericInput
                                className="field mt-1 w-full"
                                label={`第${i + 1}组次数`}
                                aria-label={`第${i + 1}组次数`}
                                min={1}
                                integer
                                required={s.completed === true}
                                value={s.reps}
                                blankValue={null}
                                onValueChange={(n) =>
                                  updateSet(s.id, { reps: n ?? null })
                                }
                              />
                            </label>
                          </>
                        )}
                        <label className="check-label self-end py-3">
                          <input
                            type="checkbox"
                            checked={s.completed === true}
                            onChange={(e) =>
                              updateSet(s.id, { completed: e.target.checked })
                            }
                          />
                          已完成
                        </label>
                      </div>
                      <details className="mt-2 text-xs text-muted">
                        <summary className="cursor-pointer py-2">
                          更多记录项
                        </summary>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          <label>
                            训练部位
                            <select
                              className="field mt-1 w-full"
                              value={s.muscleGroup}
                              onChange={(e) =>
                                updateSet(s.id, {
                                  muscleGroup: e.target
                                    .value as WorkoutSet["muscleGroup"],
                                })
                              }
                            >
                              {muscleGroupOrder.map((g) => (
                                <option value={g} key={g}>
                                  {muscleGroupLabels[g]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            还能完成几次
                            <NumericInput
                              className="field mt-1 w-full"
                              label={`第${i + 1}组剩余次数`}
                              aria-label={`第${i + 1}组剩余次数`}
                              min={0}
                              max={10}
                              blankValue={null}
                              value={s.rir}
                              onValueChange={(n) =>
                                updateSet(s.id, { rir: n ?? null })
                              }
                            />
                          </label>
                          <label className="check-label">
                            <input
                              type="checkbox"
                              checked={s.isWarmup}
                              onChange={(e) =>
                                updateSet(s.id, { isWarmup: e.target.checked })
                              }
                            />
                            热身组
                          </label>
                        </div>
                      </details>
                    </article>
                  ))}
                </div>
                {removed && (
                  <div
                    className="flex items-center gap-3 text-sm"
                    role="status"
                  >
                    训练组已移除
                    <button
                      className="btn-text"
                      type="button"
                      onClick={() => {
                        change({ ...draft, sets: [...draft.sets, removed] });
                        setRemoved(null);
                      }}
                    >
                      撤销
                    </button>
                  </div>
                )}
                <button
                  className="btn-secondary w-full"
                  type="button"
                  onClick={() =>
                    change({ ...draft, sets: [...draft.sets, newSet()] })
                  }
                >
                  <Plus size={16} />
                  添加训练组
                </button>
                <details>
                  <summary className="cursor-pointer py-2 text-sm text-muted">
                    备注与体重
                  </summary>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      当天体重（{unitSystem === "imperial" ? "lb" : "kg"}）
                      <NumericInput
                        className="field mt-1 w-full"
                        label="训练体重"
                        minExclusive={0}
                        blankValue={null}
                        value={draft.bodyweightKg}
                        formatKey={unitSystem}
                        formatValue={(n) =>
                          Number(displayWeight(n, unitSystem).toFixed(2))
                        }
                        toValue={(n) => canonicalWeight(n, unitSystem)}
                        onValueChange={(n) =>
                          change({ ...draft, bodyweightKg: n ?? null })
                        }
                      />
                    </label>
                    <label className="text-sm">
                      备注
                      <input
                        className="field mt-1 w-full"
                        maxLength={1000}
                        value={draft.note ?? ""}
                        onChange={(e) =>
                          change({ ...draft, note: e.target.value })
                        }
                      />
                    </label>
                  </div>
                </details>
                <NumericDraftNotice />
                <div className="flex items-center justify-between gap-3">
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={() => void save()}
                    disabled={saving}
                  >
                    <Save size={16} />
                    {saving ? "保存中…" : "保存训练记录"}
                  </button>
                  {draft.id && (
                    <button
                      className="btn-text text-danger"
                      type="button"
                      onClick={() => setDeleteOpen(true)}
                    >
                      删除当日记录
                    </button>
                  )}
                </div>
              </fieldset>
            )}
            {message && loaded && (
              <p role="status" className="mt-3 text-sm">
                {message}
              </p>
            )}
            {date > today && (
              <p className="mt-3 text-sm text-muted">
                训练完成后，再记录实际内容。
              </p>
            )}
          </section>
        )}
        <section className="panel p-5">
          <h2 className="mb-4 text-lg">训练历史</h2>
          {!sessions.length ? (
            <p className="text-sm text-muted">还没有训练记录。</p>
          ) : (
            <div className="divide-y divide-line">
              {[...sessions]
                .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
                .slice(0, historyOnly ? 90 : 7)
                .map((s) => (
                  <Link
                    key={s.sessionDate}
                    href={`/records?tab=training&date=${s.sessionDate}`}
                    className="flex min-h-16 w-full items-center justify-between gap-4 py-3 text-left"
                    onClick={(event) => {
                      if (!historyOnly) {
                        event.preventDefault();
                        selectDate(s.sessionDate);
                      }
                    }}
                  >
                    <span>
                      <strong className="text-sm">
                        {s.splitLabel || "训练记录"}
                      </strong>
                      <span className="mt-1 block text-xs text-muted">
                        {formatDateKey(s.sessionDate, locale, {
                          month: "short",
                          day: "numeric",
                          weekday: "short",
                        })}
                      </span>
                    </span>
                    <span className="text-right text-xs text-muted">
                      {s.sets.filter((v) => v.completed === true).length} 组完成
                      <span className="mt-1 block tabular-nums">
                        {Number(
                          displayWeight(sessionTonnage(s), unitSystem).toFixed(
                            1,
                          ),
                        )}{" "}
                        {unitSystem === "imperial" ? "lb" : "kg"} 总负重
                      </span>
                    </span>
                  </Link>
                ))}
            </div>
          )}
        </section>
        <Dialog
          open={deleteOpen}
          title="删除这一天的训练记录"
          onClose={() => setDeleteOpen(false)}
        >
          <p className="mb-4 text-sm">将删除 {date} 的全部训练组。</p>
          <button
            className="btn-danger"
            disabled={saving}
            type="button"
            onClick={async () => {
              setSaving(true);
              try {
                await deleteWorkoutSession(date, user);
                setSessions((rows) =>
                  rows.filter((s) => s.sessionDate !== date),
                );
                setDraft(blankSession(date));
                setDirty(false);
                dirtyRef.current = false;
                setDeleteOpen(false);
                setMessage("当日记录已删除。");
              } catch {
                setMessage("删除失败，请重试。");
              } finally {
                setSaving(false);
              }
            }}
          >
            确认删除
          </button>
        </Dialog>
        <Dialog
          open={pendingDate !== null}
          title="当前记录尚未保存"
          onClose={() => setPendingDate(null)}
        >
          <p className="mb-4 text-sm">切换日期会放弃本次修改。</p>
          <div className="flex gap-2">
            <button
              className="btn-primary"
              onClick={() => setPendingDate(null)}
              type="button"
            >
              继续编辑
            </button>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => {
                if (pendingDate) {
                  dirtyRef.current = false;
                  setDirty(false);
                  setDate(pendingDate);
                }
                setPendingDate(null);
              }}
            >
              放弃修改并切换
            </button>
          </div>
        </Dialog>
      </section>
    </NumericDraftProvider>
  );
}
