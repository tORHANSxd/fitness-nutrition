"use client";

import { Utensils } from "lucide-react";
import { MacroBars } from "@/components/MacroBars";
import { MetricCard } from "@/components/MetricCard";
import type { PlannerController } from "@/components/usePlanner";
import {
  buildNutritionResult,
  calculateMacroRatio,
  carbDayLabels,
  getCalorieDeficit,
  getMacroRatioCheck,
  getProteinPerKg,
  resolveCarbDayType,
  round,
  trainingTimeLabels
} from "@/lib/nutrition";
import { plannerCarbDayOptions } from "@/lib/types";
import type { CarbDayType, MacroRatio, MacroTotals, UserProfile } from "@/lib/types";

interface PlannerProfileViewProps {
  controller: PlannerController;
}

export function PlannerProfileView({ controller }: PlannerProfileViewProps) {
  const { profile, updateProfile, result, meals, message } = controller;

  return (
    <section className="animate-fade-up space-y-5">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="order-1 space-y-4 xl:order-2">
          <section className="panel overflow-hidden">
            {/* 指挥台顶栏：标题 + 碳日标签 + 训练时间/日期摘要（操作按钮已移到「分餐计划」页） */}
            <div className="border-b border-line bg-surface/80 px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-base font-semibold tracking-tight text-ink">今日指挥台</h2>
                <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                  {carbDayLabels[result.carbDayType]}
                </span>
                <span className="hidden text-xs text-muted sm:inline">
                  {trainingTimeLabels[profile.trainingTime]} · {profile.planDate}
                </span>
              </div>
            </div>

            {/* stat 网格：6 指标。当日目标 = 维持热量(TDEE) − 减脂热量缺口；「计划缺口」显示该缺口值。 */}
            <div className="grid grid-cols-2 border-l border-t border-line sm:grid-cols-3 xl:grid-cols-4">
              <div className="border-b border-r border-line px-4 py-3">
                <MetricCard label="BMR" value={result.bmr} unit="kcal" />
              </div>
              <div className="border-b border-r border-line px-4 py-3">
                <MetricCard label="维持热量" value={result.tdee} unit="kcal" tone="accent" />
              </div>
              <div className="border-b border-r border-line px-4 py-3">
                <MetricCard label="当日目标" value={result.dailyTarget.kcal} unit="kcal" tone="accent" />
              </div>
              <div className="border-b border-r border-line px-4 py-3">
                <MetricCard
                  label={result.plannedCalorieDelta < 0 ? "计划缺口" : result.plannedCalorieDelta > 0 ? "计划盈余" : "计划差额"}
                  value={Math.abs(result.plannedCalorieDelta)}
                  unit="kcal"
                  tone={result.plannedCalorieDelta < 0 ? "normal" : "accent"}
                />
              </div>
              <div className="border-b border-r border-line px-4 py-3">
                <MetricCard label="当前摄入" value={result.actualTotals.kcal} unit="kcal" />
              </div>
              <div className="border-b border-r border-line px-4 py-3">
                <MetricCard
                  label="剩余目标"
                  value={result.remaining.kcal}
                  unit="kcal"
                  tone={result.remaining.kcal < 0 ? "danger" : "normal"}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 border-t border-line p-4">
              <DailyBalancePanel actual={result.actualTotals} recommended={result.recommendedTotals} target={result.dailyTarget} />
              <MacroRatioPanel
                actualRatio={result.actualRatio}
                carbDayType={result.carbDayType}
                carbDayLabel={carbDayLabels[result.carbDayType]}
                recommendedRatio={calculateMacroRatio(result.recommendedTotals)}
                targetRatio={result.targetRatio}
              />
              <PlanRulePanel />
            </div>

            {message ? <p className="mx-4 mb-3 rounded-lg border border-accent/20 bg-accent/10 px-4 py-2.5 text-sm font-medium text-accent">{message}</p> : null}
          </section>
          <MacroBars result={result} meals={meals} />
        </div>
        <div className="order-2 space-y-4 xl:order-1">
          <ProfilePanel profile={profile} updateProfile={updateProfile} />
        </div>
      </div>
    </section>
  );
}

interface DailyBalancePanelProps {
  target: MacroTotals;
  actual: MacroTotals;
  recommended: MacroTotals;
}

function DailyBalancePanel({ actual, recommended, target }: DailyBalancePanelProps) {
  return (
    <div className="rounded-xl border border-line bg-panel/60 p-3">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-tight text-ink">热量 &amp; 营养素盈亏</h3>
        <span className="text-[10px] text-muted">摄入 / 目标</span>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <DailyBalanceCard actual={actual.kcal} label="热量" recommended={recommended.kcal} target={target.kcal} unit="kcal" />
        <DailyBalanceCard actual={actual.carbs} label="碳水" recommended={recommended.carbs} target={target.carbs} unit="g" />
        <DailyBalanceCard actual={actual.protein} label="蛋白" recommended={recommended.protein} target={target.protein} unit="g" />
        <DailyBalanceCard actual={actual.fat} label="脂肪" recommended={recommended.fat} target={target.fat} unit="g" />
      </div>
    </div>
  );
}

