import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { repoRoot, runtimePath } from "../../scripts/runtime/paths.mjs";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3200";

export default defineConfig({
  testDir: resolve(repoRoot, "tests/e2e"),
  testIgnore: ["tre-flow.spec.ts", "nutrition-goals.spec.ts", "custom-meals.spec.ts", "tutorial.spec.ts", "china-food-catalog.spec.ts"],
  outputDir: runtimePath("artifacts", "playwright", "base", "results"),
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { outputFolder: runtimePath("artifacts", "playwright", "base", "report"), open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.PLAYWRIGHT_VIDEO === "off" ? "off" : "retain-on-failure",
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  projects: [
    { name: "chromium-mobile-360", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } },
    { name: "chromium-tablet-768", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: "chromium-desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        cwd: repoRoot,
        command: "npm run dev -- --hostname 127.0.0.1 --port 3200",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        env: { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "your-anon-key", NEXT_TELEMETRY_DISABLED: "1" },
        timeout: 120_000
      }
});
