import { defineConfig } from "@playwright/test";
import { runtimePath } from "../../scripts/runtime/paths.mjs";
import base from "./playwright.tre.config.mjs";
export default defineConfig({
  ...base,
  testMatch: ["tutorial.spec.ts"],
  outputDir: runtimePath("artifacts", "playwright", "tutorial", "results"),
  reporter: [["list"], ["html", { outputFolder: runtimePath("artifacts", "playwright", "tutorial", "report"), open: "never" }]],
});
