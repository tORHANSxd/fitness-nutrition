import { describe, expect, it } from "vitest";
import { builtinFoods } from "@/lib/foods";
import {
  isReferenceFood,
  publicFoodReplacements,
  selectableFoodCatalog,
} from "@/lib/foodCatalog";

describe("公共目录的来源选择", () => {
  it("已核对的重复食品仅展示成分表版本，旧编号仍可读取", () => {
    const available = selectableFoodCatalog(builtinFoods);
    for (const [oldId, canonicalId] of Object.entries(publicFoodReplacements)) {
      expect(available.some((food) => food.id === oldId)).toBe(false);
      expect(available.some((food) => food.id === canonicalId)).toBe(true);
      expect(builtinFoods.some((food) => food.id === oldId)).toBe(true);
    }
  });
  it("默认筛选不含成分表食品，不把熟虾仁和原料虾仁合并", () => {
    const available = selectableFoodCatalog(builtinFoods, false);
    expect(available.some(isReferenceFood)).toBe(false);
    expect(available.some((food) => food.id === "public-shrimp-cooked")).toBe(
      true,
    );
  });
  it("自建食物优先且同名食物、个人修改不会被公共数据覆盖", () => {
    const personal = {
      ...builtinFoods[0],
      id: "my-rice",
      source: "user" as const,
    };
    const override = { ...builtinFoods[0], isUserOverride: true };
    const available = selectableFoodCatalog([
      ...builtinFoods.filter((f) => f.id !== override.id),
      personal,
      override,
    ]);
    expect(available[0]).toBe(personal);
    expect(available).toContain(override);
  });
});
