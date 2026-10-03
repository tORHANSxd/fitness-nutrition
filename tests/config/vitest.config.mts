import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { repoRoot, runtimePath } from "../../scripts/runtime/paths.mjs";

export default defineConfig({
  root: repoRoot,
  cacheDir: runtimePath("cache", "vitest"),
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/database/**/*.test.ts"],
    setupFiles: ["./tests/config/vitest.setup.ts"]
  },
  resolve: {
    alias: {
      // 用 fileURLToPath 而非 .pathname：路径含中文/空格等非 ASCII 字符时，
      // .pathname 会保留百分号编码导致 @ 别名解析失败、整个测试套件无法运行。
      "@": fileURLToPath(new URL("../../src", import.meta.url))
    }
  }
});
