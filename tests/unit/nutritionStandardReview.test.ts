import { expect, it } from "vitest";
import { reviewProgress } from "@/lib/progressReview";
import { createTreProtocol } from "@/lib/planPresets";
import { addDays } from "@/lib/dateTime";
import { mapBodyLogRow, bodyLogToRow } from "@/lib/bodyLogs";
import { parseDailyCheckinActual } from "@/lib/storageDocuments";

const protocol = createTreProtocol({ id: "66666666-6666-4666-8666-666666666666", effectiveFrom: "2030-01-01", cycleAnchorDate: "2030-01-01", timeZone: "Asia/Shanghai" });
it("未确认晨重不进入热量调整，降低客户端阈值不能绕过4次晨重", () => {
  const logs = Array.from({ length: 21 }, (_, i) => ({ logDate: addDays("2030-01-01", i), weightKg: 80 }));
  const result = reviewProgress({ ...protocol, reviewRules: { ...protocol.reviewRules, minWeightsPerWeek: 1 } }, "2030-01-21", logs, []);
  expect(result.windows.every(w => w.weightSamples === 0)).toBe(true);
  expect(result.status).toBe("insufficient_data");
  expect(result.reasons.join()).toContain("4");
  expect(bodyLogToRow("owner", { logDate: "2030-01-01", weightKg: 80, morningWeightConfirmed: true }).morning_weight_confirmed).toBe(true);
  expect(mapBodyLogRow({ plan_date: "2030-01-01", weight_kg: 80 }).morningWeightConfirmed).toBeNull();
});
it("旧默认睡眠/步数0表示未知；明确填写的0保留，不把负值变为0", () => {
  const missing = parseDailyCheckinActual({ version: 1, foods: [], exercises: [], bmrKcal: 0, activityKcal: 0 }, { sleep_hours: 0, steps: 0 }, "2030-01-01");
  expect(missing.habits?.sleepHours).toBeUndefined();
  expect(missing.habits?.steps).toBeUndefined();
  const explicit = parseDailyCheckinActual({ version: 2, foods: [], exercises: [], bmrKcal: 0, activityKcal: 0, habits: { sleepHours: 0, steps: -2 } }, {}, "2030-01-01");
  expect(explicit.habits?.sleepHours).toBe(0);
  expect(explicit.habits?.steps).toBeUndefined();
});
