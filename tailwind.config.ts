import type { Config } from "tailwindcss";

// 精致深色 · 单强调色设计令牌（去 slop：无霓虹发光、无渐变大标题、无纯黑、单一强调色）。
// 强调色 = refined emerald #3ecf8e。中性 = 冷调炭灰。
// 关键：把上一版的 neon 工具类(text-gradient/bg-neon-grad/shadow-glow…)在 globals.css 就地降级为雅致等价，
// 并把组件硬编码的 blue 色阶重定向到 emerald 浅色调，使旧组件自动变精致、维持单强调色。
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
        ink: "#e7ebf2", // 主文字（off-white）
        muted: "#8a93a3", // 次要文字（冷灰）
        base: "#0a0c0f", // 页面底（off-black，非纯黑）
        surface: "#0f1318", // 卡片表面
        panel: "#161b22", // 内层/抬升表面
        raised: "#1c222c", // 更高一层
        line: "#242b35", // 细描边
        accent: "#3ecf8e", // 唯一强调色（refined emerald）
        "accent-ink": "#04140d", // 强调色上的深色文字
        accent2: "#6b96c4", // 仅用于数据可视化的次色（柔和蓝）
        neon: "#3ecf8e", // 兼容旧引用，等同 accent
        success: "#3ecf8e",
        amber: { DEFAULT: "#e0a23a", 50: "rgba(224,162,58,0.12)", 800: "#f0c069" },
        rose: { DEFAULT: "#e5687f", 50: "rgba(229,104,127,0.12)" },
        // 覆盖组件硬编码的原生色阶 → emerald 浅色调（维持单强调）
        blue: {
          50: "rgba(62,207,142,0.08)",
          100: "rgba(62,207,142,0.16)",
          200: "rgba(62,207,142,0.28)",
          800: "#2fb37e"
        },
        slate: { 100: "rgba(255,255,255,0.06)" }
      },
      boxShadow: {
        // 背景同色微染投影，无纯黑、无外发光
        soft: "0 16px 40px -18px rgba(0,0,0,0.65)",
        glow: "0 0 0 1px rgba(62,207,142,0.18), 0 10px 30px -14px rgba(0,0,0,0.6)",
        "glow-neon": "0 8px 26px -14px rgba(62,207,142,0.30)"
      },
      backgroundImage: {
        // 旧 neon-grad 降级为克制的强调色渐变（无彩虹）
        "neon-grad": "linear-gradient(135deg, #3ecf8e 0%, #2fb37e 100%)"
      },
      keyframes: {
        "view-in": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(14px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "glow-pulse": { "0%,100%": { opacity: "0.5" }, "50%": { opacity: "1" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-4px)" } }
      },
      animation: {
        "view-in": "view-in 200ms ease-out",
        "fade-up": "fade-up 420ms cubic-bezier(0.22,1,0.36,1) both",
        shimmer: "shimmer 2.4s infinite",
        "glow-pulse": "glow-pulse 2.8s ease-in-out infinite",
        float: "float 5s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
