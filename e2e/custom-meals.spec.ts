import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { manualGoal } from "./ui-helpers";
import { todayKey } from "../lib/dateTime";

const fixture = "http://127.0.0.1:45432";

test("custom meal layout, template, draft and history survive both apply entry points @a11y", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120000);
  await request.post(`${fixture}/fixture/reset`);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = async () =>
    (await request.get(`${fixture}/fixture/state`)).json();
  await page.goto("/login");
  await page
    .getByLabel("邮箱", { exact: true })
    .fill("browser-fixture@example.test");
  await page.getByLabel("密码", { exact: true }).fill("synthetic-ui-only");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(/\/(overview|today)/);
  await page.goto("/today");
  const today = todayKey("Asia/Shanghai");
  await manualGoal(page);
  await page.goto("/today");
  await page.getByRole("button", { name: "餐食更多操作" }).click();
  const originalProtocol = (await state()).user_plan_protocols[0].config;
  const editor = page.getByRole("region", { name: "自定义分餐", exact: true });
  await editor.getByRole("button", { name: "调整餐次" }).click();
  await editor.getByLabel("每日餐数").selectOption("5");
  await editor.getByLabel("第 1 餐名称", { exact: true }).fill("");
  await expect(
    editor.getByRole("button", { name: "应用分餐设置" }),
  ).toBeDisabled();
  for (let i = 1; i <= 5; i++)
    await editor
      .getByLabel(`第 ${i} 餐名称`, { exact: true })
      .fill(`训练餐${i}`);
  await editor.getByLabel("第 1 餐碳水份额", { exact: true }).fill("2");
  await expect(
    editor.getByLabel("第 1 餐目标预览", { exact: true }),
  ).toContainText("564 kcal · 碳 76.7g / 蛋 35.0g / 脂 13.0g");
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  expect(
    await page
      .locator("body")
      .evaluate((body) => body.scrollWidth <= innerWidth + 1),
  ).toBe(true);
  await editor.screenshot({
    path: testInfo.outputPath("custom-five-meals-synthetic.png"),
  });
  await editor.getByRole("button", { name: "应用分餐设置" }).click();
  await expect(
    editor.getByRole("heading", { name: "每天 5 餐" }),
  ).toBeVisible();
  await page.getByLabel("全天模板名称", { exact: true }).fill("五餐力量日");
  await page
    .getByRole("button", { name: "保存当前餐食为模板", exact: true })
    .click();
  await expect
    .poll(async () => (await state()).planner_templates.length)
    .toBe(1);
  expect((await state()).planner_templates[0].payload.includesMealLayout).toBe(
    true,
  );
  await page.getByRole("button", { name: "关闭餐食设置" }).click();
  await page.getByRole("button", { name: "保存计划", exact: true }).click();
  await expect.poll(async () => (await state()).daily_plans.length).toBe(1);
  const frozen = (await state()).daily_plans[0];
  expect(frozen.meals).toHaveLength(5);
  for (const key of ["kcal", "protein", "carbs", "fat"]) {
    const total = frozen.result.mealRecommendations.reduce(
      (sum: number, meal: { target: Record<string, number> }) =>
        sum + meal.target[key],
      0,
    );
    expect(total).toBeCloseTo(frozen.result.dailyTarget[key], 6);
  }
  await page.getByRole("button", { name: "餐食更多操作" }).click();
  await editor.getByRole("button", { name: "调整餐次" }).click();
  await editor.getByLabel("每日餐数").selectOption("2");
  await editor.getByRole("button", { name: "应用分餐设置" }).click();
  await expect
    .poll(async () => (await state()).planner_drafts[0]?.meals.length)
    .toBe(2);
  await page.reload();
  await page.getByRole("button", { name: "餐食更多操作" }).click();
  await expect(
    editor.getByRole("heading", { name: "每天 2 餐" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "全天模板", exact: true })
    .selectOption({ label: "五餐力量日" });
  await page.getByRole("button", { name: "预览模板", exact: true }).click();
  await page.getByRole("button", { name: "确认替换餐食", exact: true }).click();
  await page.getByRole("button", { name: "餐食更多操作" }).click();
  await expect(
    editor.getByRole("heading", { name: "每天 5 餐" }),
  ).toBeVisible();
  await editor.getByRole("button", { name: "调整餐次" }).click();
  await editor.getByLabel("第 1 餐名称", { exact: true }).fill("后续临时餐名");
  await editor.getByRole("button", { name: "应用分餐设置" }).click();
  await expect
    .poll(async () => (await state()).planner_drafts[0]?.meals[0].name)
    .toBe("后续临时餐名");
  await page.goto("/resources?tab=templates");
  await expect(page.getByText("五餐力量日", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "应用", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/today\\?date=${today}&section=meals$`),
  );
  await expect
    .poll(async () => (await state()).planner_drafts[0]?.meals[0].name)
    .toBe("训练餐1");
  await page.getByRole("button", { name: "餐食更多操作" }).click();
  await editor.getByRole("button", { name: "调整餐次" }).click();
  await editor
    .getByLabel("第 1 餐名称", { exact: true })
    .fill("刷新后保留此名");
  await editor.getByRole("button", { name: "应用分餐设置" }).click();
  await expect
    .poll(async () => (await state()).planner_drafts[0]?.meals[0].name)
    .toBe("刷新后保留此名");
  await page.reload();
  await expect(page.getByRole("tab", { name: /刷新后保留此名/ })).toBeVisible();
  const final = await state();
  expect(final.user_plan_protocols[0].config).toEqual(originalProtocol);
  expect(final.daily_plans[0]).toEqual(frozen);
  expect(final.daily_checkins).toEqual([]);
  expect(errors).toEqual([]);
});

test("copying another day waits for confirmation and can be undone without changing its source", async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  await request.post(fixture + "/fixture/reset");
  await page.goto("/login");
  await page
    .getByLabel("邮箱", { exact: true })
    .fill("browser-fixture@example.test");
  await page.getByLabel("密码", { exact: true }).fill("synthetic-ui-only");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(/\/today/);
  const today = todayKey("Asia/Shanghai");
  await page.getByRole("button", { name: "添加食物", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("搜索食物", { exact: true })
    .fill("燕麦片");
  await page.getByRole("dialog").getByText("燕麦片", { exact: true }).click();
  await page.getByLabel("燕麦片克重", { exact: true }).fill("123");
  await page.getByRole("button", { name: "保存计划", exact: true }).click();
  const state = async () =>
    (await request.get(fixture + "/fixture/state")).json();
  await expect.poll(async () => (await state()).daily_plans.length).toBe(1);
  const source = structuredClone((await state()).daily_plans[0]);
  await page.getByRole("button", { name: "前一天", exact: true }).click();
  await expect(page.getByText("燕麦片", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^复制/ }).click();
  await page.getByLabel("复制来源日期", { exact: true }).fill(today);
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("燕麦片 123g");
  await expect(
    page
      .getByRole("region", { name: "分餐计划", exact: true })
      .getByText("燕麦片", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "确认替换餐食", exact: true }).click();
  await expect(page.getByLabel("燕麦片克重", { exact: true })).toHaveValue(
    "123",
  );
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.getByText("燕麦片", { exact: true })).toHaveCount(0);
  expect((await state()).daily_plans[0]).toEqual(source);
});
