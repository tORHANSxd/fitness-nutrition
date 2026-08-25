import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("未配置云端时显示明确的认证门禁", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/NutriTrain/);
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
  await expect(page.getByRole("heading", { name: "应用尚未连接云端" })).toBeVisible();
  const viewportSize = page.viewportSize();
  if ((viewportSize?.width ?? 0) >= 1024) {
    await expect(page.getByRole("heading", { name: "让每一次训练，都有数据回应。" })).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { name: "NutriTrain" })).toBeVisible();
  }
  await expect(page.getByRole("navigation", { name: "主导航" })).toHaveCount(0);
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).not.toBeNull();
  expect(viewport ?? "").not.toMatch(/maximum-scale|user-scalable\s*=\s*no/i);
});

test("旧路径会先经过认证门禁并保留目标地址", async ({ page }) => {
  await page.goto("/planner");
  await expect(page).toHaveURL(/\/login\?next=%2Fplanner$/);
});

test("@a11y 认证门禁没有严重或关键可访问性问题", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  const blockers = results.violations.filter((item) => ["critical", "serious"].includes(item.impact ?? ""));
  expect(blockers).toEqual([]);
});
