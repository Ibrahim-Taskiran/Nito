// Scratch: screenshots of every screen. Run from the repo root: node <this> [w] [theme] [screens]
import { chromium } from "@playwright/test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const out = process.env.OUT;
const url = process.env.NITO_URL ?? "http://localhost:1477";
const w = Number(process.argv[2] ?? 1440);
const theme = process.argv[3] ?? "light";
const which = (process.argv[4] ?? "home,library,plan,study,notes,ai").split(",");
const fixtures = readdirSync("tests/fixtures").filter((f) => f.endsWith(".pdf")).map((f) => resolve("tests/fixtures", f));
const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: w, height: w < 720 ? 800 : 1000 }, colorScheme: theme, hasTouch: w < 1000 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url);
if (which.includes("empty")) await page.screenshot({ path: `${out}/empty-${w}-${theme}.png` });
const chooser = page.waitForEvent("filechooser");
await page.getByRole("button", { name: "PDF ekle" }).click();
await (await chooser).setFiles(fixtures);
await page.getByRole("status").waitFor();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Tamam" }).click().catch(() => {});
if (w >= 720) {
  await page.getByRole("button", { name: /Hafta 5: Protokoller/ }).click();
  await page.getByRole("button", { name: "Aç", exact: true }).click();
  await page.locator(".textLayer span").first().waitFor();
  await page.getByRole("button", { name: "← Kütüphane" }).click();
}
const go = async (name) => {
  if (w < 720) await page.getByRole("navigation", { name: "Alt gezinti" }).getByRole("button", { name, exact: true }).click();
  else await page.getByRole("navigation", { name: "Gezinti" }).getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(700);
};
const map = { home: "Bugün", library: "Kütüphane", plan: "Program", study: w < 720 ? "Çalışma" : "Çalışma Merkezi", notes: "Notlar", ai: "Yapay zekâ" };
for (const s of which) {
  if (s === "empty") continue;
  if (s === "drawer") { await page.getByRole("button", { name: "Menü" }).click(); await page.waitForTimeout(400); }
  else if (s === "dialog") { await go("Program"); await page.getByRole("button", { name: "Plan ekle" }).click(); }
  else {
    try { await go(map[s]); } catch { console.log("skip", s); continue; }
    if (s === "library") { await page.locator("article.card").first().locator("button.main").click(); await page.waitForTimeout(800); }
  }
  await page.screenshot({ path: `${out}/${s}-${w}-${theme}.png`, fullPage: false });
  if (s === "drawer" || s === "dialog") await page.keyboard.press("Escape");
}
console.log(errors.join("\n") || "no errors");
await browser.close();
