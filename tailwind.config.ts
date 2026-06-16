import type { Config } from "tailwindcss";

// 紫色玻璃拟态主题（Finlytic 风，沿用 landing 的紫色/玻璃/动效）。
// 单一品牌强调色 = 紫 #7b39fc；状态色（绿/琥珀/玫红）保留语义；表面为深navy-purple玻璃。
// 令牌名保持不变，组件无需改 JSX 即随主题切换；硬编码的 blue 色阶重定向到紫色调。
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#ece9f8", // 主文字（冷调 off-white）
        muted: "#9b93bd", // 次要文字（紫灰）
        ground: "#0a0814", // 页面底（深 navy-purple，勿命名 base）
        surface: "#120e22", // 卡片表面
        panel: "#1a1436", // 内层/抬升表面
        raised: "#231a46", // 更高一层
        line: "#2c2550", // 紫调细描边
        accent: "#7b39fc", // 品牌强调色（紫）
        "accent-ink": "#f7f5ff", // 强调色上的浅文字
        accent2: "#a855f7", // 次紫（渐变/光晕/图表）
        neon: "#7b39fc", // 兼容旧引用
        success: "#34d399", // 状态：完成/已付（绿）
        amber: { DEFAULT: "#e0a23a", 50: "rgba(224,162,58,0.12)", 800: "#f0c069" }, // 状态：排队中
        rose: { DEFAULT: "#e5687f", 50: "rgba(229,104,127,0.12)" }, // 状态：危险/超额
        // 组件硬编码的原生色阶 → 紫色调（维持单强调）
        blue: {
          50: "rgba(123,57,252,0.10)",
          100: "rgba(123,57,252,0.18)",
          200: "rgba(123,57,252,0.32)",
          800: "#6a2fe0"
        },
        slate: { 100: "rgba(255,255,255,0.06)" }
      },
      boxShadow: {
        soft: "0 18px 50px -20px rgba(0,0,0,0.75)",
        glow: "0 0 0 1px rgba(123,57,252,0.30), 0 16px 44px -16px rgba(123,57,252,0.45)",
        "glow-neon": "0 10px 32px -12px rgba(123,57,252,0.45)"
      },
      backgroundImage: {
        "neon-grad": "linear-gradient(135deg, #7b39fc 0%, #a855f7 100%)"
      },
      keyframes: {
        "view-in": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(14px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "glow-pulse": { "0%,100%": { opacity: "0.5" }, "50%": { opacity: "1" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-4px)" } }
      },
      animation: {
        "view-in": "view-in 220ms ease-out",
        "fade-up": "fade-up 460ms cubic-bezier(0.22,1,0.36,1) both",
        shimmer: "shimmer 2.4s infinite",
        "glow-pulse": "glow-pulse 2.8s ease-in-out infinite",
        float: "float 5s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
