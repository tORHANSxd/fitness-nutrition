import { expect, type Page } from "@playwright/test";
export async function login(page: Page) {
  await page.goto("/login");
  await page
    .getByLabel("邮箱", { exact: true })
    .fill("browser-fixture@example.test");
  await page.getByLabel("密码", { exact: true }).fill("synthetic-ui-only");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(/\/today/);
}
export async function manualGoal(page: Page) {
  await page.goto("/goals");
  await page.getByLabel("每日碳水 g", { exact: true }).fill("230");
  await page.getByLabel("每日蛋白质 g", { exact: true }).fill("175");
  await page.getByLabel("每日脂肪 g", { exact: true }).fill("65");
  await page.getByLabel(/我已成年/).check();
  await page.getByRole("button", { name: "预览调整", exact: true }).click();
  await page.getByRole("button", { name: "确认目标", exact: true }).click();
  await expect(page.getByText("查看计算依据", { exact: true })).toBeVisible();
}
