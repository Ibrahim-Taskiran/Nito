// E2E for tablet input: pen strokes saved and erased, pinch zoom, swipe to the next page. Needs `npm run dev`.
import { chromium } from "@playwright/test";
import { takePen } from "./e2e-ink.mjs";
import { resolve } from "node:path";

const url = process.env.NITO_URL ?? "http://localhost:1420";
const browser = await chromium.launch({ channel: process.env.NITO_BROWSER ?? "msedge" });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const fail = (msg) => {
  console.error("FAIL:", msg, errors.join("\n"));
  process.exit(1);
};

await page.goto(url);
const chooser = page.waitForEvent("filechooser");
await page.getByRole("button", { name: "PDF ekle" }).click();
await (await chooser).setFiles([resolve("tests/fixtures/notes/Hafta 5_Uzun Belge.pdf")]);
await page.getByRole("button", { name: /Uzun Belge/ }).click();
await page.getByRole("button", { name: "Aç" }).click();
await page.locator(".textLayer span").first().waitFor();

// Pen: draw a zigzag on page 1.
await takePen(page, "Tükenmez", "Kırmızı");
const box = await page.locator('[data-page="1"]').boundingBox();
await page.mouse.move(box.x + 100, box.y + 300);
await page.mouse.down();
for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 100 + i * 20, box.y + 300 + (i % 2 ? 30 : 0), { steps: 2 });
await page.mouse.up();
await page.locator('[data-page="1"] svg.ink path').first().waitFor().catch(() => fail("stroke not drawn"));
const color = await page.locator('[data-page="1"] svg.ink path').first().getAttribute("stroke");
if (color !== "#c0392b") fail(`stroke colour ${color}`);
await page.screenshot({ path: "docs/screenshots/ink-light.png" });

// Reopen: the stroke is stored.
await page.getByRole("button", { name: "← Kütüphane" }).click();
await page.getByRole("button", { name: "Aç" }).click();
await page.locator('[data-page="1"] svg.ink path').first().waitFor().catch(() => fail("stroke lost after reopen"));

// Eraser: rub across the stroke.
await page.getByRole("button", { name: "Silgi" }).click();
const b2 = await page.locator('[data-page="1"]').boundingBox();
await page.mouse.move(b2.x + 160, b2.y + 280);
await page.mouse.down();
await page.mouse.move(b2.x + 160, b2.y + 340, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
if (await page.locator('[data-page="1"] svg.ink path').count()) fail("eraser left the stroke");
await page.getByRole("button", { name: "Silgi" }).click();

// Pinch zoom with two fingers through CDP touch events.
const cdp = await page.context().newCDPSession(page);
const zoomText = async () => page.locator(".zoom").textContent();
const before = parseInt(await zoomText());
const sc = await page.locator(".scroller").boundingBox();
const cx = sc.x + sc.width / 2;
const cy = sc.y + 300;
const touch = (type, d) => cdp.send("Input.dispatchTouchEvent", {
  type,
  touchPoints: type === "touchEnd" ? [] : [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }],
});
await touch("touchStart", 50);
for (let d = 60; d <= 150; d += 10) await touch("touchMove", d);
await touch("touchEnd", 0);
const after = parseInt(await zoomText());
if (!(after > before * 1.5)) fail(`pinch zoom ${before}% -> ${after}%`);

// Swipe left turns the page (zoom back to fit so nothing scrolls sideways).
await page.getByRole("button", { name: "Genişliğe sığdır" }).click();
await page.waitForTimeout(300);
const swipe = async (x0, x1) => {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: cy, id: 1 }] });
  for (let i = 1; i <= 5; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + ((x1 - x0) * i) / 5, y: cy, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};
await swipe(cx + 150, cx - 150);
await page.waitForTimeout(500);
const pages = await page.locator(".pages").textContent();
if (!pages.startsWith("2 /")) fail(`swipe did not turn the page: ${pages}`);

console.log(`ink ok | erase ok | pinch ${before}% -> ${after}% | swipe -> ${pages.trim()}`);
if (errors.length) fail("console errors");
await browser.close();
