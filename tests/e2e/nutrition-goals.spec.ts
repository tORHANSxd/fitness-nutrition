import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { addDays, todayKey } from "../../src/lib/dateTime";
import { syntheticGoalProtocol } from "../fixtures/nutritionGoalFixture";
import { emptyProfile } from "../../src/lib/demoState";
import { protocolMeals } from "../../src/lib/planProtocol";

const fixture = "http://127.0.0.1:45432";
async function login(page: Page) {
  await page.goto("/login");
  await page
    .getByLabel("邮箱", { exact: true })
    .fill("browser-fixture@example.test");
  await page.getByLabel("密码", { exact: true }).fill("synthetic-ui-only");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(/\/(overview|today)/);
  await page.goto("/goals");
}

test("新手从活动档位设置目标，设置页不显示饮食日期 @a11y", async ({ page, request }, testInfo) => {
  await request.post(`${fixture}/fixture/reset`);
  await login(page);
  const panel = page.getByRole("region", { name: "自动营养目标", exact: true });
  await expect(page.getByLabel("饮食日期", { exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "帮我计算" })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByLabel("总活动系数", { exact: true })).not.toBeVisible();
  await panel.getByLabel("计算体重", { exact: true }).fill("90");
  await panel.getByLabel("身高", { exact: true }).fill("180");
  await panel.getByLabel("当前周岁", { exact: true }).fill("30");
  await panel.getByRole("combobox", { name: "计算所用性别", exact: true }).selectOption("male");
  await panel.getByRole("combobox", { name: "日常活动水平", exact: true }).selectOption("1.4");
  await panel.getByLabel(/我已成年/).check();
  await expect(panel.getByTestId("candidate-energy")).toHaveText("2225 kcal");
  await page.screenshot({ path: testInfo.outputPath("simple-goal.png"), fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations.filter(v => ["critical", "serious"].includes(v.impact ?? ""))).toEqual([]);
  expect(await page.locator("body").evaluate(b => b.scrollWidth <= innerWidth + 1)).toBe(true);
  await panel.getByRole("button", { name: "预览调整" }).click();
  await panel.getByRole("button", { name: "确认目标" }).click();
  await expect(panel.getByText("查看计算依据", { exact: true })).toBeVisible();
  const state = await (await request.get(`${fixture}/fixture/state`)).json();
  expect(state.user_plan_protocols[0].config.nutrition.policy.tdee).toEqual({ kind: "pal_total", multiplier: 1.4, includesExercise: true });
  await page.goto("/today");
  await expect(page.getByRole("region", { name: "计划摄入" })).toContainText("目标 2,225 kcal");
  await expect(page.getByLabel("当天目标来源")).toContainText("日常目标");
  await expect(page.getByLabel("当天缺口", { exact: true })).not.toBeVisible();
  const adjustment = page.getByText("仅调整这一天", { exact: true });
  await adjustment.focus();
  await adjustment.press("Enter");
  await expect(page.getByLabel("当天缺口", { exact: true })).toBeVisible();
  await adjustment.press("Tab");
  await expect(page.getByLabel("估算维持热量", { exact: true })).toBeFocused();
});

test("未来日常目标保存后可见，今天不提前采用", async ({ page, request }) => {
  await request.post(`${fixture}/fixture/reset`);
  await login(page);
  const tomorrow = addDays(todayKey("Asia/Shanghai"), 1);
  const panel = page.getByRole("region", { name: "自动营养目标", exact: true });
  await panel.getByRole("button", { name: "我已有目标" }).click();
  await panel.getByLabel("每日热量", { exact: true }).fill("2200");
  await panel.getByLabel("每日蛋白质 g", { exact: true }).fill("170");
  await panel.getByLabel("每日脂肪 g", { exact: true }).fill("60");
  await panel.getByLabel(/我已成年/).check();
  await panel.getByLabel("新目标生效日期").fill(tomorrow);
  await panel.getByRole("button", { name: "预览调整" }).click();
  await expect(panel.getByLabel("自动目标应用预览")).toContainText("今天保持原目标");
  await panel.getByRole("button", { name: "确认目标" }).click();
  await expect(page.getByLabel("待生效的日常目标")).toContainText("2200 kcal");
  await page.reload();
  await expect(page.getByLabel("待生效的日常目标")).toContainText(tomorrow);
  const state = await (await request.get(`${fixture}/fixture/state`)).json();
  expect(state.user_plan_protocols).toHaveLength(1);
  expect(state.daily_plans).toHaveLength(0);
  await page.goto("/today");
  await expect(page.getByRole("region", { name: "计划摄入" })).toContainText("未设目标");
  await page.getByRole("button", { name: "后一天" }).click();
  await expect(page.getByRole("region", { name: "计划摄入" })).toContainText("目标 2,200 kcal");
});

test("已保存的今天与新日常目标同时可见，刷新和跨日仍各自正确 @a11y", async ({ page, request }, testInfo) => {
  const date = todayKey("Asia/Shanghai");
  const old = syntheticGoalProtocol({ date: addDays(date, -1) });
  const userId = "50000000-0000-4000-8000-000000000001";
  const meals = protocolMeals(old);
  await request.post(`${fixture}/fixture/reset`);
  await request.post(`${fixture}/rest/v1/user_plan_protocols`, { data: { id: old.id, user_id: userId, effective_from: old.effectiveFrom, schema_version: 2, config: old } });
  await request.post(`${fixture}/rest/v1/planner_drafts`, { data: { user_id: userId, plan_date: date, revision: 1, schema_version: 3, profile_snapshot: { ...emptyProfile, planDate: date, targetMode: "calibrated", allocationMode: "explicitMacros", protocolSnapshot: old }, meals } });
  await login(page);
  await page.goto("/today");
  const day = page.getByRole("region", { name: "当天热量缺口" });
  await day.getByText("仅调整这一天", { exact: true }).click();
  await day.getByLabel("估算维持热量", { exact: true }).fill("2650");
  await day.getByLabel("当天缺口", { exact: true }).fill("800");
  await day.getByLabel("当天缺口", { exact: true }).press("Tab");
  await day.getByRole("button", { name: "保存当天目标" }).click();
  await expect(day).toContainText("当天热量与碳蛋脂目标已保存");
  const before = await (await request.get(`${fixture}/fixture/state`)).json();
  await page.goto("/goals");
  const panel = page.getByRole("region", { name: "自动营养目标", exact: true });
  await expect(panel.getByLabel("今天的目标说明")).toContainText("1850 kcal");
  await panel.getByRole("button", { name: "调整目标", exact: true }).click();
  await panel.getByRole("button", { name: "我已有目标" }).click();
  await panel.getByLabel("每日热量", { exact: true }).fill("2200");
  await panel.getByLabel("每日蛋白质 g", { exact: true }).fill("170");
  await panel.getByLabel("每日脂肪 g", { exact: true }).fill("60");
  await panel.getByRole("button", { name: "预览调整" }).click();
  await expect(panel.getByLabel("自动目标应用预览")).toContainText("仍使用 1850 kcal");
  await panel.getByRole("button", { name: "确认目标" }).click();
  await expect(panel.getByText("2200 kcal / 天", { exact: true })).toBeVisible();
  await expect(panel.getByLabel("今天的目标说明")).toContainText("1850 kcal");
  await page.reload();
  await expect(panel.getByText("2200 kcal / 天", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("saved-day-and-default.png"), fullPage: true });
  const after = await (await request.get(`${fixture}/fixture/state`)).json();
  expect(after.daily_plans).toEqual(before.daily_plans);
  expect(after.daily_checkins).toEqual(before.daily_checkins);
  expect(after.user_plan_protocols).toHaveLength(2);
  expect((await new AxeBuilder({ page }).analyze()).violations.filter(v => ["critical", "serious"].includes(v.impact ?? ""))).toEqual([]);
  await page.goto("/today");
  await expect(page.getByRole("region", { name: "计划摄入" })).toContainText("目标 1,850 kcal");
  await page.getByRole("button", { name: "后一天" }).click();
  await expect(page.getByRole("region", { name: "计划摄入" })).toContainText("目标 2,200 kcal");
});

test("v5 five scenarios, evidence, actuals and history round-trip @a11y", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120000);
  await request.post(`${fixture}/fixture/reset`);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  const panel = page.getByRole("region", { name: "自动营养目标", exact: true });
  await panel.getByRole("button", { name: "帮我计算" }).click();
  await panel.getByLabel("计算体重", { exact: true }).fill("90");
  await panel.getByLabel("身高", { exact: true }).fill("180");
  await panel.getByLabel("当前周岁", { exact: true }).fill("30");
  await panel
    .getByRole("combobox", { name: "计算所用性别", exact: true })
    .selectOption("male");
  await panel.getByText("高级设置：公式与营养系数", { exact: true }).click();
  await panel.getByLabel("总活动系数", { exact: true }).fill("1.5");
  await panel.getByLabel("我已成年", { exact: false }).check();
  for (const [id, energy] of [
    ["cut_recomp", "2400"],
    ["cut_lean", "2550"],
    ["recomp", "2825"],
    ["lean_gain", "2950"],
    ["maintain", "2825"],
  ]) {
    await panel
      .getByRole("combobox", { name: "我的目标", exact: true })
      .selectOption(id);
    await expect(panel.getByTestId("candidate-energy")).toHaveText(
      `${energy} kcal`,
    );
  }
  await panel
    .getByRole("combobox", { name: "我的目标", exact: true })
    .selectOption("cut_recomp");
  await expect(panel.getByTestId("candidate-protein")).toHaveText("170 g");
  await expect(panel.getByTestId("candidate-fat")).toHaveText("65 g");
  await panel
    .locator("summary")
    .filter({ hasText: "计算明细与参考来源" })
    .click();
  await expect(panel).toContainText("2397 kcal → 确定值 2400 kcal");
  await page.screenshot({
    path: testInfo.outputPath("v5-formulas-synthetic.png"),
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  expect(
    await page.locator("body").evaluate((b) => b.scrollWidth <= innerWidth + 1),
  ).toBe(true);
  const date = todayKey("Asia/Shanghai");
  await panel.getByLabel("新目标生效日期").fill(date);
  await panel.getByRole("button", { name: "预览调整" }).click();
  await expect(panel.getByLabel("自动目标应用预览")).toContainText(
    "→ 2400 kcal",
  );
  await panel.getByRole("button", { name: "确认目标" }).click();
  await expect(page.getByText("查看计算依据", { exact: true })).toBeVisible();
  const initial = await (await request.get(`${fixture}/fixture/state`)).json();
  const protocol = initial.user_plan_protocols[0].config;
  expect(protocol.schemaVersion).toBe(3);
  expect(protocol.requestId).toBe(protocol.id);
  expect(protocol.nutrition.result.resolvedTarget).toEqual({
    kcal: 2400,
    protein: 170,
    fat: 65,
    carbs: 283.75,
  });

  await page.goto("/records");
  await page.getByRole("button", { name: "记录食物或饮料" }).click();
  await page.getByLabel("额外食品克重").fill("100");
  await page.getByRole("button", { name: "添加实际食物" }).click();
  await page
    .getByRole("dialog")
    .getByRole("listitem")
    .first()
    .getByRole("button")
    .first()
    .click();
  await page.getByRole("button", { name: "保存饮食记录" }).click();
  await expect(page.getByRole("button", { name: "撤销该事件" })).toHaveCount(1);
  await page.getByRole("button", { name: "完成记录", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /已确认（重开/ }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "撤销该事件" })).toBeDisabled();
  await page.goto("/today");
  await page.getByRole("button", { name: "餐食更多操作" }).click();
  await page.getByText("导入与导出", { exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出计划文件" }).click();
  const downloaded = await downloadPromise;
  const text = await readFile((await downloaded.path())!, "utf8");
  expect(JSON.parse(text).plan.profile.protocolSnapshot).toEqual(protocol);
  expect(JSON.parse(text).plan.algorithm_version).toBe("nutrition-v5.0");
  await page
    .getByLabel("导入计划文件", { exact: true })
    .setInputFiles({
      name: "synthetic-v5.json",
      mimeType: "application/json",
      buffer: Buffer.from(text),
    });
  await expect(
    page.getByRole("region", { name: "分餐计划", exact: true }),
  ).toContainText("已将文件载入计划草稿");
  await page.context().clearCookies();
  await login(page);
  await expect(page.getByText("查看计算依据", { exact: true })).toBeVisible();
  await request.post(`${fixture}/rest/v1/body_logs?on_conflict=plan_date`, {
    data: {
      user_id: "50000000-0000-4000-8000-000000000001",
      plan_date: date,
      weight_kg: 88,
    },
  });
  await page.reload();
  await panel.getByRole("button", { name: "调整目标", exact: true }).click();
  await panel.getByText("从体测记录填写体重", { exact: true }).click();
  await panel.getByRole("button", { name: "使用最近一次体重" }).click();
  await expect(panel.getByTestId("candidate-energy").last()).toHaveText(
    "2375 kcal",
  );
  const state = await (await request.get(`${fixture}/fixture/state`)).json();
  expect(state.user_plan_protocols).toHaveLength(1);
  expect(state.daily_plans[0].profile.protocolSnapshot).toEqual(protocol);
  expect(state.daily_checkins[0].actual.targetProtocolSnapshot).toEqual(
    protocol,
  );
  expect(state.daily_plans[0].algorithm_version).toBe("nutrition-v5.0");
  expect(errors).toEqual([]);
});

test("v5 manual-only input and locks survive transient save failure @a11y", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120000);
  await request.post(`${fixture}/fixture/reset`, {
    data: {
      preferences: {
        theme: "dark",
        unit_system: "imperial",
        energy_unit: "kj",
        time_zone: "America/Los_Angeles",
      },
    },
  });
  await login(page);
  const panel = page.getByRole("region", { name: "自动营养目标", exact: true });
  await panel.getByRole("button", { name: "帮我计算" }).click();
  await panel.locator("summary").filter({ hasText: "高级设置：公式与营养系数" }).click();
  await panel
    .getByRole("combobox", { name: "静息消耗来源", exact: true })
    .selectOption("cunningham_1980");
  await panel
    .getByRole("combobox", { name: "能量控制方式", exact: true })
    .selectOption("fixed_kcal");
  await panel
    .getByLabel("手动每日能量", { exact: true })
    .fill(String(2205 * 4.184));
  await panel
    .getByRole("combobox", { name: "蛋白方法", exact: true })
    .selectOption("fixed_grams");
  await panel.getByLabel("手动蛋白 g", { exact: true }).fill("175");
  await panel
    .getByRole("combobox", { name: "脂肪方法", exact: true })
    .selectOption("fixed_grams");
  await panel.getByLabel("手动脂肪 g", { exact: true }).fill("65");
  await panel.getByLabel("我已成年", { exact: false }).check();
  await expect(panel.getByLabel("计算体重", { exact: true })).toHaveCount(0);
  await expect(
    panel.getByRole("combobox", { name: "去脂体重来源", exact: true }),
  ).toHaveCount(0);
  await expect(panel.getByTestId("candidate-carbs")).toHaveText("230 g");
  await panel
    .getByRole("combobox", { name: "我的目标", exact: true })
    .selectOption("lean_gain");
  await panel.getByRole("button", { name: "保留手动项" }).click();
  await expect(panel.getByTestId("candidate-carbs")).toHaveText("230 g");
  await expect(
    panel.getByRole("combobox", { name: "我的目标", exact: true }),
  ).toHaveValue("custom");
  await panel
    .getByLabel("新目标生效日期")
    .fill(todayKey("America/Los_Angeles"));
  await panel.getByRole("button", { name: "预览调整" }).click();
  const ids: string[] = [];
  await page.route(
    "**/rest/v1/rpc/activate_plan_protocol_v1",
    async (route) => {
      ids.push(route.request().postDataJSON().p_config.id);
      if (ids.length === 1)
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "synthetic temporary failure" }),
        });
      else await route.continue();
    },
  );
  await panel.getByRole("button", { name: "确认目标" }).click();
  await expect(panel).toContainText("保存失败");
  expect(
    (await (await request.get(`${fixture}/fixture/state`)).json())
      .user_plan_protocols,
  ).toHaveLength(0);
  await panel.getByRole("button", { name: "确认目标" }).click();
  await expect(page.getByText("查看计算依据", { exact: true })).toBeVisible();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  const protocol = (
    await (await request.get(`${fixture}/fixture/state`)).json()
  ).user_plan_protocols[0].config;
  expect(protocol.dailyTarget).toEqual({
    kcal: 2205,
    protein: 175,
    fat: 65,
    carbs: 230,
  });
  expect(protocol.nutrition.result.expenditure).toEqual({
    rmrKcal: null,
    tdeeKcal: null,
    source: "not_used",
  });
  await panel.locator("summary").filter({ hasText: "查看计算依据" }).click();
  await page.screenshot({
    path: testInfo.outputPath("v5-manual-dark-synthetic.png"),
    fullPage: true,
  });
  expect(
    (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    ),
  ).toEqual([]);
  expect(
    await page.locator("body").evaluate((b) => b.scrollWidth <= innerWidth + 1),
  ).toBe(true);
});

