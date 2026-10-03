import { defineConfig } from "@playwright/test";
import { runtimePath } from "../../scripts/runtime/paths.mjs";
import base from "./playwright.tre.config.mjs";

export default defineConfig({
  ...base,
  testMatch: ["china-food-catalog.spec.ts"],
  outputDir: runtimePath("artifacts", "playwright", "food", "results"),
  reporter: [["list"], ["html", { outputFolder: runtimePath("artifacts", "playwright", "food", "report"), open: "never" }]],
});
