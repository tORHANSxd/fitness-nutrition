import { describe, expect, it } from "vitest";
import { csvToFoodForms, foodsToCsv, jsonToFoodForms, parseCsv, toCsv } from "@/lib/dataIO";
import type { FoodItem } from "@/lib/types";

const sampleFood: FoodItem = {
  id: "x1",
  name: "鸡胸肉, 熟",
  category: "肉类",
  kcalPer100g: 165,
  fatPer100g: 3.6,
  carbsPer100g: 0,
  proteinPer100g: 31,
  weightBasis: "cooked",
  cookedRawRatio: null,
  source: "user"
};

describe("CSV 基础序列化/解析", () => {
  it("含逗号/引号的字段被正确转义并还原", () => {
    const rows = [
      ["name", "note"],
      ['鸡胸肉, 熟', '他说"很好"']
    ];
    const csv = toCsv(rows);
    expect(parseCsv(csv)).toEqual(rows);
  });

  it("忽略全空行", () => {
    expect(parseCsv("a,b\r\n\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"]
    ]);
  });
});

describe("食物 CSV 往返", () => {
  it("foodsToCsv → csvToFoodForms 保留核心字段", () => {
    const csv = foodsToCsv([sampleFood]);
    const { foods, skipped } = csvToFoodForms(csv);
    expect(skipped).toBe(0);
    expect(foods).toHaveLength(1);
    expect(foods[0].name).toBe("鸡胸肉, 熟");
    expect(foods[0].category).toBe("肉类");
    expect(foods[0].proteinPer100g).toBe(31);
    expect(foods[0].weightBasis).toBe("cooked");
    expect(foods[0].cookedRawRatio).toBeNull();
  });

  it("缺名行被跳过计数", () => {
    const csv = "name,category,proteinPer100g\r\n,肉类,10\r\n牛肉,肉类,26";
    const { foods, skipped } = csvToFoodForms(csv);
    expect(skipped).toBe(1);
    expect(foods).toHaveLength(1);
    expect(foods[0].name).toBe("牛肉");
  });

  it("未知分类回退为主食", () => {
    const { foods } = csvToFoodForms("name,category\r\n糙米,谷物");
    expect(foods[0].category).toBe("主食");
  });
});

describe("食物 JSON 解析", () => {
  it("接受 FoodItem 数组", () => {
    const { foods } = jsonToFoodForms(JSON.stringify([sampleFood]));
    expect(foods[0].name).toBe("鸡胸肉, 熟");
  });

  it("接受 {foods:[...]} 包裹", () => {
    const { foods } = jsonToFoodForms(JSON.stringify({ foods: [sampleFood] }));
    expect(foods).toHaveLength(1);
  });

  it("非法 JSON 返回空", () => {
    expect(jsonToFoodForms("{not json").foods).toHaveLength(0);
  });
});