test("v5 two pages cannot silently overwrite competing strategy revisions @a11y", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(60000);
  await request.post(`${fixture}/fixture/reset`);
  await login(page);
  const other = await context.newPage();
  await other.goto("/goals");
  const pages = [page, other];
  // 逐页完成水合和表单准备，只让实际提交并发，避免后台标签页初始化干扰版本竞争。
  for (const tab of pages) {
    await tab.bringToFront();
    await expect(tab).toHaveURL(/\/goals$/);
    const panel = tab.getByRole("region", {
      name: "自动营养目标",
      exact: true,
    });
    await panel.getByRole("button", { name: "帮我计算" }).click();
    await panel
      .locator("summary")
      .filter({ hasText: "高级设置：公式与营养系数" })
      .click();
    await panel
      .getByRole("combobox", { name: "能量控制方式", exact: true })
      .selectOption("fixed_kcal");
    await panel.getByLabel("手动每日能量", { exact: true }).fill("2205");
    await panel
      .getByRole("combobox", { name: "蛋白方法", exact: true })
      .selectOption("fixed_grams");
    await panel.getByLabel("手动蛋白 g", { exact: true }).fill("175");
    await panel
      .getByRole("combobox", { name: "脂肪方法", exact: true })
      .selectOption("fixed_grams");
    await panel.getByLabel("手动脂肪 g", { exact: true }).fill("65");
    await panel.getByLabel("我已成年", { exact: false }).check();
    await panel.getByLabel("新目标生效日期").fill(todayKey("Asia/Shanghai"));
    await panel.getByRole("button", { name: "预览调整" }).click();
    await expect(tab.getByRole("button", { name: "确认目标" })).toBeEnabled();
  }
  await Promise.all(
    pages.map((tab) => tab.getByRole("button", { name: "确认目标" }).click()),
  );
  await expect
    .poll(
      async () =>
        (
          await Promise.all(
            pages.map((tab) =>
              tab
                .getByText(
                  "协议版本冲突或该生效日已有版本，请刷新后选择新的生效日。",
                  { exact: true },
                )
                .isVisible(),
            ),
          )
        ).filter(Boolean).length,
    )
    .toBe(1);
  expect(
    (await (await request.get(`${fixture}/fixture/state`)).json())
      .user_plan_protocols,
  ).toHaveLength(1);
  for (const tab of pages)
    expect(
      (await new AxeBuilder({ page: tab }).analyze()).violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
  await other.close();
});
