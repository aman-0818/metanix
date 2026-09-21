import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const localChrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browserExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (process.platform === "win32" && existsSync(localChrome) ? localChrome : undefined);
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: "artifacts/e2e-results.json" }]],
  use: { baseURL: "http://127.0.0.1:3000", browserName: "chromium", headless: true, launchOptions: { executablePath: browserExecutable }, actionTimeout: 10_000, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: { command: process.platform === "win32" ? "npm.cmd run start" : "npm run start", url: "http://127.0.0.1:3000", reuseExistingServer: true, timeout: 120_000 },
});
