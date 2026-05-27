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
        ink: "#0f172a",
        muted: "#475569",
        panel: "#f8fafc",
        line: "#dbeafe",
        accent: "#1e40af",
        success: "#16a34a",
        amber: "#d97706",
        rose: "#b42318"
      },
      boxShadow: {
        soft: "0 10px 32px rgba(30, 64, 175, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
