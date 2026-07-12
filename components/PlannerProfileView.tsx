"use client";

import { Utensils } from "lucide-react";
import { useState } from "react";
import { MacroBars } from "@/components/MacroBars";
import { MetricCard } from "@/components/MetricCard";
import type { PlannerController } from "@/components/usePlanner";
import {
  autoFatTargetG,
  autoProteinTargetG,
  autoTargetKcal,
  buildNutritionResult,
  calculateBaselineDailyTarget,
  calculateDailyTarget,
  calculateMacroRatio,
  carbsPerKgBodyweight,
  carbsPerKgPerformanceFloor,
  getCalorieDeficit,
  getCarbTaperKcal,
  getMacroRatioCheck,
  isProfileComplete,
  round,
  trainingTimeLabels
} from "@/lib/nutrition";
import { toDateKey } from "@/lib/training";
import type { MacroRatio, MacroTotals, UserProfile } from "@/lib/types";

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
            {/* 指挥台顶栏：标题 + 训练时间/日期摘要（操作按钮已移到「分餐计划」页） */}
            <div className="border-b border-line bg-surface/80 px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-base font-semibold tracking-tight text-ink">今日指挥台</h2>
                <span className="hidden text-xs text-muted sm:inline">
                  {trainingTimeLabels[profile.trainingTime]} · {profile.planDate}
                </span>
              </div>
            </div>

            {/* stat 网格：6 指标。当日目标 = 维持热量(TDEE) − 减脂赤字；档案不完整时全部归 0 并由表单横幅引导。 */}
            <div className="grid grid-cols-2 border-l border-t border-line sm:grid-cols-3 xl:grid-cols-4">
              <div className="border-b border-r border-line px-4 py-3">
                <MetricCard label="BMR" value={isProfileComplete(profile) ? result.bmr : 0} unit="kcal" />
              </div>
              <div className="border-b border-r border-line px-4 py-3">
                <MetricCard label="维持热量" value={isProfileComplete(profile) ? result.tdee : 0} unit="kcal" tone="accent" />
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
                recommendedRatio={calculateMacroRatio(result.recommendedTotals)}
                targetRatio={result.targetRatio}
              />
              <PlanRulePanel ready={isProfileComplete(profile)} target={result.dailyTarget} />
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
  targetRatio: MacroRatio;
  actualRatio: MacroRatio;
  recommendedRatio: MacroRatio;
}

