import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#11130F",
        muted: "#5D6258",
        "muted-soft": "#858B80",
        ground: "#EFF1EA",
        surface: "#FBFCF7",
        panel: "#E4E7DD",
        raised: "#D8DCD0",
        line: "#C6CBC0",
        accent: "#C7F36B",
        "accent-ink": "#11130F",
        accent2: "#155D4A",
        neon: "#C7F36B",
        success: "#12845B",
        amber: { DEFAULT: "#C88410", 50: "rgba(200,132,16,0.12)", 800: "#7E520B" },
        rose: { DEFAULT: "#D8493F", 50: "rgba(216,73,63,0.10)" },
        blue: {
          50: "rgba(40,100,220,0.08)",
          100: "rgba(40,100,220,0.14)",
          200: "rgba(40,100,220,0.28)",
          800: "#2454B8"
        },
        slate: { 100: "rgba(0,0,0,0.05)" }
      },
      fontFamily: {
        sans: ["Arial", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        serif: ["Arial", "Helvetica Neue", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        display: ["Arial Black", "Arial", "PingFang SC", "Microsoft YaHei", "sans-serif"]
      },
      borderRadius: {
        sm: "2px",
        DEFAULT: "4px",
        md: "4px",
        lg: "6px",
        xl: "8px",
        "2xl": "8px",
        "3xl": "8px"
      },
      boxShadow: {
        soft: "0 1px 0 rgba(17,19,15,0.08), 0 16px 36px -28px rgba(17,19,15,0.45)",
        glow: "0 0 0 1px rgba(199,243,107,0.5), 0 12px 30px -18px rgba(21,93,74,0.45)",
        "glow-neon": "0 8px 24px -16px rgba(21,93,74,0.5)"
      },
      backgroundImage: {
        "neon-grad": "linear-gradient(135deg, #C7F36B 0%, #8CDFA8 100%)"
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
