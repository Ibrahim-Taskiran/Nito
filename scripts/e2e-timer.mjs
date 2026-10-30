// E2E for the study timer in the reader: stopwatch counts, pauses, keeps running after the reader closes,
// alarm rings, the time shows in Çalışma Merkezi; on a phone the panel opens as a bottom sheet. Needs `npm run dev`.
import { chromium } from "@playwright/test";
import { resolve } from "node:path";

const url = process.env.NITO_URL ?? "http://localhost:1420";
const browser = await chromium.launch({ channel: process.env.NITO_BROWSER ?? "msedge" });
const errors = [];
const fail = (msg) => {
  console.error("FAIL:", msg, errors.join("\n"));
  process.exit(1);
};

async function openReader(viewport) {
  const page = await browser.newPage({ viewport, hasTouch: true });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(url);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "PDF ekle" }).click();
  await (await chooser).setFiles([resolve("tests/fixtures/notes/Hafta 5_Uzun Belge.pdf")]);
  await page.getByRole("button", { name: /Uzun Belge/ }).first().click();
  const open = page.getByRole("button", { name: "Aç", exact: true });
  if (await open.isVisible().catch(() => false)) await open.click();
  await page.locator(".textLayer span").first().waitFor();
  return page;
}

const seconds = (text) => text.split(":").map(Number).reduce((a, b) => a * 60 + b, 0);

// Desktop/tablet: stopwatch.
const page = await openReader({ width: 1180, height: 820 });
const button = page.getByRole("button", { name: /Süre|\d\d:\d\d/ }).first();
await button.click();
const panel = page.getByRole("dialog", { name: "Kronometre ve alarm" });
await panel.getByRole("button", { name: /Başlat/ }).click();
await page.waitForTimeout(2300);
const shown = seconds(await panel.getByLabel("Geçen süre").textContent());
if (shown < 2) fail(`stopwatch shows ${shown}s after 2.3 s`);
await panel.getByRole("button", { name: /Duraklat/ }).click();
const paused = await panel.getByLabel("Geçen süre").textContent();
await page.waitForTimeout(1200);
if ((await panel.getByLabel("Geçen süre").textContent()) !== paused) fail("stopwatch moved while paused");
await panel.getByRole("button", { name: /Sürdür/ }).click();

// Keeps running after the reader closes and reopens.
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Aç", exact: true }).click().catch(() => {});
await page.locator(".textLayer span").first().waitFor();
await page.waitForTimeout(1200);
const label = await page.getByRole("button", { name: /\d\d:\d\d/ }).first().textContent();
if (seconds(label.trim()) <= seconds(paused)) fail(`stopwatch did not keep running: ${label}`);
console.log(`stopwatch: counts, pauses, keeps running after reopen (${label.trim()})`);

// Alarm: a 0.05 minute (3 s) alarm rings.
await page.getByRole("button", { name: /\d\d:\d\d/ }).first().click();
await panel.getByRole("tab", { name: "Alarm" }).click();
await panel.getByLabel("Dakika").fill("0,05");
await panel.getByRole("button", { name: /Kur/ }).click();
await page.getByRole("alertdialog", { name: "Süre doldu" }).waitFor({ timeout: 8000 }).catch(() => fail("alarm did not ring"));
await page.getByRole("button", { name: "Tamam" }).click();
console.log("alarm: rings and closes");

// Time counted while the PDF was open shows in Çalışma Merkezi.
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Çalışma Merkezi" }).click();
const row = page.getByTestId("study-time").filter({ hasText: "Uzun Belge" });
await row.waitFor({ timeout: 5000 }).catch(() => fail("no study time row in Çalışma Merkezi"));
const time = (await row.textContent()).replace(/\s+/g, " ").trim();
if (!/1 dk'dan az|\d+ dk/.test(time)) fail(`study time text: ${time}`);
console.log(`study time: ${time}`);
await page.close();

// Phone: the panel is a bottom sheet inside the screen.
const phone = await openReader({ width: 390, height: 844 });
await phone.getByRole("button", { name: /Süre|\d\d:\d\d/ }).first().tap();
const sheet = await phone.getByRole("dialog", { name: "Kronometre ve alarm" }).boundingBox();
if (!sheet || sheet.x < 0 || sheet.x + sheet.width > 391 || sheet.y + sheet.height > 845) fail(`sheet off screen: ${JSON.stringify(sheet)}`);
const start = await phone.getByRole("button", { name: /Başlat|Sürdür|Duraklat/ }).boundingBox();
if (start.height < 40) fail("start button smaller than 40px");
console.log("phone: bottom sheet fits, 40px buttons");

if (errors.length) fail("console errors");
await browser.close();
console.log("e2e-timer ok");
