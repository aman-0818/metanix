import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const routes = ["/", "/solutions", "/products", "/products/m-vcara", "/products/m-resora", "/products/m-ordena", "/industries", "/system-integration", "/ai-automation", "/enterprise-ai-governance", "/company", "/contact", "/resources", "/insights", "/privacy", "/terms", "/design-system"];
const widths = [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920];

test("every page responds, has unique metadata, one main heading and working internal links", async ({ page, request }) => {
  const titles = new Set<string>();
  const links = new Set<string>();
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
    const title = await page.title(); expect(titles.has(title), `Duplicate title ${title}`).toBe(false); titles.add(title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(new URL(canonical!).pathname).toBe(route);
    for (const href of await page.locator('a[href^="/"]').evaluateAll(elements => elements.map(el => el.getAttribute("href")!))) links.add(href.split(/[?#]/)[0]);
  }
  for (const link of links) expect((await request.get(link)).status(), link).toBe(200);
  expect((await request.get("/missing-page")).status()).toBe(404);
  expect((await request.get("/products/missing-product")).status()).toBe(404);
});

test("key layouts stay within the viewport at every required breakpoint", async ({ page }) => {
  for (const route of routes) {
    await page.goto(route);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, elements: Array.from(document.querySelectorAll("main *")).filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 4).map(el => el.className) }));
      expect(overflow.width, `${route} at ${width}px: ${JSON.stringify(overflow.elements)}`).toBeLessThanOrEqual(overflow.viewport + 1);
    }
  }
});

test("homepage selectors support keyboard and meaningful state changes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /M-RESORA/ }).click();
  await expect(page.getByRole("tabpanel", { name: /M-RESORA/ })).toContainText("approved action");
  await page.getByRole("button", { name: "Preview next workflow step" }).click();
  await expect(page.locator(".service-stage-title")).toHaveText("Build a picture of the problem.");
  await page.getByRole("tab", { name: /M-RESORA/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /M-ORDENA/ })).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: /M-ORDENA/ })).toContainText("AI Governance");
  await page.getByRole("tab", { name: "Healthcare", exact: true }).click();
  await expect(page.locator("#industry-panel")).toContainText("non-clinical");
  await page.getByRole("button", { name: "ITSM platforms", exact: true }).click();
  await expect(page.locator("#integration-detail")).toContainText("IT service management");
  await page.getByRole("tab", { name: /03 Automate/ }).click();
  await expect(page.locator("#approach-panel")).toContainText("repetitive tasks");
});

test("mobile navigation traps focus, closes with Escape and navigates", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const dialog = page.getByRole("dialog", { name: "Site navigation" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("link", { name: "Talk to Matenix AI" }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("link", { name: /matenix.*home/i })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("link", { name: "Talk to Matenix AI" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await dialog.getByRole("link", { name: /Company/ }).click();
  await expect(page).toHaveURL(/\/company$/);
  await expect(dialog).not.toBeVisible();
});

test("consultation intake carries the context into a validated, honest demo form", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Where could work be simpler?").selectOption("Employee support");
  await page.getByRole("button", { name: "Define your challenge" }).click();
  await page.getByLabel("What would you like to improve?").fill("Simplify repetitive internal support requests across our existing systems.");
  await page.getByRole("link", { name: "Discuss this use case" }).click();
  await expect(page.getByLabel("Area of interest")).toHaveValue("AI automation");
  await expect(page.getByLabel("What challenge would you like to solve?")).toContainText("Employee support");
  await page.getByRole("button", { name: "Review enquiry" }).click();
  await expect(page.getByLabel("Full name")).toBeFocused();
  await expect(page.getByText("Please enter your name.", { exact: true })).toBeVisible();
  await page.getByLabel("Full name").fill("Example Person");
  await page.getByLabel("Work email").fill("example@example.com");
  await page.getByRole("textbox", { name: "Company", exact: true }).fill("Example Company");
  await page.getByRole("textbox", { name: "Role", exact: true }).fill("Operations lead");
  await page.getByRole("combobox", { name: "Industry", exact: true }).selectOption("IT & Shared Services");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Review enquiry" }).click();
  await expect(page.getByText(/Your enquiry passed validation/)).toContainText("no message has been sent or saved");
});

test("contact API rejects malformed and invalid requests without pretending delivery", async ({ request }) => {
  expect((await request.post("/api/contact", { data: "invalid", headers: { "content-type": "application/json" } })).status()).toBe(400);
  const invalid = await request.post("/api/contact", { data: { name: "", email: "broken", company: "", role: "", industry: "", interest: "", challenge: "", acknowledged: false } });
  expect(invalid.status()).toBe(422);
  expect((await invalid.json()).errors.email).toBeTruthy();
  const valid = await request.post("/api/contact", { data: { name: "Example", email: "example@example.com", company: "Example", role: "Example", industry: "Technology Companies", interest: "AI automation", challenge: "An example workflow challenge for validation.", acknowledged: true } });
  expect(await valid.json()).toMatchObject({ demo: true, sent: false });
});

test("key pages have no automatically detectable WCAG AA violations", async ({ page }) => {
  for (const route of ["/", "/products/m-vcara", "/products/m-resora", "/products/m-ordena", "/contact", "/company", "/industries", "/design-system"]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), route).toEqual([]);
  }
});

test("reduced motion disables the animated architecture", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator(".system-visual").hover();
  expect(await page.locator(".flow-path").evaluate(el => getComputedStyle(el).animationName)).toBe("none");
});

test("mobile pages retain accessible labels and sufficient contrast", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["/", "/products/m-vcara", "/products/m-resora", "/products/m-ordena", "/contact"]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), route).toEqual([]);
  }
});
