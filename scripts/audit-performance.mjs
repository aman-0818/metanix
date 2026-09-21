import lighthouse from "lighthouse";
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
const installedChrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(installedChrome) ? installedChrome : undefined);
mkdirSync("artifacts", { recursive: true });
const port = 9333;
console.log("Starting local Lighthouse audits with Chrome.");
const browser = await chromium.launch({ executablePath: chromePath, headless: true, args: [`--remote-debugging-port=${port}`] });
try {
  const summaries = [];
  const auditRoutes = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/products/m-vcara", "/contact"];
  for (const route of auditRoutes) {
    const runs = [];
    for (let run = 1; run <= 3; run++) {
    console.log(`Auditing ${route} (run ${run}/3)`);
    const result = await lighthouse(`http://127.0.0.1:3000${route}`, { port, output: ["json", "html"], logLevel: "error", onlyCategories: ["performance", "accessibility", "best-practices", "seo"] });
    const name = route === "/" ? "homepage" : route.split("/").at(-1);
    writeFileSync(`artifacts/lighthouse-${name}-${run}.json`, result.report[0]);
    writeFileSync(`artifacts/lighthouse-${name}-${run}.html`, result.report[1]);
    const failed = Object.values(result.lhr.audits).filter(a => a.score !== null && a.score < .9).map(a => ({ id: a.id, title: a.title, value: a.displayValue }));
    const scores = Object.fromEntries(Object.entries(result.lhr.categories).map(([key, value]) => [key, Math.round(value.score * 100)]));
    runs.push({ scores, benchmarkIndex: result.lhr.environment.benchmarkIndex, failed });
    console.log(JSON.stringify({ route, run, scores }));
    }
    const medianScores = Object.fromEntries(Object.keys(runs[0].scores).map(key => [key, runs.map(run => run.scores[key]).sort((a, b) => a - b)[1]]));
    summaries.push({ route, medianScores, runs });
  }
  writeFileSync("artifacts/lighthouse-summary.json", JSON.stringify(summaries, null, 2));
  console.log(JSON.stringify(summaries, null, 2));
} finally { await browser.close(); }
