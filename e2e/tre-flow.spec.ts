import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login, manualGoal } from "./ui-helpers";
const fixture = "http://127.0.0.1:45432";
for (const mode of [
  { name: "light-metric", theme: "light", units: "metric", energy: "kcal" },
  { name: "dark-imperial", theme: "dark", units: "imperial", energy: "kj" },
])
  test(`daily food and manual training persist in ${mode.name} @a11y`, async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(120000);
    await request.post(fixture + "/fixture/reset", {
      data: {
        preferences: {
          theme: mode.theme,
          unit_system: mode.units,
          energy_unit: mode.energy,
        },
      },
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await login(page);
    await manualGoal(page);
    await page.goto("/today");
    await page.getByRole("button", { name: "添加食物", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "添加食物", exact: true });
    await expect(picker.getByLabel("包含中国食物成分表")).not.toBeChecked();
    await picker.getByLabel("搜索食物", { exact: true }).fill("065033");
    await expect(picker.getByText("没有符合条件的食物。")).toBeVisible();
    await picker.getByLabel("包含中国食物成分表").check();
    const banana = picker.getByText("香蕉［甘蕉］", { exact: true });
    await picker
      .getByRole("button", { name: "设为常用香蕉［甘蕉］", exact: true })
      .click();
    await banana.click();
    await page.getByLabel("香蕉［甘蕉］克重", { exact: true }).fill("200");
    await page.getByLabel("换算可食部", { exact: true }).check();
    await expect(
      page.getByLabel("香蕉［甘蕉］可食部比例", { exact: true }),
    ).toHaveValue("59");
    await expect(
      page.getByText("称重 200 g → 可食 118 g", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "保存计划", exact: true }).click();
    const state = async () =>
      (await request.get(fixture + "/fixture/state")).json();
    await expect
      .poll(
        async () =>
          (await state()).daily_plans[0]?.meals[0].entries[0]?.ediblePercent,
      )
      .toBe(59);
    await page.reload();
    await expect(page.getByLabel("换算可食部", { exact: true })).toBeChecked();
    await page
      .getByRole("button", { name: "删除香蕉［甘蕉］", exact: true })
      .click();
    await expect(page.getByText("香蕉［甘蕉］", { exact: true })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(page.getByText("香蕉［甘蕉］", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "添加食物", exact: true }).click();
    await picker.getByLabel("包含中国食物成分表").check();
    await picker.getByRole("button", { name: "常用", exact: true }).click();
    await expect(
      picker.getByText("香蕉［甘蕉］", { exact: true }),
    ).toBeVisible();
    await picker
      .getByRole("button", { name: "关闭食物选择", exact: true })
      .click();
    await page.screenshot({
      path: testInfo.outputPath("today-edible.png"),
      fullPage: true,
    });
    expect(
      (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
    await page.goto("/records");
    await page
      .getByRole("button", { name: "早餐按计划吃了", exact: true })
      .click();
    await expect(page.getByLabel("食用重量 g", { exact: true })).toHaveValue(
      "118",
    );
    await page
      .getByRole("button", { name: "保存饮食记录", exact: true })
      .click();
    await page.getByRole("button", { name: "完成记录", exact: true }).click();
    await expect(page.getByRole("button", { name: /已确认/ })).toBeDisabled();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "撤销该事件" }),
    ).toBeDisabled();
    await page.goto("/records?tab=training");
    await page.getByRole("button", { name: "添加训练组", exact: true }).click();
    await page.getByLabel("第1组动作", { exact: true }).fill("哑铃卧推");
    await page.getByLabel("第1组重量", { exact: true }).fill("20");
    await page.getByLabel("第1组次数", { exact: true }).fill("8");
    await page.getByLabel("已完成", { exact: true }).check();
    await page
      .getByRole("button", { name: "保存训练记录", exact: true })
      .click();
    await expect(
      page.getByText("训练记录已保存。", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("第1组动作", { exact: true })).toHaveValue(
      "哑铃卧推",
    );
    await expect(page.getByLabel("已完成", { exact: true })).toBeChecked();
    expect(
      (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("manual-training.png"),
      fullPage: true,
    });
    const saved = await state();
    expect(saved.workout_schedules).toHaveLength(0);
    expect(saved.workout_sessions[0].sets.sets[0].weightKg).toBeCloseTo(
      mode.units === "imperial" ? 20 / 2.2046226218 : 20,
      4,
    );
    expect(
      saved.daily_checkins[0].actual.mealEvents[0].actualFoodEntries[0].grams,
    ).toBe(118);
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1),
    ).toBe(true);
  });
