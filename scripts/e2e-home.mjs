// E2E: Bugün home sections, Program add item, weekly repeat, drag to another day and the move-to-day fallback.
// Needs `npm run dev`. The web build keeps its database in memory, so "after reload" means the views are
// remounted (Program -> Bugün -> Program) and re-read everything from SQL.
import { chromium } from "@playwright/test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env.NITO_URL ?? "http://localhost:1420";
const fixtures = readdirSync("tests/fixtures").filter((f) => f.endsWith(".pdf")).map((f) => resolve("tests/fixtures", f));
const browser = await chromium.launch({ channel: process.env.NITO_BROWSER ?? "msedge" });
const errors = [];
const fail = (msg) => {
  console.error("FAIL:", msg, errors.join("\n"));
  process.exit(1);
};

const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const nav = (name) => page.getByRole("navigation").getByRole("button", { name, exact: true }).click();
const shot = async (name, theme) => {
  await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
  await page.waitForTimeout(250); // let colour transitions finish
  await page.screenshot({ path: `docs/screenshots/${name}-${theme}.png` });
};

await page.goto(url);
const chooser = page.waitForEvent("filechooser");
await page.getByRole("button", { name: "PDF ekle" }).click();
await (await chooser).setFiles(fixtures);
await page.getByRole("button", { name: /Hafta 5: Protokoller/ }).click();
await page.getByRole("button", { name: "Aç" }).click();
await page.locator(".textLayer span").first().waitFor();
await page.getByRole("button", { name: "← Kütüphane" }).click();

// Bugün shows every section.
await nav("Bugün");
for (const h of ["Kaldığın yerden devam et", "Bugünün planı", "Tekrar zamanı gelen kartlar", "Bu hafta", "Son vurgular", "Son kayıtlar"]) {
  if (!(await page.getByRole("heading", { name: h }).isVisible())) fail(`home section missing: ${h}`);
}
console.log("home due cards:", await page.getByTestId("home-due").textContent());
await shot("home", "light");

// Program: add a weekly item for today.
await nav("Program");
const items = page.getByTestId("plan-item");
await page.getByRole("button", { name: "Plan ekle" }).click();
await page.getByLabel("Başlık").fill("Ağlar tekrarı");
await page.getByLabel("Saat").fill("10:30");
await page.getByLabel("Her hafta tekrarla").check();
await page.getByRole("button", { name: "Kaydet" }).click();
await items.first().waitFor();
const today = await page.locator("section.col.today").getAttribute("data-day");
if ((await page.locator(`section[data-day="${today}"]`).getByTestId("plan-item").count()) !== 1) fail("item not on today");
console.log("added on", today);

// The home screen lists it under today's plan.
await nav("Bugün");
if (!(await page.getByText("Ağlar tekrarı").isVisible())) fail("home does not show today's plan item");
await shot("home-plan", "dark");

// Repeat: next week shows it on the same weekday.
await nav("Program");
await items.first().waitFor();
const label = await page.getByTestId("week-label").textContent();
await page.getByRole("button", { name: "Sonraki hafta" }).click();
await page.waitForFunction((l) => document.querySelector('[data-testid="week-label"]')?.textContent !== l, label);
if ((await items.count()) !== 1) fail("repeating item missing next week");
console.log("next week:", await page.getByTestId("week-label").textContent(), "items", await items.count());
await page.getByRole("button", { name: "Bu hafta" }).click();
await page.waitForFunction((l) => document.querySelector('[data-testid="week-label"]')?.textContent === l, label);

// Drag with pointer events (mouse here; the same code path handles touch and pen).
const days = await page.locator("section.col").evaluateAll((els) => els.map((e) => e.dataset.day));
const target = days.find((d) => d !== today);
const from = await items.first().locator(".title").boundingBox();
const to = await page.locator(`section[data-day="${target}"]`).boundingBox();
await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
await page.mouse.down();
await page.mouse.move(from.x + 20, from.y + 20, { steps: 4 });
await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 10 });
await page.mouse.up();
await page.locator(`section[data-day="${target}"]`).getByTestId("plan-item").waitFor();

// Persists after the views re-read the database.
await nav("Bugün");
await nav("Program");
await page.locator(`section[data-day="${target}"]`).getByTestId("plan-item").waitFor();
if (await page.locator(`section[data-day="${today}"]`).getByTestId("plan-item").count()) fail("item still on the old day");
console.log("dragged to", target, "and kept after remount");

// Touch fallback: move back to today from the item dialog.
await items.first().getByRole("button", { name: /düzenle/ }).click();
await page.getByTestId("move-day").selectOption(today);
await page.locator(`section[data-day="${today}"]`).getByTestId("plan-item").waitFor();
console.log("moved back with Başka güne taşı");

// Mark done.
await items.first().getByRole("checkbox").check();
await page.locator(".item.done").waitFor();
await shot("plan", "light");
await shot("plan", "dark");

// Tablet portrait: the week becomes a list of days.
await page.setViewportSize({ width: 820, height: 1180 });
await page.locator(".week-grid.list").waitFor();
await shot("plan-tablet", "light");

await browser.close();
if (errors.length) fail("console errors");
console.log("e2e-home ok");
