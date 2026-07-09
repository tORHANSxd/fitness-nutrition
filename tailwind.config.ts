import type { Config } from "tailwindcss";

// Claude 官网风主题：奶油纸感底色 + 白卡片 + 珊瑚陶土 accent（#D97757）+ 暖灰墨字。
// 令牌名保持不变，组件无需改 JSX 即随主题切换；旧紫色/霓虹引用全部重定向到珊瑚色。
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1F1E1D", // 主文字（暖近黑）
        muted: "#6E6C66", // 次要文字（暖灰）
        "muted-soft": "#9C9A93", // 三级/弱化文字
        ground: "#FAF9F5", // 页面底（象牙奶油）
        surface: "#FFFFFF", // 卡片表面（白）
        panel: "#F4F1E9", // 内层/燕麦色表面
        raised: "#E8E4DA", // 更高一层/选中底
        line: "#E3DFD3", // 暖调细描边
        accent: "#D97757", // 品牌强调色（Claude 珊瑚陶土）
        "accent-ink": "#FFFFFF", // 强调色上的文字
        accent2: "#C6613F", // 深珊瑚（hover/图表）
        neon: "#D97757", // 兼容旧引用
        success: "#5E8B62", // 状态：完成（低饱和绿）
        amber: { DEFAULT: "#C28A2D", 50: "rgba(194,138,45,0.12)", 800: "#8A6116" }, // 状态：偏差/排队
        rose: { DEFAULT: "#BF4D43", 50: "rgba(191,77,67,0.10)" }, // 状态：危险/超额（暖红）
        // 组件硬编码的原生色阶 → 珊瑚色调（维持单强调）
        blue: {
          50: "rgba(217,119,87,0.08)",
          100: "rgba(217,119,87,0.14)",
          200: "rgba(217,119,87,0.28)",
          800: "#B25A3C"
        },
        slate: { 100: "rgba(0,0,0,0.05)" }
      },
      // 全站统一字体栈：英文 Anthropic Serif（本机安装即生效）→ Source Serif 4（开源回退），
      // 中文霞鹜文楷。sans/serif/display 全部映射同一栈，font-sans 工具类也不例外。
      fontFamily: {
        sans: ["Anthropic Serif", "var(--font-serif)", "Source Serif 4", "LXGW WenKai", "Georgia", "Songti SC", "serif"],
        serif: ["Anthropic Serif", "var(--font-serif)", "Source Serif 4", "LXGW WenKai", "Georgia", "Songti SC", "serif"],
        display: ["Anthropic Serif", "var(--font-serif)", "Source Serif 4", "LXGW WenKai", "Georgia", "Songti SC", "serif"]
      },
      boxShadow: {
        soft: "0 1px 2px rgba(31,30,29,0.04), 0 12px 32px -20px rgba(31,30,29,0.16)",
        glow: "0 0 0 1px rgba(217,119,87,0.25), 0 10px 30px -14px rgba(217,119,87,0.35)",
        "glow-neon": "0 6px 20px -10px rgba(217,119,87,0.35)"
      },
      backgroundImage: {
        "neon-grad": "linear-gradient(135deg, #D97757 0%, #C6613F 100%)"
      },
      keyframes: {
        "view-in": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(14px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "glow-pulse": { "0%,100%": { opacity: "0.5" }, "50%": { opacity: "1" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-4px)" } }
      },
      animation: {
        "view-in": "view-in 400ms cubic-bezier(0.16,1,0.3,1)",
        "fade-up": "fade-up 500ms cubic-bezier(0.16,1,0.3,1) both",
        shimmer: "shimmer 2.4s infinite",
        "glow-pulse": "glow-pulse 2.8s ease-in-out infinite",
        float: "float 5s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
