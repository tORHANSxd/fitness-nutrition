import { Temporal } from "@js-temporal/polyfill";
import { goalPresetVersions, nutritionRuleVersions } from "./presets";
import type { CalculationBodySnapshot, NutritionPolicyV1, NutritionTargetResolution, NutritionIssue } from "./types";

// This implementation belongs to presetVersion 1; future versions need their own supported branch.
const goalPresets = goalPresetVersions[1];
const nutritionRules = nutritionRuleVersions["nutrition-goals-v5.0"];

const inputLabels: Record<string, string> = {
  weightKg: "计算体重", heightCm: "身高", ageYears: "当前周岁", calculationDate: "计算日期", birthDate: "出生日期",
  bodyFatPct: "体脂率", bodyFatWeightKg: "体脂测量同日体重", bodyFatMeasuredOn: "体脂测量日期", bodyFatSource: "体脂来源",
  ffmKg: "直接FFM", ffmMeasuredOn: "FFM测量日期", ffmSourceLabel: "FFM来源", weightDates: "体重记录日期",
  "tdee.multiplier": "活动系数", "tdee.kcal": "确认的TDEE", "tdee.cycleDays": "计划周期天数", "tdee.assessedOn": "TDEE确认日期",
  "rmr.kcal": "测量RMR", "rmr.measuredOn": "RMR测量日期", "rmr.sourceLabel": "RMR来源",
  "energy.kcal": "手动每日能量", "protein.grams": "手动蛋白", "fat.grams": "手动脂肪", "carbs.grams": "手动碳水",
  "protein.coefficient": "蛋白系数", "fat.coefficient": "脂肪系数", "protein.weightKg": "专业参考体重", "protein.sourceLabel": "参考体重依据",
};
const inputLabel = (field: string) => inputLabels[field] ?? inputLabels[field.split(".").at(-1)!] ?? "对应输入";

export function roundToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(step) || step <= 0) throw new Error("INVALID_NUMBER");
  return Math.floor(value / step + 0.5) * step;
}
export function ceilToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(step) || step <= 0) throw new Error("INVALID_NUMBER");
  return Math.ceil(value / step) * step;
}

/** Stable identity for change detection, not an authentication or anonymisation mechanism. */
export function nutritionInputFingerprint(value: unknown): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
    ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)])) : v;
  const json = JSON.stringify(canonical(value));
  let hash = BigInt("14695981039346656037");
  for (const byte of new TextEncoder().encode(json)) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * BigInt("1099511628211"));
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

