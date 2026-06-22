import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"]
  },
  resolve: {
    alias: {
      // 用 fileURLToPath 而非 .pathname：路径含中文/空格等非 ASCII 字符时，
      // .pathname 会保留百分号编码导致 @ 别名解析失败、整个测试套件无法运行。
      "@": fileURLToPath(new URL(".", import.meta.url))
    }
  }
});

