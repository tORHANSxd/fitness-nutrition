import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: [
    "tre-flow.spec.ts",
    "nutrition-goals.spec.ts",
    "custom-meals.spec.ts",
  ],
  testIgnore: [],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: "./artifacts/playwright-tre-results",
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: "artifacts/playwright-tre-report", open: "never" },
    ],
  ],
  use: { ...base.use, actionTimeout: 15000, baseURL: "http://127.0.0.1:3300" },
  webServer: [
    {
      command: "node e2e/supabase-fixture.mjs",
      url: "http://127.0.0.1:45432/fixture/state",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 3300",
      url: "http://127.0.0.1:3300",
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:45432",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-ui-fixture-only",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
