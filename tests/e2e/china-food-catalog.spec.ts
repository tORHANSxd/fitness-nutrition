import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login, manualGoal } from "./ui-helpers";

test("food search, pagination, personal override and saved snapshot @a11y", async ({ page, request }, testInfo) => {
  test.setTimeout(120000);
  const fixture = "http://127.0.0.1:45432";
  await request.post(fixture + "/fixture/reset");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = async () => (await request.get(fixture + "/fixture/state")).json();
  await login(page);
  await page.goto("/resources?tab=foods");
  const library = page.getByRole("main");
  const pagination = library.getByRole("navigation", { name: "食物列表分页" });
  // The catalog hides 10 confirmed duplicates from the 1,381 available foods.
  await expect(pagination).toContainText("共 1371 条 · 第 1 / 115 页");
  await expect(library.getByRole("listitem")).toHaveCount(12);
  await pagination.getByRole("button", { name: "下一页" }).click();
  await expect(pagination).toContainText("第 2 / 115 页");
  await library.getByLabel("搜索食物", { exact: true }).fill("031101");
  await expect(library.getByRole("listitem")).toHaveCount(1);
  const soy = library.getByRole("listitem").filter({ hasText: "黄豆［大豆］" });
  await expect(soy).toContainText("碳 18.7 · 蛋 35 · 脂 16 g");
  await expect(pagination).toHaveCount(0);
  await soy.screenshot({ path: testInfo.outputPath("food-catalog-soybean.png") });
  expect(await page.locator("body").evaluate((body) => body.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""))).toEqual([]);

  await soy.getByRole("button", { name: "编辑黄豆［大豆］", exact: true }).click();
  const editor = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "编辑食物", exact: true }) });
  await editor.getByLabel("蛋白质（g）", { exact: true }).fill("36");
  await editor.getByRole("button", { name: "保存食物", exact: true }).click();
  await expect.poll(async () => (await state()).food_overrides[0]).toMatchObject({
    category: "豆类", protein_per_100g: 36,
  });
  await page.reload();
  await library.getByLabel("搜索食物", { exact: true }).fill("031101");
  await expect(soy).toContainText("已调整");
  await expect(soy).toContainText("碳 18.7 · 蛋 36 · 脂 16 g");

  await manualGoal(page);
  await page.goto("/today");
  await page.getByRole("button", { name: "添加食物", exact: true }).first().click();
  const picker = page.getByRole("dialog", { name: "添加食物", exact: true });
  await picker.getByLabel("包含中国食物成分表").check();
  await expect(picker.getByRole("listitem")).toHaveCount(20);
  await picker.getByLabel("搜索食物", { exact: true }).fill("soybean");
  await expect(picker.getByRole("button", { name: /^黄豆［大豆］/ })).toBeVisible();
  await picker.getByLabel("搜索食物", { exact: true }).fill("031101");
  await picker.getByRole("button", { name: /^黄豆［大豆］/ }).click();
  await page.getByRole("button", { name: "保存计划", exact: true }).click();
  await expect.poll(async () => (await state()).daily_plans.length).toBe(1);
  const saved = (await state()).daily_plans[0];
  const entry = saved.meals.flatMap((meal: { entries: { foodId: string; foodSnapshot: unknown }[] }) => meal.entries).find((item: { foodId: string }) => item.foodId === "public-cfcd6-031101");
  expect(entry.foodSnapshot).toMatchObject({ name: "黄豆［大豆］", category: "豆类", carbsPer100g: 18.7, proteinPer100g: 36 });
  expect(errors).toEqual([]);
});
