import { parsePlanProtocol } from "@/lib/planProtocol";
import type { PlanProtocol } from "@/lib/types";

export const trePresetName = "晚间训练·三餐限时进食·8天倒金字塔";

/** 仅通用执行配置；生效日期、锚点与时区必须由用户明确提供。 */
export function createTreProtocol(input: { id: string; effectiveFrom: string; cycleAnchorDate: string; timeZone: string; previous?: PlanProtocol | null; target?: PlanProtocol["dailyTarget"]; nutrition?: PlanProtocol["nutrition"]; mealSlots?: PlanProtocol["mealSlots"]; changeReason?: string; evidenceWindow?: PlanProtocol["evidenceWindow"] }): PlanProtocol {
  return parsePlanProtocol({
    id: input.id, schemaVersion: input.nutrition ? 2 : 1, ...(input.nutrition ? { nutrition: input.nutrition, requestId: input.id } : {}), presetId: "eveningTreRptV4", version: (input.previous?.version ?? 0) + 1,
    effectiveFrom: input.effectiveFrom, timeZone: input.timeZone, targetMode: "calibrated", allocationMode: "explicitMacros",
    dailyTarget: input.nutrition?.result.resolvedTarget ?? input.target ?? { kcal: 2205, protein: 175, fat: 65, carbs: 230 },
    eatingWindow: input.previous?.eatingWindow ?? { start: "11:30", end: "21:00", endDayOffset: 0 },
    trainingStartLocal: input.previous?.trainingStartLocal ?? "18:00", preTrainingNoIntakeMinutes: input.previous?.preTrainingNoIntakeMinutes ?? 180,
    mealSlots: input.mealSlots ?? input.previous?.mealSlots ?? [
      { id: "lunch", name: "第一餐", kind: "main", schedule: { start: "11:30", end: "11:50", endDayOffset: 0 }, targetAllocation: { protein: 60 / 175, carbs: 75 / 230, fat: 25 / 65 } },
      { id: "afternoon-main", name: "下午主餐", kind: "main", schedule: { start: "14:30", end: "15:00", endDayOffset: 0 }, targetAllocation: { protein: 55 / 175, carbs: 80 / 230, fat: 15 / 65 } },
      { id: "dinner", name: "第三餐", kind: "main", schedule: { start: "20:00", end: "20:45", endDayOffset: 0 }, targetAllocation: { protein: 60 / 175, carbs: 75 / 230, fat: 25 / 65 } },
    ],
    trainingCycle: { id: "rptAlternate8DayV4", lengthDays: 8, phase: "recovery", anchorDate: input.cycleAnchorDate },
    reviewRules: input.previous?.reviewRules ?? { minWeightsPerWeek: 4, minIntakeDaysPerWeek: 6, stableTargetDays: 14, firstReviewDays: 14 },
    supersedesId: input.previous?.id ?? null, changeReason: input.changeReason ?? "主动选择通用执行预设", evidenceWindow: input.evidenceWindow,
  });
}
