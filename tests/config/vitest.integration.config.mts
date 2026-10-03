import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { repoRoot, runtimePath } from "../../scripts/runtime/paths.mjs";

export default defineConfig({
  root: repoRoot,
  cacheDir: runtimePath("cache", "vitest-integration"),
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../src", import.meta.url)),
    },
  },
});
