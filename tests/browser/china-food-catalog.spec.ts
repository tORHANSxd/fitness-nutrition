import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { todayKey } from "../../lib/dateTime";

test("complete food reference, catalog selection, personal override and saved snapshot @a11y", async ({ page, request }, testInfo) => {
  test.setTimeout(120000);
  const fixture = "http://127.0.0.1:45432";
  await request.post(`${fixture}/fixture/reset`);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = async () => (await request.get(`${fixture}/fixture/state`)).json();
  await page.goto("/login");
  await page.getByLabel("邮箱", { exact: true }).fill("browser-fixture@example.test");
  await page.getByLabel("密码", { exact: true }).fill("synthetic-ui-only");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(/\/(overview|today)/);
  await page.goto("/resources?tab=foods");
  await expect(page.getByText(/共 1381 条/).first()).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(50);
  await page.getByLabel("搜索食物", { exact: true }).fill("031101");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByText("黄豆［大豆］", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /031101 · 成分详情/ }).click();
  const details = page.getByRole("region", { name: "黄豆［大豆］成分详情" });
  await expect(details.getByText("35.0", { exact: true })).toBeVisible();
  await expect(details.getByText(/净碳水 18.7g/)).toBeVisible();
  await details.screenshot({ path: testInfo.outputPath("food-source-details.png") });
  expect(await page.locator("body").evaluate((body) => body.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((violation) => ["critical", "serious"].includes(violation.impact ?? ""))).toEqual([]);

  // The full reference retains foods which cannot safely be converted to net carbs.
  await page.locator("summary").filter({ hasText: "中国食物成分表" }).click();
  await page.getByLabel("成分表数据完整性").selectOption("reference");
  await expect(page.getByText(/找到 328 条记录/)).toBeVisible();
  await page.getByLabel("搜索成分表").fill("219037");
  await page.getByRole("button", { name: /蜂胶液.*219037/ }).click();
  await expect(page.getByText(/缺少脂肪、总碳水、膳食纤维/).first()).toBeVisible();
  await page.getByRole("button", { name: "GI 参考", exact: true }).click();
  await expect(page.getByText("找到 259 条 GI 记录")).toBeVisible();
  await page.getByLabel("搜索 GI").fill("葡萄糖");
  await expect(page.getByText("GI 100", { exact: true }).first()).toBeVisible();

  // New category values survive the existing public override path.
  await page.getByRole("button", { name: "编辑黄豆［大豆］", exact: true }).click();
  await page.getByRole("button", { name: "更新食物", exact: true }).click();
  await expect.poll(async () => (await state()).food_overrides[0]?.category).toBe("豆类");
  await page.reload();
  await page.getByLabel("搜索食物", { exact: true }).fill("031101");
  await expect(page.getByRole("button", { name: "重置黄豆［大豆］为默认值", exact: true })).toBeVisible();

  await page.goto("/today");
  const today = todayKey("Asia/Shanghai");
  await page.locator("summary").filter({ hasText: "预览 / 调整目标" }).click();
  await page.getByLabel("计划生效日").fill(today);
  await page.getByLabel("循环锚点").fill(today);
  await page.getByRole("button", { name: "生成应用预览" }).click();
  await page.getByRole("button", { name: "确认应用此版本" }).click();
  await expect(page.getByRole("heading", { name: "执行协议 v1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "添加食物", exact: true }).first().click();
  const picker = page.getByRole("dialog");
  await expect(picker.getByRole("listitem")).toHaveCount(30);
  await picker.getByLabel("搜索食物", { exact: true }).fill("soybean");
  await expect(picker.getByRole("button", { name: /黄豆［大豆］/ })).toBeVisible();
  await picker.getByLabel("搜索食物", { exact: true }).fill("031101");
  await picker.getByRole("button", { name: /黄豆［大豆］/ }).click();
  await page.getByRole("button", { name: "保存计划", exact: true }).click();
  await expect.poll(async () => (await state()).daily_plans.length).toBe(1);
  const saved = (await state()).daily_plans[0];
  const entry = saved.meals.flatMap((meal: { entries: { foodId: string; foodSnapshot: unknown }[] }) => meal.entries).find((item: { foodId: string }) => item.foodId === "public-cfcd6-031101");
  expect(entry.foodSnapshot).toMatchObject({ name: "黄豆［大豆］", category: "豆类", carbsPer100g: 18.7, proteinPer100g: 35 });
  expect(errors).toEqual([]);
});
