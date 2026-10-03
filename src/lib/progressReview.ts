import type { BodyLog } from "@/lib/bodyLogs";
import type { DailyCheckin, PlanProtocol } from "@/lib/types";
import { addDays, daysBetween } from "@/lib/dateTime";
import { actualCoverageKnown, actualTotals } from "@/lib/actualIntake";
import { goalPresetVersions } from "@/lib/nutritionGoals/presets";

export type ReviewStatus = "maintain" | "review_intake" | "consider_increase" | "consider_small_decrease" | "recovery_first" | "insufficient_data";
export interface ReviewWindow { from: string; to: string; weightSamples: number; meanWeight: number | null; waistSamples: number; meanWaist: number | null; intakeDays: number; meanIntake: number | null; estimatedShare: number }
export interface ProgressReview { status: ReviewStatus; reasons: string[]; windows: ReviewWindow[]; weeklyLoss: number[]; adjustmentKcal: number | null; evidenceWindow: { from: string; to: string }; recovery: "unknown" | "stable" | "concern" }
const mean = (values: number[]) => values.length ? values.reduce((a,b) => a+b,0)/values.length : null;
const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/** 只读取确认实际与明确生效协议。窗口缺失不填零，不替用户执行调整。 */
export function reviewProgress(protocol: PlanProtocol, endDate: string, logs: BodyLog[], checkins: DailyCheckin[]): ProgressReview {
  const policy = protocol.nutrition?.policy;
  const goalPresets = goalPresetVersions[policy?.presetVersion ?? 1];
  // originPreset records provenance; a custom policy can have a different energy direction.
  const goal = policy?.presetId === "custom" ? undefined : policy?.presetId;
  const observationDays = policy ? goal ? goalPresets[goal].reviewDays : 28 : 14;
  const elapsed = daysBetween(protocol.effectiveFrom, endDate) + 1;
  const count = Math.min(policy && observationDays === 28 ? 4 : 3, Math.max(0, Math.floor(elapsed/7)));
  const confirmed = new Map(checkins.filter(c => c.completed).map(c => [c.planDate,c]));
  const body = new Map(logs.map(l => [l.logDate,l]));
  const windows: ReviewWindow[] = Array.from({length:count}, (_,i) => {
    const to = addDays(endDate, -(count-1-i)*7); const from = addDays(to,-6);
    const dates = Array.from({length:7}, (_,d) => addDays(from,d));
    const weights = dates.map(d => body.get(d)?.weightKg).filter(positive);
    const waists = dates.map(d => body.get(d)?.waistCm).filter(positive);
    const actuals = dates.flatMap(d => {
      const c = confirmed.get(d);
      if (!c || !actualCoverageKnown(c.actual) || !c.target || !Object.keys(protocol.dailyTarget).every(k => Math.abs(c.target![k as keyof typeof c.target]-protocol.dailyTarget[k as keyof typeof protocol.dailyTarget])<0.01)) return [];
      if (policy && (c.actual.version !== 3 || c.actual.targetProtocolSnapshot?.id !== protocol.id)) return [];
      return [c.actual];
    });
    const events = actuals.flatMap(a => a.version === 3 ? a.mealEvents : []);
    return {from,to,weightSamples:weights.length,meanWeight:mean(weights),waistSamples:waists.length,meanWaist:mean(waists),intakeDays:actuals.length,meanIntake:mean(actuals.map(a=>actualTotals(a).kcal)),estimatedShare:events.length ? events.filter(e=>e.entryMethod === "estimated").length/events.length : 0};
  });
  const recent = [...confirmed.values()].filter(c=>c.planDate >= addDays(endDate,-6) && c.planDate<=endDate);
  const symptoms = recent.some(c=>c.actual.version===3 && (c.actual.recovery?.persistentSymptoms === true || (c.actual.recovery?.footPain ?? 0)>=4 || (c.actual.recovery?.fatigue ?? 0)>=4 || c.actual.recovery?.trainingTolerance === "limited"));
  const recoveryDays = recent.filter(c=>c.actual.version===3 && c.actual.recovery?.persistentSymptoms === false && c.actual.recovery.footPain != null && c.actual.recovery.fatigue != null && c.actual.recovery.trainingTolerance === "good" && c.actual.habits?.sleepHours != null);
  const stable = recoveryDays.length>=3 && recoveryDays.every(c=>(c.actual.habits?.sleepHours ?? 0)>=6 && c.actual.version===3 && (c.actual.recovery?.fatigue ?? 5)<=2 && (c.actual.recovery?.footPain ?? 10)<=2);
  const result: ProgressReview = {status:"insufficient_data", reasons:[], windows, weeklyLoss:[], adjustmentKcal:null, evidenceWindow:{from:windows[0]?.from ?? protocol.effectiveFrom,to:endDate},recovery:symptoms ? "concern" : stable ? "stable" : "unknown"};
  const done = (status: ReviewStatus, reason: string, adjustmentKcal: number|null = null): ProgressReview => ({...result,status,reasons:[...result.reasons,reason],adjustmentKcal});
  if (symptoms) return done("recovery_first","有持续不适或恢复负担标记，先复盘恢复与训练；持续症状可寻求医疗帮助，暂不建议进一步减少摄入。");
  if (elapsed < Math.max(observationDays,protocol.reviewRules.firstReviewDays,protocol.reviewRules.stableTargetDays)) return done("insufficient_data",`同一目标需观察至少 ${Math.max(observationDays,protocol.reviewRules.firstReviewDays,protocol.reviewRules.stableTargetDays)} 天；当前 ${Math.max(elapsed,0)} 天。`);
  if (windows.length<2 || windows.some(w=>w.weightSamples<protocol.reviewRules.minWeightsPerWeek)) return done("insufficient_data",`每个7天窗口需要至少 ${protocol.reviewRules.minWeightsPerWeek} 次有效体重；缺失日期未填零。`);
  result.weeklyLoss = windows.slice(1).map((w,i)=>windows[i].meanWeight!-w.meanWeight!);
  if (!stable) return done("review_intake","恢复信息不足或尚不稳定，不能判断恢复良好；补充睡眠、疲劳、足部不适和训练耐受。");
  if (windows.some(w=>w.intakeDays<protocol.reviewRules.minIntakeDaysPerWeek || w.estimatedShare>0.25)) return done("review_intake",`每7天至少 ${protocol.reviewRules.minIntakeDaysPerWeek} 天确认完整摄入；估算事件超过25%时降低置信度。先核对记录。`);
  if (policy) {
    const changes = windows.slice(1).map((w, i) => (w.meanWeight! / windows[i].meanWeight! - 1) * 100);
    if (!goal) return done("maintain", "自定义目标按已确认策略观察趋势；本轮不自动推导TDEE或增减摄入。");
    if (goal === "recomp") return done("maintain", "重组方向结合腰围与力量观察；不因体重不降减少能量。");
    if (goal === "maintain") return done("maintain", "维持期观察较长时间的基线与活动变化，不继续旧减脂步进。");
    if (goal === "lean_gain") {
      if (changes.every(n => n > 0.25)) return done("review_intake", "连续增重快于0.1%–0.25%/周的产品参考，先核对摄入和腰围；不能把全部增重当肌肉。");
      if (changes.every(n => n < 0.1)) return done("consider_increase", "至少28天完整记录支持缓慢增重不足，可人工考虑增加100千卡，预览确认后生效。", 100);
      return done("maintain", "按较长窗口观察缓慢增重、腰围及力量，不因三天没涨立即加餐。");
    }
    const [lower, upper] = goalPresets[goal].weeklyChange;
    if (changes.every(n => n < lower)) {
      if (windows[0].from < addDays(protocol.effectiveFrom, 7)) return done("review_intake", "首周变化不用于激进速度判断，继续收集首周之后的有效窗口。");
      return done("consider_increase", "连续周间下降快于当前场景观察区间，可人工考虑增加100千卡；体重变化不等于脂肪变化。", 100);
    }
    if (changes.every(n => n > upper)) {
      if (windows.some(w => w.meanWaist == null)) return done("review_intake", "腰围信息不足，先核对记录，不主动进一步减碳。");
      if (windows.slice(1).some((w, i) => w.meanWaist! < windows[i].meanWaist!)) return done("maintain", "腰围仍在下降，保留目标观察。");
      return done("consider_small_decrease", "至少3个有效7天窗口支持人工复盘，可考虑减少100千卡，不能自动累计旧校准。", -100);
    }
    return done("maintain", `周间变化结合${lower}%至${upper}%/周的场景参考观察；保持当前目标。`);
  }
  const lastLoss = result.weeklyLoss.at(-1)!;
  if (lastLoss>=0.3 && lastLoss<=0.7) return done("maintain","最近周均下降处于观察区间，恢复记录稳定，维持当前目标。体重变化不等同于脂肪变化。");
  if (windows.length<3) return done("insufficient_data","14天只能形成一次周间比较；连续两次比较至少需要3个有效7天窗口。");
  if (result.weeklyLoss.every(n=>n>0.8)) {
    if (windows[0].from<addDays(protocol.effectiveFrom,7)) return done("review_intake","首周不用于激进速度判断，继续补充首周之后的有效窗口。");
    return done("consider_increase","首周后连续两次周均下降超过0.8公斤，可人工复盘并考虑增加100—150千卡。",125);
  }
  if (windows.every(w=>w.meanWaist != null) && windows.slice(1).every((w,i)=>w.meanWaist!<windows[i].meanWaist!)) return done("maintain","腰围仍在下降，暂不将体重变化视为平台；继续观察。");
  if (result.weeklyLoss.every(n=>n<0.2)) {
    if (windows.some(w=>w.meanWaist == null)) return done("review_intake","腰围记录不足，不能默认为腰围未变；暂不建议减少摄入。");
    if (windows.some(w=>Math.abs(w.meanWaist!-windows[0].meanWaist!)>0.5)) return done("maintain","腰围仍在变化，继续观察，暂不建议减少摄入。");
    return done("consider_small_decrease","三周体重趋势、腰围与完整摄入记录符合人工复盘条件，可选择减少100—150千卡；每次只改变一个变量。",-125);
  }
  return done("maintain","变化处于灰区或尚无连续趋势，维持目标并继续观察。");
}
