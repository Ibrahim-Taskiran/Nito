// E2E for the reader tools: pen kinds saved after reopen, laser not saved, image insert persists,
// search finds a word, the page box jumps, the left panel shows thumbnails. Needs `npm run dev`.
import { chromium } from "@playwright/test";
import { openPens, pen } from "./e2e-ink.mjs";
import { resolve } from "node:path";

const url = process.env.NITO_URL ?? "http://localhost:1420";
const browser = await chromium.launch({ channel: process.env.NITO_BROWSER ?? "msedge" });
const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const fail = (msg) => {
  console.error("FAIL:", msg, errors.join("\n"));
  process.exit(1);
};
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");

await page.goto(url);
const chooser = page.waitForEvent("filechooser");
await page.getByRole("button", { name: "PDF ekle" }).click();
await (await chooser).setFiles([resolve("tests/fixtures/notes/Hafta 5_Uzun Belge.pdf")]);
await page.getByRole("button", { name: /Uzun Belge/ }).click();
await page.getByRole("button", { name: "Aç" }).click();
await page.locator(".textLayer span").first().waitFor();
if (!(await page.getByRole("button", { name: "Ses kaydı" }).isVisible())) fail("Ses kaydı button not visible");

const p1 = page.locator('[data-page="1"]');
async function draw(y) {
  const box = await p1.boundingBox();
  await page.mouse.move(box.x + 100, box.y + y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 100 + i * 24, box.y + y + (i % 2 ? 12 : 0), { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

// Highlighter (pink), pencil, ballpoint with a custom colour.
await pen(page, "Fosforlu", "Pembe");
// Grouped toolbar: one "Kalem" button shows the kind and colour; the kinds live in its panel; Lazer stays apart.
const penGroup = page.getByRole("button", { name: "Kalem", exact: true });
if ((await penGroup.getAttribute("aria-pressed")) !== "true") fail("Kalem group not pressed");
if ((await penGroup.getAttribute("title")) !== "Fosforlu · Pembe") fail(`Kalem title: ${await penGroup.getAttribute("title")}`);
if (await page.getByRole("button", { name: "Tükenmez", exact: true }).count()) fail("pen kinds outside the Kalem panel");
if (!(await page.getByRole("toolbar", { name: "Kalem araçları" }).getByRole("button", { name: "Lazer" }).isVisible())) fail("Lazer not on the toolbar");
await draw(220);
await pen(page, "Kurşun kalem");
await draw(300);
await pen(page, "Tükenmez");
await openPens(page);
await page.getByLabel("Özel renk").fill("#123456");
await page.getByLabel("Kalınlık").fill("2");
await page.keyboard.press("Escape");
await draw(380);

// Laser: visible, then fades and is never saved.
await page.getByRole("button", { name: "Lazer" }).click();
await draw(460);
if (!(await p1.locator(".laser").count())) fail("laser line not drawn");
await page.waitForTimeout(4000);
if (await p1.locator(".laser").count()) fail("laser line did not fade");
await page.getByRole("button", { name: "Lazer" }).click();
await page.screenshot({ path: "docs/screenshots/reader-tools-light.png" });

// Image from the file picker, then move it.
const imgChooser = page.waitForEvent("filechooser");
await page.getByRole("button", { name: "Resim", exact: true }).click();
await page.getByRole("button", { name: "Dosyadan resim ekle" }).click();
await (await imgChooser).setFiles({ name: "nokta.png", mimeType: "image/png", buffer: PNG });
const pimg = p1.locator(".pimg");
await pimg.waitFor().catch(() => fail("image not placed"));
const ib = await pimg.boundingBox();
await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2);
await page.mouse.down();
await page.mouse.move(ib.x + ib.width / 2 - 60, ib.y + ib.height / 2 + 40, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(300);
const left0 = await pimg.evaluate((el) => el.style.left);

// Reopen: strokes and image are stored.
await page.getByRole("button", { name: "← Kütüphane" }).click();
await page.getByRole("button", { name: "Aç" }).click();
await page.locator(".textLayer span").first().waitFor();
const hl = p1.locator("svg.under path.hl");
await hl.first().waitFor({ timeout: 5000 }).catch(() => fail("highlighter lost after reopen"));
if ((await hl.first().getAttribute("stroke")) !== "#ff9ecb") fail("highlighter colour");
if (!(await p1.locator('path[data-kind="pencil"]').count())) fail("pencil lost after reopen");
const pen = p1.locator('path[data-kind="pen"]');
if ((await pen.count()) !== 1) fail(`pen strokes after reopen: ${await pen.count()} (laser must not be saved)`);
if ((await pen.getAttribute("stroke")) !== "#123456") fail("custom colour not saved");
await pimg.waitFor().catch(() => fail("image lost after reopen"));
if ((await pimg.evaluate((el) => el.style.left)) !== left0) fail("image move not saved");
if (!(await pimg.locator("img").getAttribute("src"))?.startsWith("blob:")) fail("image file not loaded");

// Delete the image with its button.
await pimg.click();
await page.getByRole("button", { name: "Resmi sil" }).click();
await page.waitForTimeout(300);
if (await pimg.count()) fail("image not deleted");

// Search (Ctrl+F) for a word from page 1.
const words = (await p1.locator(".textLayer").textContent()).split(/\s+/).filter((w) => /^\p{L}{5,}$/u.test(w));
if (!words.length) fail("no word on page 1");
const word = words[0];
await page.locator(".scroller").click({ position: { x: 5, y: 5 } });
await page.keyboard.press("Control+f");
const box = page.getByLabel("PDF'te ara");
await box.waitFor().catch(() => fail("Ctrl+F did not open search"));
await box.fill(word);
await box.press("Enter");
await page.locator(".search .count").filter({ hasText: /\d+ \/ \d+/ }).waitFor({ timeout: 5000 }).catch(() => fail(`no hits for ${word}`));
await page.locator(".found.current").first().waitFor({ timeout: 5000 }).catch(() => fail("current hit not marked"));
const count = (await page.locator(".search .count").textContent()).trim();
await page.getByRole("button", { name: "Sonraki sonuç" }).click();
await page.getByRole("button", { name: "Aramayı kapat" }).click();
if (await page.locator(".found").count()) fail("marks left after closing search");

// Page box jumps.
const input = page.getByLabel("Sayfa numarası");
await input.fill("3");
await input.press("Enter");
await page.waitForFunction(() => document.querySelector(".page-input")?.value === "3", null, { timeout: 5000 })
  .catch(() => fail("page box did not jump to 3"));

// Left panel: thumbnails and outline tab; a thumbnail jumps.
await page.getByRole("button", { name: "Sayfalar", exact: true }).click();
await page.locator(".nav canvas").first().waitFor().catch(() => fail("left panel did not open"));
await page.getByRole("button", { name: "Sayfa 1", exact: true }).click();
await page.waitForFunction(() => document.querySelector(".page-input")?.value === "1", null, { timeout: 5000 })
  .catch(() => fail("thumbnail did not jump to 1"));
await page.getByRole("tab", { name: "İçindekiler" }).click();
await page.locator(".nav .row, .nav .hint").first().waitFor().catch(() => fail("outline tab empty"));
await page.emulateMedia({ colorScheme: "dark" });
await page.screenshot({ path: "docs/screenshots/reader-tools-dark.png" });

console.log(`pen kinds ok | laser not saved | image ok | search "${word}" ${count} | page box ok | thumbnails ok`);
if (errors.length) fail("console errors");
await browser.close();
