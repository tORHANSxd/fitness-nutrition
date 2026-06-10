import type { Config } from "tailwindcss";

// 深色霓虹 / 玻璃拟态设计令牌。
// 语义令牌（ink/muted/panel/line/accent…）直接翻转为暗色；
// 同时覆盖组件里硬编码的 blue/slate/amber 原生色阶，使其在暗底上变成霓虹微光，
// 这样绝大多数组件无需改 JSX 即可换肤。
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        // 语义令牌
        ink: "#e8ecff", // 主文字（暗底上的近白）
        muted: "#97a3d6", // 次要文字
        panel: "#141a32", // 内层卡片表面
        surface: "#10162c", // 通用卡片表面（替代原 bg-white）
        line: "#2a335f", // 细分隔线/描边
        accent: "#5b8cff", // 霓虹主色（电光蓝）
        accent2: "#a855f7", // 霓虹辅色（紫）
        neon: "#22d3ee", // 霓虹青（高光/渐变）
        success: "#34d399",
        amber: { DEFAULT: "#fbbf24", 50: "rgba(251,191,36,0.12)", 800: "#fcd34d" },
        rose: { DEFAULT: "#fb7185", 50: "rgba(251,113,133,0.12)" },
        // 覆盖原生色阶（组件硬编码使用）→ 暗底霓虹微光
        blue: {
          50: "rgba(91,140,255,0.10)",
          100: "rgba(91,140,255,0.20)",
          200: "rgba(91,140,255,0.34)",
          800: "#3b6ae0"
        },
        slate: { 100: "rgba(255,255,255,0.08)" }
      },
      boxShadow: {
        soft: "0 18px 50px -12px rgba(7, 11, 30, 0.75)",
        glow: "0 0 0 1px rgba(91,140,255,0.30), 0 12px 40px -6px rgba(91,140,255,0.45)",
        "glow-neon": "0 0 24px -4px rgba(34,211,238,0.55)"
      },
      backgroundImage: {
        "neon-grad": "linear-gradient(120deg, #5b8cff 0%, #22d3ee 45%, #a855f7 100%)"
      },
      keyframes: {
        "view-in": { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(16px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "glow-pulse": { "0%,100%": { opacity: "0.55" }, "50%": { opacity: "1" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } }
      },
      animation: {
        "view-in": "view-in 220ms ease-out",
        "fade-up": "fade-up 420ms cubic-bezier(0.22,1,0.36,1) both",
        shimmer: "shimmer 2.2s infinite",
        "glow-pulse": "glow-pulse 3.5s ease-in-out infinite",
        float: "float 5s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
