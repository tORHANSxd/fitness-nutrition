import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals.map((entry) => entry.name === "next/typescript"
    ? { ...entry, files: [...entry.files, "**/*.mts"] }
    : entry),
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "artifacts/**",
      "node_modules/**",
      "dist/**",
      "out/**",
      "next-env.d.ts"
    ]
  },
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react/no-unescaped-entities": "off"
    }
  }
];

export default config;
