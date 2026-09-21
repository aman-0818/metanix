import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
const installedChrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(installedChrome) ? installedChrome : undefined);
mkdirSync("artifacts", { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  for (const route of ["/", "/products/m-vcara", "/contact"]) {
    await page.goto(`http://127.0.0.1:3000${route}`, { waitUntil: "networkidle" });
    const name = route === "/" ? "homepage" : route.split("/").at(-1);
    await page.screenshot({ path: `artifacts/${name}-desktop.png`, fullPage: true });
    if (route === "/") await page.screenshot({ path: "artifacts/homepage-hero.png" });
  }
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await page.screenshot({ path: "artifacts/homepage-tablet.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
  await page.screenshot({ path: "artifacts/homepage-mobile.png", fullPage: true });
  await page.screenshot({ path: "artifacts/homepage-mobile-hero.png" });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.screenshot({ path: "artifacts/mobile-navigation.png" });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("http://127.0.0.1:3000/products", { waitUntil: "networkidle" });
  await page.screenshot({ path: "artifacts/products-small-mobile.png", fullPage: true });
  console.log(JSON.stringify({ screenshots: "artifacts/", browserErrors: errors }, null, 2));
} finally { await browser.close(); }