function MacroRatioPanel({ actualRatio, recommendedRatio, targetRatio }: MacroRatioPanelProps) {
  const actualCheck = getMacroRatioCheck(actualRatio, targetRatio, "cut");
  const recommendedCheck = getMacroRatioCheck(recommendedRatio, targetRatio, "cut");
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

function PlanRulePanel({ ready, target }: { ready: boolean; target: MacroTotals }) {
  // v2 五分化（2026-07-10 计划）：[日, 训练, 重点]。周六日完全休息；无碳循环、每天同一目标。
  const weeklyPlan: Array<[string, string, string, boolean]> = [
    ["周一", "推", "胸主+肩+三头", true],
    ["周二", "拉", "背主+二头+后束", true],
    ["周三", "腿", "股四头+核心", true],
    ["周四", "上肢", "推拉第二频次", true],
    ["周五", "腿", "后链+核心", true],
    ["周六", "休息", "步行/主动恢复", false],
    ["周日", "休息", "步行/主动恢复", false]
  ];

  return (
    <div className="rounded-xl border border-line bg-panel/60 p-3">
      <div className="mb-2.5">
        <h3 className="text-xs font-semibold tracking-tight text-ink">v2 五分化训练周（2026-07-10）</h3>
        <p className="mt-0.5 text-[11px] text-muted">
          {ready
            ? `每日目标 ${round(target.kcal, 0)} kcal · 蛋白 ${round(target.protein, 0)}g · 脂肪 ${round(target.fat, 0)}g · 碳水 ${round(target.carbs, 1)}g（按体重/体脂实时测算）；训练日休息日同一目标。`
            : "每日目标 = TDEE − 赤字，蛋白/脂肪按体重与体脂公式——填好身体档案后自动测算；训练日休息日同一目标。"}
        </p>
      </div>
      <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {weeklyPlan.map(([day, part, focus, isTraining]) => (
          <div
            key={day}
            className={`min-w-[76px] shrink-0 rounded-lg border px-2 py-2 text-center transition-colors ${
              isTraining ? "border-accent/40 bg-accent/[0.07]" : "border-line bg-surface/50 hover:border-accent/30"
            }`}
          >
            <div className="text-[11px] font-semibold text-ink">{day}</div>
            <div className="mt-1 whitespace-nowrap text-xs font-medium text-ink">{part}</div>
            <div className="whitespace-nowrap text-[10px] text-muted">{focus}</div>
            <div className="mt-1.5">
              {isTraining ? (
                <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">训练</span>
              ) : (
                <span className="text-[10px] text-muted">休息</span>
              )}
            </div>
          </div>
        ))}
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

  // 目标覆盖字段：留空 = 用公式（placeholder 显示公式值），填数字 = 手动覆盖。
  function overrideInput(key: "targetKcal" | "proteinTargetG" | "fatTargetG", value: string) {
    updateProfile(key, value === "" ? undefined : Number(value));
  }

  const ready = isProfileComplete(profile);

  return (
    <section className="panel p-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/10 text-accent ring-1 ring-accent/30">
          <Utensils size={20} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-ink">身体与训练</h2>
          <p className="text-sm text-muted">目标由体重与体脂按 v2 公式自动生成，可手动覆盖。</p>
        </div>
      </div>
      <div className="grid gap-3">
        {!ready ? (
          <div className="rounded-lg border border-accent/30 bg-accent/[0.06] px-3 py-2 text-xs leading-relaxed text-ink">
            先填写年龄、身高、体重（或到「体测记录」记一条体重/体脂），每日目标会按 v2 公式自动生成。
          </div>
        ) : null}
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
            <input className="field w-full" inputMode="numeric" type="number" value={profile.age || ""} placeholder="必填" onChange={(event) => numberInput("age", event.target.value)} />
          </label>
          <label>
            <span className="metric-label mb-1 block">身高 cm</span>
            <input className="field w-full" inputMode="decimal" type="number" value={profile.heightCm || ""} placeholder="必填" onChange={(event) => numberInput("heightCm", event.target.value)} />
          </label>
          <label>
            <span className="metric-label mb-1 block">体重 kg</span>
            <input className="field w-full" inputMode="decimal" type="number" value={profile.weightKg || ""} placeholder="随体测更新" onChange={(event) => numberInput("weightKg", event.target.value)} />
            <span className="mt-1 block text-[11px] text-muted">随最新体测记录自动更新。</span>
          </label>
          <label>
            <span className="metric-label mb-1 block">体脂率 %</span>
            <input
              className="field w-full"
              inputMode="decimal"
              step="0.5"
              type="number"
              value={profile.bodyFatPct ?? ""}
              placeholder="未填按 25 估算"
              onChange={(event) => updateProfile("bodyFatPct", event.target.value === "" ? null : Number(event.target.value))}
            />
            <span className="mt-1 block text-[11px] text-muted">随体测更新；决定去脂体重与蛋白目标。</span>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="metric-label mb-1 block">日常活动系数</span>
            <input className="field w-full" inputMode="decimal" step="0.01" type="number" value={profile.activityFactor} onChange={(event) => numberInput("activityFactor", event.target.value)} />
          </label>
          <label>
            <span className="metric-label mb-1 block">运动消耗 kcal</span>
            <input className="field w-full" inputMode="numeric" type="number" value={profile.exerciseKcal || ""} placeholder="0" onChange={(event) => numberInput("exerciseKcal", event.target.value)} />
          </label>
          <label className="col-span-2">
            <span className="metric-label mb-1 block">减脂赤字 kcal/天</span>
            <input
              className="field w-full"
              min="200"
              max="1000"
              step="50"
              type="number"
              inputMode="numeric"
              value={getCalorieDeficit(profile)}
              onChange={(event) => numberInput("calorieDeficit", event.target.value)}
            />
            <span className="mt-1 block text-[11px] text-muted">目标热量 = TDEE − 赤字；每 2 周按体重周均降幅校准 ±100~150。</span>
          </label>
        </div>
        <CarbTaperPanel profile={profile} updateProfile={updateProfile} />
        {/* v2 目标：默认公式自动（placeholder 显示当前公式值），填数字即手动覆盖，清空回到自动。 */}
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="metric-label mb-1 block">每日目标 kcal</span>
            <input
              className="field w-full"
              min="1200"
              max="6000"
              step="50"
              type="number"
              inputMode="numeric"
              value={profile.targetKcal ?? ""}
              placeholder={ready ? `自动 ${autoTargetKcal(profile)}` : "自动"}
              onChange={(event) => overrideInput("targetKcal", event.target.value)}
            />
            <span className="mt-1 block text-[11px] text-muted">留空 = TDEE − 赤字自动。</span>
          </label>
          <label>
            <span className="metric-label mb-1 block">蛋白目标 g</span>
            <input
              className="field w-full"
              min="80"
              max="300"
              step="5"
              type="number"
              inputMode="numeric"
              value={profile.proteinTargetG ?? ""}
              placeholder={ready ? `自动 ${autoProteinTargetG(profile)}` : "自动"}
              onChange={(event) => overrideInput("proteinTargetG", event.target.value)}
            />
            <span className="mt-1 block text-[11px] text-muted">留空 = 去脂体重×2.5（体脂&lt;20% ×2.8）。</span>
          </label>
          <label>
            <span className="metric-label mb-1 block">脂肪目标 g</span>
            <input
              className="field w-full"
              min="30"
              max="150"
              step="1"
              type="number"
              inputMode="numeric"
              value={profile.fatTargetG ?? ""}
              placeholder={ready ? `自动 ${autoFatTargetG(profile)}` : "自动"}
              onChange={(event) => overrideInput("fatTargetG", event.target.value)}
            />
            <span className="mt-1 block text-[11px] text-muted">留空 = 体重×0.65；碳水吃掉剩余热量。</span>
          </label>
        </div>
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

/**
 * 碳水渐降面板（v2 文档第五节"每 2 周校准热量"）：全手动步进。
 * 降一步 = 每日目标 −N kcal（全部落在碳水，蛋白/脂肪守底不动）；回升一步 = 加回；可撤销。
 * 系统只显示文档触发条件作参考，绝不自动执行任何一步。
 */
function CarbTaperPanel({ profile, updateProfile }: ProfilePanelProps) {
  const [stepInput, setStepInput] = useState("100");
  // 惰性初始化固定"今天"，保持渲染纯净（react-hooks/purity）；跨午夜由下次进入页面刷新。
  const [todayKey] = useState(() => toDateKey(new Date()));
  const steps = profile.carbTaperSteps ?? [];
  const stage = steps.length;
  const taperKcal = getCarbTaperKcal(profile);
  const lastStep = stage > 0 ? steps[stage - 1] : null;
  const daysSinceLast = lastStep
    ? Math.max(
        Math.floor(
          (new Date(`${todayKey}T00:00:00`).getTime() - new Date(`${lastStep.date}T00:00:00`).getTime()) / 86_400_000
        ),
        0
      )
    : null;
  const stepKcal = Number(stepInput);
  const stepValid = Number.isFinite(stepKcal) && stepKcal >= 50 && stepKcal <= 300;
  const ready = isProfileComplete(profile);
  // 首周目标 = 渐降基线（残差法：蛋白/脂肪按身体数据锚定后，剩余热量 ÷4），随体测实时重算；
  // 本周目标 = 基线 + Σ 步进。g/kg 体重是初始碳水合理性的交叉校验口径（文献带约 2–4）。
  const baselineCarbs = calculateBaselineDailyTarget(profile).carbs;
  const taperedCarbs = calculateDailyTarget(profile).carbs;
  const taperedCarbsPerKg = carbsPerKgBodyweight(profile, taperedCarbs);
  const signed = (value: number) => `${value > 0 ? "+" : ""}${round(value, 1)}`;

  function pushStep(direction: 1 | -1) {
    if (!stepValid) {
      return;
    }
    updateProfile("carbTaperSteps", [...steps, { date: toDateKey(new Date()), deltaKcal: direction * stepKcal }]);
  }

  function undoStep() {
    if (stage === 0) {
      return;
    }
    updateProfile("carbTaperSteps", steps.slice(0, -1));
  }

  return (
    <div className="rounded-lg border border-line bg-panel/60 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-tight text-ink">碳水渐降</h3>
        <span className="text-[11px] font-medium tabular-nums text-ink">
          {stage === 0
            ? "第 0 步 · 未开始（完整碳水基线）"
            : `第 ${stage} 步 · 累计 ${signed(taperKcal)} kcal ≈ 碳水 ${signed(taperKcal / 4)}g`}
        </span>
      </div>
      <p className="mt-1 text-[11px] font-medium tabular-nums text-ink">
        {!ready
          ? "身体档案完整后自动得出首周碳水目标（基线 = 蛋白/脂肪锚定后剩余热量 ÷4）。"
          : stage === 0
            ? `首周碳水目标 ${round(baselineCarbs, 1)}g · ${round(taperedCarbsPerKg, 1)} g/kg 体重（剩余热量 ÷4，随体测实时重算）`
            : `本周碳水目标 ${round(taperedCarbs, 1)}g · ${round(taperedCarbsPerKg, 1)} g/kg · 基线 ${round(baselineCarbs, 1)}g`}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        文档第五节（每 2 周评估）：周均降幅 &lt;0.3kg 连续 2 周 → 降一步 −100~150；0.5–0.7kg → 不动；&gt;0.9kg 且训练重量下滑 → 回升一步。蛋白/脂肪守底，增减全部落在碳水。<span className="font-medium">只随你手动操作，系统不会自动降。</span>
      </p>
      {lastStep ? (
        <p className="mt-1 text-[11px] text-muted">
          上次调整 {lastStep.date}（{daysSinceLast} 天前，{signed(lastStep.deltaKcal)} kcal）
          {daysSinceLast != null && daysSinceLast < 14 ? " · 未满 2 周，文档建议先观察满 2 周再动。" : " · 已满 2 周，可按周均降幅评估下一步。"}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="metric-label">本步幅度</span>
          <input
            className="field h-8 w-20 text-xs"
            inputMode="numeric"
            type="number"
            min="50"
            max="300"
            step="25"
            value={stepInput}
            onChange={(event) => setStepInput(event.target.value)}
          />
          <span className="text-[11px] text-muted">kcal ≈ 碳水 {stepValid ? round(stepKcal / 4, 1) : "--"}g（文档每步 100–150）</span>
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn-primary h-8 px-3 text-xs" type="button" disabled={!stepValid} onClick={() => pushStep(-1)}>
          降一步 −{stepValid ? stepKcal : "?"} kcal
        </button>
        <button className="btn-secondary h-8 px-3 text-xs" type="button" disabled={!stepValid} onClick={() => pushStep(1)}>
          回升一步 +{stepValid ? stepKcal : "?"} kcal
        </button>
        <button className="btn-secondary h-8 px-3 text-xs" type="button" disabled={stage === 0} onClick={undoStep}>
          撤销上一步
        </button>
      </div>
      {ready && taperedCarbs > 0 && taperedCarbs < 100 ? (
        <p className="mt-2 text-[11px] font-medium text-rose">
          当前碳水目标仅 {round(taperedCarbs, 1)}g/天，已属极低碳水——会损害训练表现与瘦体重保持（文档以 235–260g 为基线区间）。请核对活动系数/运动消耗/赤字{stage > 0 ? "，或撤销渐降步进" : ""}。
        </p>
      ) : null}
      {ready && taperedCarbs >= 100 && taperedCarbsPerKg < carbsPerKgPerformanceFloor ? (
        <p className="mt-2 text-[11px] font-medium text-rose">
          当前碳水密度 {round(taperedCarbsPerKg, 1)} g/kg 已低于 2 g/kg——减脂期抗阻训练的表现风险线（文献带约 2–4）。多半是活动系数/运动消耗填低或赤字过大，请核对档案{stage > 0 ? "，或回升一步" : ""}。
        </p>
      ) : null}
      {ready && stage > 0 && taperedCarbs <= 0 ? (
        <p className="mt-2 text-[11px] font-medium text-rose">渐降已把碳水压到 0：目标热量正卡在蛋白+脂肪底座上，请撤销或回升。</p>
      ) : null}
    </div>
  );
}
