import { defineConfig } from "@playwright/test";
import base from "./playwright.tre.config";

export default defineConfig({
  ...base,
  testDir: "./tests/browser",
  testMatch: ["china-food-catalog.spec.ts"],
  outputDir: "./artifacts/playwright-food-results",
  reporter: [["list"], ["html", { outputFolder: "artifacts/playwright-food-report", open: "never" }]],
});