function DailyBalanceCard({
  actual,
  label,
  recommended,
  target,
  unit
}: {
  actual: number;
  label: string;
  recommended: number;
  target: number;
  unit: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface/50 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="metric-label">{label}</span>
        <span className="text-[10px] text-muted">目标 {round(target, unit === "kcal" ? 0 : 1)}{unit}</span>
      </div>
      <DailyBalanceBar label="当前" target={target} unit={unit} value={actual} />
      <DailyBalanceBar label="推荐后" target={target} unit={unit} value={recommended} />
    </div>
  );
}

function DailyBalanceBar({
  label,
  target,
  unit,
  value
}: {
  label: string;
  target: number;
  unit: string;
  value: number;
}) {
  const balance = target - value;
  const ratio = target > 0 ? (value / target) * 100 : 0;
  const isSurplus = balance < 0;
  const roundedDigits = unit === "kcal" ? 0 : 1;
  const balanceLabel = isSurplus ? "盈" : "亏";
  const barColor = isSurplus ? "bg-rose" : "bg-accent";

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted">
          {label} {round(value, roundedDigits)}{unit} / {round(ratio, 0)}%
        </span>
        <span className={isSurplus ? "font-semibold text-rose" : "font-semibold text-accent"}>
          {balanceLabel} {round(Math.abs(balance), roundedDigits)}{unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(Math.max(ratio, 0), 100)}%` }} />
      </div>
    </div>
  );
}

interface MacroRatioPanelProps {
  carbDayType: ReturnType<typeof buildNutritionResult>["carbDayType"];
  carbDayLabel: string;
  targetRatio: MacroRatio;
  actualRatio: MacroRatio;
  recommendedRatio: MacroRatio;
}

function MacroRatioPanel({ actualRatio, carbDayType, recommendedRatio, targetRatio }: MacroRatioPanelProps) {
  const actualCheck = getMacroRatioCheck(actualRatio, targetRatio, "cut", carbDayType);
  const recommendedCheck = getMacroRatioCheck(recommendedRatio, targetRatio, "cut", carbDayType);
  const actualStatus = `${actualCheck.cycleAligned ? "公式贴合" : "公式偏离"} / ${actualCheck.goalAligned ? "参考内" : "参考外"}`;
  const recommendedStatus = `${recommendedCheck.cycleAligned ? "公式贴合" : "公式偏离"} / ${recommendedCheck.goalAligned ? "参考内" : "参考外"}`;

  return (
    <div className="rounded-xl border border-line bg-panel/60 p-3">
      <div className="mb-2.5">
        <h3 className="text-xs font-semibold tracking-tight text-ink">宏量素比例</h3>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
          当前 {actualStatus} · 推荐后 {recommendedStatus}
        </p>
      </div>
      <div className="grid gap-1.5 grid-cols-3">
        <MacroRatioRow actual={actualRatio.carbs} label="碳水" range={actualCheck.ranges.carbs} recommended={recommendedRatio.carbs} target={targetRatio.carbs} />
        <MacroRatioRow actual={actualRatio.protein} label="蛋白" range={actualCheck.ranges.protein} recommended={recommendedRatio.protein} target={targetRatio.protein} />
        <MacroRatioRow actual={actualRatio.fat} label="脂肪" range={actualCheck.ranges.fat} recommended={recommendedRatio.fat} target={targetRatio.fat} />
      </div>
    </div>
  );
}

function MacroRatioRow({
  actual,
  label,
  range,
  recommended,
  target
}: {
  actual: number;
  label: string;
  range: { min: number; max: number };
  recommended: number;
  target: number;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface/50 p-2.5">
      <div className="metric-label">{label}</div>
      <div className="mt-1.5 flex items-end gap-1.5">
        <span className="tabular-nums text-base font-semibold text-accent">{round(target, 0)}%</span>
        <span className="pb-0.5 text-[10px] text-muted">
          现 {round(actual, 0)} / 推 {round(recommended, 0)}
        </span>
      </div>
      <p className="mt-0.5 text-[10px] text-muted">
        {round(range.min, 0)}-{round(range.max, 0)}% 区间
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-accent/70" style={{ width: `${Math.min(Math.max(target, 0), 100)}%` }} />
      </div>
    </div>
  );
}

function PlanRulePanel() {
  // [日, 部位, 动作, 碳日]：部位与动作分行，避免窄列内长标签换行。
  const weeklyPlan: Array<[string, string, string, "高碳" | "低碳"]> = [
    ["周一", "胸", "卧推飞鸟", "低碳"],
    ["周二", "背", "引体划船", "低碳"],
    ["周三", "腿", "深蹲硬拉", "高碳"],
    ["周四", "肩", "推举侧平举", "低碳"],
    ["周五", "手臂", "弯举臂屈伸", "低碳"],
    ["周六", "休息", "恢复", "低碳"],
    ["周日", "休息", "恢复", "低碳"]
  ];

  return (
    <div className="rounded-xl border border-line bg-panel/60 p-3">
      <div className="mb-2.5">
        <h3 className="text-xs font-semibold tracking-tight text-ink">张老师五分化碳循环</h3>
        <p className="mt-0.5 text-[11px] text-muted">仅腿日高碳、其余6天低碳；16/8进食窗口；高碳日严控油脂。</p>
      </div>
      <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {weeklyPlan.map(([day, part, move, carbDay]) => {
          const high = carbDay === "高碳";
          return (
            <div
              key={day}
              className={`min-w-[72px] shrink-0 rounded-lg border px-2 py-2 text-center transition-colors ${
                high ? "border-accent/40 bg-accent/[0.07]" : "border-line bg-surface/50 hover:border-accent/30"
              }`}
            >
              <div className="text-[11px] font-semibold text-ink">{day}</div>
              <div className="mt-1 whitespace-nowrap text-xs font-medium text-ink">{part}</div>
              <div className="whitespace-nowrap text-[10px] text-muted">{move}</div>
              <div className="mt-1.5">
                {high ? (
                  <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">高碳</span>
                ) : (
                  <span className="text-[10px] text-muted">低碳</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ProfilePanelProps {
  profile: UserProfile;
  updateProfile: <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => void;
}

function ProfilePanel({ profile, updateProfile }: ProfilePanelProps) {
  function numberInput<K extends keyof UserProfile>(key: K, value: string) {
    updateProfile(key, Number(value) as UserProfile[K]);
  }

  return (
    <section className="panel p-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent ring-1 ring-accent/30">
          <Utensils size={20} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink">身体与训练</h2>
          <p className="text-sm text-muted">每个输入字符都会刷新目标、推荐值和图表。</p>
        </div>
      </div>
      <div className="grid gap-3">
        <label>
          <span className="metric-label mb-1 block">计划日期</span>
          <input className="field w-full" type="date" value={profile.planDate} onChange={(event) => updateProfile("planDate", event.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="metric-label mb-1 block">性别</span>
            <select className="field w-full" value={profile.sex} onChange={(event) => updateProfile("sex", event.target.value as UserProfile["sex"])}>
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </label>
          <label>
            <span className="metric-label mb-1 block">年龄</span>
            <input className="field w-full" inputMode="numeric" type="number" value={profile.age} onChange={(event) => numberInput("age", event.target.value)} />
          </label>
          <label>
            <span className="metric-label mb-1 block">身高 cm</span>
            <input className="field w-full" inputMode="decimal" type="number" value={profile.heightCm} onChange={(event) => numberInput("heightCm", event.target.value)} />
          </label>
          <label>
            <span className="metric-label mb-1 block">体重 kg</span>
            <input className="field w-full" inputMode="decimal" type="number" value={profile.weightKg} onChange={(event) => numberInput("weightKg", event.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="metric-label mb-1 block">日常活动系数</span>
            <input className="field w-full" inputMode="decimal" step="0.01" type="number" value={profile.activityFactor} onChange={(event) => numberInput("activityFactor", event.target.value)} />
          </label>
          <label>
            <span className="metric-label mb-1 block">运动消耗 kcal</span>
            <input className="field w-full" inputMode="numeric" type="number" value={profile.exerciseKcal} onChange={(event) => numberInput("exerciseKcal", event.target.value)} />
          </label>
          <label>
            <span className="metric-label mb-1 block">蛋白 g/kg</span>
            <input
              className="field w-full"
              min="1.6"
              max="2.2"
              step="0.1"
              type="number"
              inputMode="decimal"
              value={getProteinPerKg(profile)}
              onChange={(event) => numberInput("proteinPerKg", event.target.value)}
            />
          </label>
          <label>
            <span className="metric-label mb-1 block">热量缺口 kcal</span>
            <input
              className="field w-full"
              min="0"
              max="1200"
              step="50"
              type="number"
              inputMode="numeric"
              value={getCalorieDeficit(profile)}
              onChange={(event) => numberInput("calorieDeficit", event.target.value)}
            />
          </label>
        </div>
        <label>
          <span className="metric-label mb-1 block">碳循环日</span>
          <select
            className="field w-full"
            value={resolveCarbDayType(profile)}
            onChange={(event) => updateProfile("carbDayType", event.target.value as CarbDayType)}
            disabled={profile.trainingTime === "rest"}
          >
            {plannerCarbDayOptions.map((value) => (
              <option key={value} value={value}>
                {carbDayLabels[value]}
              </option>
            ))}
          </select>
          {profile.trainingTime === "rest" ? <span className="mt-1 block text-[11px] text-muted">休息日固定低碳。</span> : null}
        </label>
        <label>
          <span className="metric-label mb-1 block">训练时间</span>
          <select
            className="field w-full"
            value={profile.trainingTime}
            onChange={(event) => updateProfile("trainingTime", event.target.value as UserProfile["trainingTime"])}
          >
            {Object.entries(trainingTimeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
