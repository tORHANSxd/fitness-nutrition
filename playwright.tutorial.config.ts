import { defineConfig } from "@playwright/test";
import base from "./playwright.tre.config";
export default defineConfig({ ...base, testMatch: ["tutorial.spec.ts"], outputDir: "./artifacts/tutorial/results", reporter: [["list"], ["html", { outputFolder: "artifacts/tutorial/report", open: "never" }]] });
