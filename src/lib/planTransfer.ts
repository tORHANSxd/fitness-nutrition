import { attachFoodSnapshots } from "@/lib/foodSnapshots";
import { assertDocument, planDocumentVersion, record, UnsupportedDocumentError } from "@/lib/planProtocol";
import { parseSavedPlanRow } from "@/lib/storageDocuments";
import type { FoodItem, MealPlan, NutritionResult, UserProfile } from "@/lib/types";

/** 仅由用户主动下载/选取；无网络传输，不携带账户凭据。 */
export function exportPlanDocument(profile: UserProfile, meals: MealPlan[], result: NutritionResult, foods: ReadonlyMap<string, FoodItem>): string {
  const document = { format: "nutritrain-plan", version: 1, plan: {
    id: "import-preview", plan_date: profile.planDate, profile, meals: attachFoodSnapshots(meals, foods), result,
    schema_version: planDocumentVersion(profile, meals), algorithm_version: profile.protocolSnapshot?.nutrition?.result.algorithmVersion ?? "tre-rpt-v4", integrity_flags: [],
  } };
  assertDocument(document);
  parseSavedPlanRow(document.plan);
  return JSON.stringify(document, null, 2);
}

export function importPlanDocument(text: string) {
  if (new TextEncoder().encode(text).byteLength > 262144) throw new Error("计划文件超过 256 KiB，未导入。");
  const raw: unknown = JSON.parse(text);
  assertDocument(raw);
  const document = record(raw);
  if (document.format !== "nutritrain-plan" || document.version !== 1) throw new UnsupportedDocumentError("不支持的计划文件版本，原文件和当前计划保持不变。", raw);
  return parseSavedPlanRow(record(document.plan));
}