/** Pure v5 engine: no clock, storage, React, legacy calorie deficit or mutable profile access. */
export function calculateNutritionTarget(policy: NutritionPolicyV1, body: CalculationBodySnapshot): NutritionTargetResolution {
  const result: NutritionTargetResolution = {
    status: "valid", resolvedTarget: null, candidateTarget: null,
    expenditure: { rmrKcal: null, tdeeKcal: null, source: policy?.tdee?.kind ?? "not_used" },
    rawValues: {}, trace: [], assumptions: [], issues: [], algorithmVersion: "nutrition-v5.0",
    policyVersion: policy?.policyVersion, presetVersion: policy?.presetVersion, inputFingerprint: "",
  };
  const issue = (code: string, severity: NutritionIssue["severity"], field: string, message: string, action = "核对并修改对应输入。") => {
    result.issues.push({ code, severity, fieldPaths: [field], message, suggestedActions: [action] });
  };
  const stop = (status: NutritionTargetResolution["status"], code: string, field: string, message: string): never => {
    result.status = status; issue(code, "error", field, message); throw new CalculationStopped();
  };
  const required = (v: unknown, field: string, min = 0, exclusive = false): number => {
    if (v == null) return stop("needs_input", "INPUT_REQUIRED", field, `请填写${inputLabel(field)}。`);
    if (typeof v !== "number" || !Number.isFinite(v) || (exclusive ? v <= min : v < min)) return stop("infeasible", "INVALID_NUMBER", field, `${inputLabel(field)}必须是${exclusive ? "大于" : "不小于"} ${min} 的有限数字。`);
    return v;
  };
  const textRequired = (v: unknown, field: string) => {
    if (typeof v !== "string" || !v.trim() || v.length > 200) stop("needs_input", "SOURCE_REQUIRED", field, `请填写有效的${inputLabel(field)}（不超过200字）。`);
  };
  const date = (v: unknown, field: string): string => {
    if (v == null || v === "") return stop("needs_input", "DATE_REQUIRED", field, `请填写${inputLabel(field)}。`);
    try { if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(); Temporal.PlainDate.from(v); }
    catch { return stop("infeasible", "INVALID_DATE", field, `${inputLabel(field)}无效。`); }
    return v as string;
  };
  const trace = (stepId: string, formulaId: string, refs: string[], raw: number, resolved: number, unit: "kcal" | "g" | "kg", reason: string) => {
    required(raw, stepId); required(resolved, stepId);
    result.trace.push({ stepId, formulaId, inputRefs: refs, rawValue: raw, resolvedValue: resolved, unit, reason });
  };
  try {
    if (!body || !policy || typeof body !== "object" || typeof policy !== "object") stop("needs_input", "INPUT_REQUIRED", "body/policy", "请提供策略和身体输入快照。");
    const scope = body.scope;
    if (scope && (typeof scope.adultAttested !== "boolean" || Object.entries(scope).some(([, flag]) => flag !== undefined && typeof flag !== "boolean"))) stop("infeasible", "INVALID_SCOPE", "body.scope", "适用性标志必须明确为是或否。");
    if ((typeof body.ageYears === "number" && body.ageYears >= 0 && body.ageYears < 18) || scope?.excluded || scope?.pregnantOrLactating || scope?.specialNutritionTherapy || scope?.eatingDisorder) {
      stop("out_of_scope", "OUTSIDE_ADULT_SCOPE", "body.scope", "超出一般成人自助推荐范围。仍可保存真实摄入或查看已有外部方案。");
    }
    // Check even inactive numeric fields: invalid inputs must not be silently coerced or saved.
    const scan = (v: unknown, path: string, depth = 0): void => {
      if (depth > 16) stop("infeasible", "INVALID_DOCUMENT", path, "输入嵌套过深。");
      if (typeof v === "number" && !Number.isFinite(v)) stop("infeasible", "INVALID_NUMBER", path, `${path} 不是有限数字。`);
      if (typeof v === "string" && v.length > 500) stop("infeasible", "INVALID_DOCUMENT", path, "输入文本过长。");
      if (v && typeof v === "object") {
        if (Object.keys(v).length > 366) stop("infeasible", "INVALID_DOCUMENT", path, "输入条目过多。");
        Object.entries(v).forEach(([k, child]) => scan(child, `${path}.${k}`, depth + 1));
      }
    };
    scan(policy, "policy"); scan(body, "body");
    const methods = { rmr: ["mifflin_st_jeor", "cunningham_1980", "measured", "not_used"], tdee: ["pal_total", "non_exercise_plus_planned", "manual", "not_used"], energy: ["preset_percent", "percent", "delta_kcal", "fixed_kcal", "from_macros"], protein: ["body_weight", "ffm", "reference_weight", "fixed_grams"], fat: ["body_weight", "energy_share", "fixed_grams"], carbs: ["residual", "fixed_grams"] };
    for (const key of Object.keys(methods) as Array<keyof typeof methods>) {
      if (!policy[key]) stop("needs_input", "METHOD_REQUIRED", `policy.${key}`, "请明确选择计算方法。");
      if (!methods[key].includes(policy[key].kind)) stop("infeasible", "INVALID_METHOD", `policy.${key}`, "不支持的计算方法，不能静默忽略或回退。");
      for (const [field, value] of Object.entries(policy[key])) {
        if (["kcal", "grams", "coefficient", "weightKg", "multiplier", "cycleDays", "share", "minimumEnergyShare", "deltaRatio", "deltaKcal"].includes(field) && value != null) required(value, `${key}.${field}`, field.startsWith("delta") ? -Infinity : 0);
      }
    }
    for (const [field, allowed] of Object.entries({ recovery: ["unknown", "stable", "concern"], weightSource: ["manual", "confirmed", "seven_day_mean"], ageSource: ["confirmed_years", "birth_date"], calculationSex: ["male", "female"], ffmInput: ["body_fat", "direct"] })) {
      const value = (body as unknown as Record<string, unknown>)[field];
      if (value != null && !allowed.includes(value as string)) stop("infeasible", "INVALID_SOURCE", `body.${field}`, "输入来源或背景选项无效，请重新选择。");
    }
    if (policy.schemaVersion !== 1 || policy.policyVersion !== "nutrition-goals-v5.0" || policy.presetVersion !== 1 || policy.refreshMode !== "preview_then_confirm"
      || ![...Object.keys(goalPresets), "custom"].includes(policy.presetId)) stop("infeasible", "UNSUPPORTED_VERSION", "policy", "不支持此策略版本；请保留原始数据，勿覆盖保存。");
    if (typeof policy.presetDeltaRatio !== "number" || !Number.isFinite(policy.presetDeltaRatio)) stop("infeasible", "INVALID_NUMBER", "policy.presetDeltaRatio", "预设偏移须保存为明确数字，0有效。");
    if (policy.originPreset != null && (!(policy.originPreset in goalPresets) || policy.presetId !== "custom")) stop("infeasible", "INVALID_PRESET_ORIGIN", "policy.originPreset", "只有自定义策略可以保留有效的起始场景。");
    if (policy.presetId === "custom" && policy.energy.kind === "preset_percent") stop("infeasible", "CUSTOM_ENERGY_METHOD_REQUIRED", "policy.energy", "自定义需要明确百分比、热量差、固定能量或宏量优先策略。");
    if (policy.presetId !== "custom") {
      const preset = goalPresets[policy.presetId];
      if (policy.presetDeltaRatio !== preset.energyDeltaRatio || policy.protein.kind !== "body_weight" || policy.protein.coefficient !== preset.proteinPerKg
        || policy.fat.kind !== "body_weight" || policy.fat.coefficient !== preset.fatPerKg
        || (policy.energy.kind !== "preset_percent" && !(policy.energy.kind === "percent" && policy.energy.deltaRatio === preset.energyDeltaRatio))) stop("infeasible", "PRESET_OVERRIDE_REQUIRES_CUSTOM", "policy.presetId", "公式参数已偏离该版本场景默认，请标为自定义并保留起始场景。");
    }
    const calculationDate = date(body.calculationDate, "body.calculationDate");
    try { if (!body.timeZone || /^[+-]/.test(body.timeZone)) throw new Error(); new Intl.DateTimeFormat("en", { timeZone: body.timeZone }).format(0); }
    catch { stop("infeasible", "INVALID_TIMEZONE", "body.timeZone", "请使用有效的 IANA 时区。"); }
    for (const key of ["weightKg", "heightCm", "ageYears", "bodyFatPct", "bodyFatWeightKg", "ffmKg"] as const) {
      if (body[key] != null) required(body[key], `body.${key}`, 0, key !== "ageYears" && key !== "bodyFatPct");
    }
    if (body.bodyFatPct != null && body.bodyFatPct >= 100) stop("infeasible", "INVALID_NUMBER", "body.bodyFatPct", "体脂率须在0至100%之间，且去脂体重大于0。");
    if (body.ageYears != null && !Number.isInteger(body.ageYears)) stop("infeasible", "INVALID_NUMBER", "body.ageYears", "当前周岁须为整数，或填写完整出生日期。");
    if (body.weightSource === "seven_day_mean") {
      const dates = body.weightDates;
      if (!dates || new Set(dates).size !== dates.length || dates.length < 4 || dates.length > 7
        || dates.some(d => Temporal.PlainDate.from(date(d, "body.weightDates")).until(Temporal.PlainDate.from(calculationDate)).days > 6)) stop("needs_input", "WEIGHT_WINDOW_REQUIRED", "body.weightDates", "7日均重需要最近7天至少4个不同日期的已确认晨重。");
    }
    let age = body.ageYears;
    if (body.birthDate) {
      date(body.birthDate, "body.birthDate");
      age = Temporal.PlainDate.from(body.birthDate).until(Temporal.PlainDate.from(calculationDate), { largestUnit: "years" }).years;
      if (age < 0) stop("infeasible", "INVALID_DATE", "body.birthDate", "出生日期晚于计算日期。");
      if (age < 18) stop("out_of_scope", "OUTSIDE_ADULT_SCOPE", "body.birthDate", "未成年人不启用普通成人自动推荐。");
      if (body.ageYears != null && body.ageYears !== age) stop("infeasible", "AGE_CONFLICT", "body.ageYears", "周岁与出生日期不一致，请确认。");
    }
    for (const key of ["bodyFatMeasuredOn", "ffmMeasuredOn"] as const) if (body[key] != null && date(body[key], `body.${key}`) > calculationDate) stop("infeasible", "FUTURE_MEASUREMENT", `body.${key}`, "不能用未来体测计算过去计划。");
    if (body.weightDates?.some(d => date(d, "body.weightDates") > calculationDate)) stop("infeasible", "FUTURE_MEASUREMENT", "body.weightDates", "不能使用未来体重。");
    if (body.ffmKg != null && body.weightKg != null && body.ffmKg > body.weightKg) stop("infeasible", "INVALID_FFM", "body.ffmKg", "去脂体重不能大于所用体重。");
    const energyStep = required(policy.rounding?.autoEnergyStepKcal, "rounding.autoEnergyStepKcal", 0, true);
    const proteinStep = required(policy.rounding?.autoProteinStepG, "rounding.autoProteinStepG", 0, true);
    const fatStep = required(policy.rounding?.autoFatStepG, "rounding.autoFatStepG", 0, true);
    if (energyStep !== 25 || proteinStep !== 5 || fatStep !== 5) stop("infeasible", "UNSUPPORTED_ROUNDING", "policy.rounding", "v5.0 的自动取整规则为25kcal/5g/5g，请升级规则版本后再改变。");
    const weight = () => required(body.weightKg, "body.weightKg", 0, true);
    const ffm = () => {
      if (result.rawValues.ffmKg != null) return result.rawValues.ffmKg;
      const direct = body.ffmInput === "direct" || (body.ffmInput == null && body.ffmKg != null && body.bodyFatPct == null);
      if (body.ffmInput == null && body.ffmKg != null && body.bodyFatPct != null) stop("needs_input", "FFM_SOURCE_REQUIRED", "body.ffmInput", "直接FFM与体脂法只能选一个主要来源。");
      if ((!direct && body.bodyFatPct == null) || (direct && body.ffmKg == null)) stop("needs_input", "FFM_REQUIRED", "body.ffmInput", "所选方法需要体脂率或直接FFM，不能默认25%体脂。");
      const measuredOn = direct ? body.ffmMeasuredOn : body.bodyFatMeasuredOn;
      const label = direct ? body.ffmSourceLabel : body.bodyFatSource;
      const pairedWeight = direct ? weight() : required(body.bodyFatWeightKg, "body.bodyFatWeightKg", 0, true);
      const amount = direct ? required(body.ffmKg, "body.ffmKg", 0, true) : pairedWeight * (1 - required(body.bodyFatPct, "body.bodyFatPct") / 100);
      if (amount <= 0 || amount > pairedWeight) stop("infeasible", "INVALID_FFM", "body.ffmKg", "去脂体重与配对体重不一致。");
      date(measuredOn, direct ? "body.ffmMeasuredOn" : "body.bodyFatMeasuredOn");
      textRequired(label, direct ? "body.ffmSourceLabel" : "body.bodyFatSource");
      const days = Temporal.PlainDate.from(measuredOn!).until(Temporal.PlainDate.from(calculationDate)).days;
      if (days > nutritionRules.ffmFreshDays) issue("STALE_FFM", "review", "body.ffmInput", `FFM测量距计算日超过${nutritionRules.ffmFreshDays}天（产品复核规则），请重新确认。`);
      if (!direct && body.weightKg != null && Math.abs(pairedWeight - body.weightKg) / body.weightKg > 0.05) issue("FFM_WEIGHT_MISMATCH", "review", "body.bodyFatWeightKg", "配对体重与计算体重相差超过5%，请确认测量口径。");
      if (body.ffmKg != null && body.bodyFatPct != null && body.bodyFatWeightKg != null && Math.abs(body.ffmKg - body.bodyFatWeightKg * (1 - body.bodyFatPct / 100)) > pairedWeight * 0.05) issue("FFM_SOURCES_CONFLICT", "review", "body.ffmInput", "直接FFM与体脂推算相差超过配对体重的5%（产品复核规则），请核对来源。");
      result.assumptions.push(`FFM来源：${label}；${measuredOn}，配对体重 ${pairedWeight} kg。BIA及预测公式存在个体误差。`);
      result.rawValues.ffmKg = amount;
      trace("ffm", direct ? "DIRECT_FFM" : "WEIGHT_BODY_FAT", direct ? ["body.ffmKg", "body.ffmMeasuredOn", "body.ffmSourceLabel"] : ["body.bodyFatWeightKg", "body.bodyFatPct", "body.bodyFatMeasuredOn"], amount, amount, "kg", direct ? "直接FFM，不用骨骼肌量替代" : "配对体重 × (1 − 体脂率/100)");
      return amount;
    };
    const e = policy.energy, p = policy.protein, f = policy.fat, c = policy.carbs, t = policy.tdee, r = policy.rmr;
    if (!e || !p || !f || !c || !t || !r) stop("needs_input", "METHOD_REQUIRED", "policy", "请明确选择能量、蛋白、脂肪、碳水和消耗来源。");
    const isManualEnergy = e.kind === "fixed_kcal" || e.kind === "from_macros";
    if (e.kind === "from_macros" ? p.kind !== "fixed_grams" || f.kind !== "fixed_grams" || c.kind !== "fixed_grams" : c.kind !== "residual") stop("infeasible", "OVERDETERMINED_TARGET", "policy.energy", "选择能量优先（E/P/F可控，C派生）或宏量优先（P/F/C固定，E派生）。");
    const tRecord = t as unknown as Record<string, unknown>;
    const pRecord = policy as unknown as Record<string, unknown>;
    if (t.kind === "pal_total" && (t.includesExercise !== true || tRecord.exerciseKcal != null || tRecord.netExercise != null || pRecord.exerciseKcal != null)) stop("infeasible", "DOUBLE_COUNTED_EXERCISE", "policy.tdee", "总活动系数已含训练，不能再添加运动消耗。");
    if (!isManualEnergy) {
      if (t.kind === "manual") {
        result.expenditure.tdeeKcal = required(t.kcal, "tdee.kcal", 0, true);
        if (!["user_estimate", "observational", "measured_total"].includes(t.source)) stop("needs_input", "SOURCE_REQUIRED", "tdee.source", "请说明TDEE来源。");
        if (t.assessedOn && date(t.assessedOn, "tdee.assessedOn") > calculationDate) stop("infeasible", "INVALID_DATE", "tdee.assessedOn", "TDEE来源日期不能晚于计算日期。");
        result.assumptions.push(`TDEE为用户提供的${t.source}，不是目标摄入，也不自动代表精准测定。`);
      } else {
        let rmr: number;
        if (r.kind === "mifflin_st_jeor") {
          const a = required(age, "body.ageYears"), h = required(body.heightCm, "body.heightCm", 0, true);
          if (body.calculationSex !== "male" && body.calculationSex !== "female") stop("needs_input", "CALCULATION_SEX_REQUIRED", "body.calculationSex", "请明确选择MSJ公式计算分支。");
          rmr = 10 * weight() + 6.25 * h - 5 * a + (body.calculationSex === "male" ? 5 : -161);
          trace("rmr", "MSJ_1990", ["body.weightKg", "body.heightCm", "body.ageYears", "body.calculationSex"], rmr, rmr, "kcal", `10×W + 6.25×H − 5×A ${body.calculationSex === "male" ? "+ 5" : "− 161"}；预测而非测量`);
        } else if (r.kind === "cunningham_1980") {
          rmr = 500 + 22 * ffm(); trace("rmr", "CUNNINGHAM_1980", ["ffm"], rmr, rmr, "kcal", "500 + 22×FFM；以可用FFM近似文献LBM，不保证比MSJ更准确");
        } else if (r.kind === "measured") {
          rmr = required(r.kcal, "rmr.kcal", 0, true); textRequired(r.sourceLabel, "rmr.sourceLabel");
          if (date(r.measuredOn, "rmr.measuredOn") > calculationDate) stop("infeasible", "INVALID_DATE", "rmr.measuredOn", "测量日期不能晚于计算日期。");
          trace("rmr", "MEASURED_RMR", ["policy.rmr"], rmr, rmr, "kcal", `录入来源：${r.sourceLabel}（${r.measuredOn}）；录入方式本身不证明实测`);
        } else stop("needs_input", "RMR_REQUIRED", "policy.rmr", "此TDEE方法需要静息消耗来源，或改用手动TDEE/每日能量。");
        result.expenditure.rmrKcal = required(rmr!, "rmr", 0, true);
        if (t.kind === "pal_total") {
          const multiplier = required(t.multiplier, "tdee.multiplier", 0, true);
          result.expenditure.tdeeKcal = rmr! * multiplier;
          result.assumptions.push("总活动系数包含日常活动与通常训练；不再加运动或食物热效应。");
          if (multiplier < 1.2 || multiplier > 2.5) issue("ACTIVITY_REVIEW", "review", "policy.tdee.multiplier", "总活动系数超出本版参考档，请确认实际口径；未截断数值。");
        } else if (t.kind === "non_exercise_plus_planned") {
          const days = required(t.cycleDays, "tdee.cycleDays", 0, true), multiplier = required(t.multiplier, "tdee.multiplier", 0, true);
          if (!Number.isInteger(days) || !Array.isArray(t.netExercise)) stop("infeasible", "INVALID_CYCLE", "policy.tdee", "周期天数须为正整数，运动须为明确事件列表。");
          if (t.netConfirmed !== true) stop("needs_input", "NET_EXERCISE_CONFIRMATION_REQUIRED", "policy.tdee.netConfirmed", "请确认净运动消耗口径；未知不能默认0。");
          if (new Set(t.netExercise.map(x => x.id)).size !== t.netExercise.length || t.netExercise.some(x => typeof x.id !== "string" || !x.id)) stop("infeasible", "DUPLICATE_EXERCISE", "policy.tdee.netExercise", "运动事件标识为空或重复，不能重复计入。");
          const average = t.netExercise.reduce((sum, x) => sum + required(x.kcal, `exercise.${x.id}.kcal`), 0) / days;
          result.rawValues.averageExerciseKcalPerDay = average;
          result.expenditure.tdeeKcal = rmr! * multiplier + average;
          result.assumptions.push(`非运动系数不含计划训练；周期${days}天的净运动合计除以${days}，不使用当天实际运动上调目标。`);
          if (multiplier < 1 || multiplier > 2.5) issue("ACTIVITY_REVIEW", "review", "policy.tdee.multiplier", "非运动系数超出本版参考档，请核对。");
        } else stop("needs_input", "TDEE_REQUIRED", "policy.tdee", "此能量策略需要TDEE，或改用固定每日能量。");
      }
      required(result.expenditure.tdeeKcal, "tdee", 0, true);
      trace("tdee", t.kind.toUpperCase(), ["rmr", "policy.tdee"], result.expenditure.tdeeKcal!, result.expenditure.tdeeKcal!, "kcal", t.kind === "manual" ? "用户提供的TDEE" : t.kind === "pal_total" ? "RMR × 总活动系数" : "RMR × 非运动系数 + 周期日均净运动");
    } else { result.expenditure.source = "not_used"; result.assumptions.push("固定能量/宏量优先未使用RMR、TDEE及其旧参数；消耗未知不记作0。"); }
    let energy: number;
    if (e.kind === "fixed_kcal") energy = required(e.kcal, "energy.kcal", 0, true);
    else if (e.kind === "from_macros" && p.kind === "fixed_grams" && f.kind === "fixed_grams" && c.kind === "fixed_grams") energy = 4 * required(p.grams, "protein.grams") + 9 * required(f.grams, "fat.grams") + 4 * required(c.grams, "carbs.grams");
    else {
      const tdee = result.expenditure.tdeeKcal!;
      const delta = e.kind === "preset_percent" ? policy.presetDeltaRatio : e.kind === "percent" ? e.deltaRatio : e.kind === "delta_kcal" ? e.deltaKcal / tdee : undefined;
      if (typeof delta !== "number" || !Number.isFinite(delta)) stop("infeasible", "INVALID_NUMBER", "policy.energy", "请选择有效能量策略；0偏移有效。");
      result.rawValues.rawEnergyKcal = tdee * (1 + delta!);
      energy = roundToStep(required(result.rawValues.rawEnergyKcal, "energy", 0, true), energyStep);
      if (delta! < -nutritionRules.maxDeficitShare || delta! > nutritionRules.maxSurplusShare) issue("ENERGY_DELTA_REVIEW", "review", "policy.energy", "缺口超过25%或盈余超过15%（产品复核阈值），请复核。");
    }
    required(energy!, "energy", 0, true);
    result.rawValues.rawEnergyKcal ??= energy!;
    if (result.expenditure.tdeeKcal != null) { result.rawValues.energyDeltaKcal = energy! - result.expenditure.tdeeKcal; result.rawValues.energyDeltaRatio = energy! / result.expenditure.tdeeKcal - 1; }
    trace("energy", e.kind.toUpperCase(), ["tdee", "policy.energy"], result.rawValues.rawEnergyKcal, energy!, "kcal", isManualEnergy ? "手动值或宏量派生，保留精度，不叠加旧校准" : `先按所选偏移计算，再取最近${energyStep}kcal，正半入`);
    let rawProtein: number;
    if (p.kind === "fixed_grams") rawProtein = required(p.grams, "protein.grams");
    else if (p.kind === "body_weight") rawProtein = weight() * required(p.coefficient, "protein.coefficient", 0, true);
    else if (p.kind === "ffm") { if (p.contextConfirmed !== true) stop("needs_input", "FFM_CONTEXT_REQUIRED", "protein.contextConfirmed", "请确认较瘦、抗阻训练且限制能量的背景。"); rawProtein = ffm() * required(p.coefficient, "protein.coefficient", 0, true); }
    else if (p.kind === "reference_weight") { textRequired(p.sourceLabel, "protein.sourceLabel"); rawProtein = required(p.weightKg, "protein.weightKg", 0, true) * required(p.coefficient, "protein.coefficient", 0, true); }
    else stop("infeasible", "INVALID_METHOD", "policy.protein", "蛋白方法无效。");
    const protein = p.kind === "fixed_grams" ? rawProtein! : roundToStep(rawProtein!, proteinStep);
    result.rawValues.rawProteinG = rawProtein!;
    trace("protein", p.kind.toUpperCase(), ["body.weightKg", "ffm", "policy.protein"], rawProtein!, protein, "g", p.kind === "fixed_grams" ? "手动锁定，不自动取整" : `所选体重口径 × 系数，再取最近${proteinStep}g`);
    let rawFat: number, selectedFat: number;
    result.rawValues.fatFloorApplied = false;
    if (f.kind === "fixed_grams") rawFat = selectedFat = required(f.grams, "fat.grams");
    else if (f.kind === "energy_share") {
      const share = required(f.share, "fat.share", 0, true);
      if (share > 1) stop("infeasible", "INVALID_NUMBER", "fat.share", "脂肪供能份额不能超过100%。");
      rawFat = selectedFat = energy! * share / 9;
      if (share < 0.2 || share > 0.35) issue("FAT_SHARE_REVIEW", "review", "policy.fat.share", "脂肪百分比超出本版20%–35%基础可选范围，请以自定义方案复核。");
    } else if (f.kind === "body_weight") {
      if (f.minimumEnergyShare !== 0.2) stop("infeasible", "INVALID_FAT_FLOOR", "fat.minimumEnergyShare", "v5普通规则使用明确的20%供能检查，不静默修改规则。");
      rawFat = weight() * required(f.coefficient, "fat.coefficient", 0, true);
      result.rawValues.fatEnergyFloorG = 0.2 * energy! / 9;
      selectedFat = Math.max(rawFat, result.rawValues.fatEnergyFloorG);
      result.rawValues.fatFloorApplied = selectedFat > rawFat;
      trace("fat_floor", "PRODUCT_FAT_20_PERCENT", ["energy", "policy.fat"], rawFat, selectedFat, "g", `max(体重×系数, 0.20×E/9)；20%是产品配餐规则，不是医学最低需要量`);
    } else stop("infeasible", "INVALID_METHOD", "policy.fat", "脂肪方法无效。");
    const fat = f.kind === "fixed_grams" ? selectedFat! : ceilToStep(selectedFat!, fatStep);
    result.rawValues.rawFatG = rawFat!;
    trace("fat", f.kind.toUpperCase(), ["energy", "body.weightKg", "policy.fat"], rawFat!, fat, "g", f.kind === "fixed_grams" ? "手动锁定，不补到20%，不取整" : `所选脂肪向上取整到${fatStep}g；实际供能比例按最终结果计算`);
    const carbs = e.kind === "from_macros" && c.kind === "fixed_grams" ? required(c.grams, "carbs.grams") : (energy! - 4 * protein - 9 * fat) / 4;
    if (carbs < 0) stop("infeasible", "MACROS_EXCEED_ENERGY", "policy.energy", `蛋白和脂肪超过总能量 ${4 * protein + 9 * fat - energy!} kcal。请调整E/P/F，不会抬高E或将碳水截零。`);
    trace("carbs", e.kind === "from_macros" ? "FIXED_GRAMS" : "RESIDUAL_449", ["energy", "protein", "fat"], carbs, carbs, "g", e.kind === "from_macros" ? "宏量优先的手动碳水" : "(E − 4P − 9F) / 4；内部不再取整");
    if (Math.abs(energy! - (4 * protein + 9 * fat + 4 * carbs)) > 1e-6) stop("infeasible", "ENERGY_MISMATCH", "policy", "宏量与能量不一致。");
    const target = { kcal: energy!, protein, fat, carbs };
    result.candidateTarget = target;
    if (!scope?.adultAttested) issue("ADULT_SCOPE_CONFIRMATION_REQUIRED", "review", "body.scope.adultAttested", "可查看预览；启用前请确认适用于一般成人营养计划。");
    if (!isManualEnergy && energy! <= nutritionRules.lowAutomaticEnergy) issue("LOW_ENERGY_POLICY_REVIEW", "review", "policy.energy", "自动目标≤1200kcal，需复核。1200是产品阈值，不是通用安全线，未自动抬高。");
    if (carbs === 0) issue("ZERO_CARBS_REVIEW", "review", "policy.carbs", "零碳水虽数学可行，超出本版普通均衡训练预设。");
    if (p.kind !== "fixed_grams" && protein > nutritionRules.highAutomaticProtein) issue("HIGH_PROTEIN_REVIEW", "review", "policy.protein", "自动蛋白超过300g，请复核或使用专业确认的参考体重；未裁剪结果。");
    if (body.heightCm && body.weightKg) {
      const bmi = body.weightKg / (body.heightCm / 100) ** 2;
      if (bmi < nutritionRules.lowBmi) issue("LOW_BMI_REVIEW", "review", "body.weightKg", "BMI<18.5，先确认适用性，不直接自动推荐增肌或进一步减脂。BMI仅用于筛查。");
      if (bmi >= nutritionRules.highBmi) issue("HIGH_BMI_CONTEXT", protein > 300 && p.kind === "body_weight" ? "review" : "warning", "body.weightKg", "BMI≥35，请结合肌肉量和蛋白结果复核，BMI本身不作诊断。");
    }
    if (scope?.unexplainedWeightLoss || scope?.enduranceOrCompetitive) issue("SPECIAL_CONTEXT_REVIEW", "review", "body.scope", "存在不明原因消瘦或专项竞技/耐力背景，基础预设可能不适合。");
    if (body.recovery === "concern") issue("RECOVERY_REVIEW", "review", "body.recovery", "持续疲劳或恢复负担，先保留原目标并复核，不主动扩大缺口。");
    if (!body.recovery || body.recovery === "unknown") result.assumptions.push("恢复状态未知，不代表恢复良好。");
    const fatShare = fat * 9 / energy!;
    if (fatShare < 0.2 || fatShare > 0.35) issue("FAT_SHARE_CONTEXT", "warning", "policy.fat", "脂肪供能低于20%或高于35%，结合背景复核；比例本身不等于危险，固定值未改动。");
    if (protein * 4 / energy! > 0.35) issue("PROTEIN_SHARE_CONTEXT", "warning", "policy.protein", "蛋白供能超过35%，这是参考提示，不是单独的安全判断。");
    if (body.weightKg && carbs / body.weightKg < 2) issue("CARB_TRAINING_CONTEXT", "warning", "policy.carbs", "碳水低于2g/kg，结合训练与表现复核；不会自动抬高摄入。");
    if (result.expenditure.rmrKcal != null && energy! < result.expenditure.rmrKcal) issue("BELOW_ESTIMATED_RMR", "warning", "policy.energy", "目标低于预测RMR，结合缺口、体型及恢复复核，不能单凭这一点判断安全性。");
    result.status = result.issues.some(x => x.severity === "review") ? "requires_review" : "valid";
    if (result.status === "valid") result.resolvedTarget = target;
    result.inputFingerprint = nutritionInputFingerprint({ policy, body });
  } catch (error) {
    if (!(error instanceof CalculationStopped)) { result.status = "infeasible"; issue("INVALID_NUMBER", "error", "input", "输入格式或计算结果无效，请检查所选方法与数值。"); }
  }
  return result;
}

class CalculationStopped extends Error {}
