import { defineConfig } from "@playwright/test";
import { repoRoot, runtimePath } from "../../scripts/runtime/paths.mjs";
import base from "./playwright.config.mjs";
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
  outputDir: runtimePath("artifacts", "playwright", "tre", "results"),
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: runtimePath("artifacts", "playwright", "tre", "report"), open: "never" },
    ],
  ],
  use: { ...base.use, actionTimeout: 15000, baseURL: "http://127.0.0.1:3300" },
  webServer: [
    {
      cwd: repoRoot,
      command: "node tests/fixtures/supabase-fixture.mjs",
      url: "http://127.0.0.1:45432/fixture/state",
      reuseExistingServer: !process.env.CI,
    },
    {
      cwd: repoRoot,
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
