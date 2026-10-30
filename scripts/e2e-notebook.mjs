// E2E for Phase 3.8 notebook ("Defter"): opens beside the PDF with one plain page, adds a Kareli page, draws on it
// with the reader's pen, resizes the column, reopens the document (the stroke is still there), deletes a page with
// confirm, and on a phone covers the PDF until closed. Needs the dev server (NITO_URL).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const url = process.env.NITO_URL ?? "http://localhost:1420";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 860 };

/** A two-page PDF. */
function pdf() {
  const pages = ["Defter deneme", "Ikinci sayfa"];
  const streams = pages.map((l) => `BT /F1 18 Tf 72 720 Td (${l}) Tj ET`);
  const n = pages.length;
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${n} >>`];
  streams.forEach((s, i) => {
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${3 + n * 2} 0 R >> >> >>`);
    objs.push(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`);
  });
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let out = "%PDF-1.4\n";
  const offsets = objs.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({ channel: process.env.NITO_BROWSER ?? "msedge" });
const ctx = await browser.newContext({ viewport: DESKTOP, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const fail = async (msg) => {
  console.error("FAIL:", msg, errors.join("\n"));
  await page.screenshot({ path: "test-results/e2e-notebook-fail.png" }).catch(() => {});
  process.exit(1);
};
const pane = page.getByRole("complementary", { name: "Defter" });
const nbPages = pane.locator("[data-nb-page]");
const toggle = page.getByRole("button", { name: "Defter", exact: true });
const pen = page.getByRole("button", { name: "Tükenmez" });
const waitCount = (n, what) =>
  page.waitForFunction((n) => document.querySelectorAll("[data-nb-page]").length === n, n, { timeout: 5000 }).catch(() => fail(what));

await page.goto(url);
const chooser = page.waitForEvent("filechooser");
await page.getByRole("button", { name: "PDF ekle" }).click();
await (await chooser).setFiles([{ name: "Hafta 5_Defter.pdf", mimeType: "application/pdf", buffer: pdf() }]);
const openDoc = async () => {
  const open = page.getByRole("button", { name: "Aç" });
  const input = page.getByRole("textbox", { name: "Sayfa numarası" });
  await page.getByRole("button", { name: /Hafta 5: Defter/ }).first().click();
  await open.or(input).first().waitFor();
  if (await open.isVisible()) await open.click();
  await page.locator(".scroller .textLayer span").first().waitFor({ timeout: 15_000 }).catch(() => fail("document did not open"));
};
await openDoc();

// ---- 1) Opens beside the PDF with one plain page.
await toggle.click();
await waitCount(1, "notebook should start with one page");
if ((await nbPages.first().getAttribute("data-kind")) !== "plain") await fail("first page should be plain");
const pdfBox = await page.locator(".scroller").first().boundingBox();
const nbBox = await pane.boundingBox();
if (!(nbBox.x >= pdfBox.x + pdfBox.width - 2)) await fail("desktop: notebook should be a column right of the PDF");

// ---- 2) Add a Kareli page; the grid is drawn by CSS.
await pane.getByRole("button", { name: "Sayfa ekle" }).click();
await pane.getByRole("button", { name: "Kareli" }).click();
await waitCount(2, "Kareli page not added");
const grid = nbPages.nth(1);
if ((await grid.getAttribute("data-kind")) !== "grid") await fail("second page should be grid");
if (!(await grid.evaluate((el) => getComputedStyle(el).backgroundImage)).includes("linear-gradient")) await fail("grid paper not drawn");
const gridKey = await grid.getAttribute("data-nb-page");

// ---- 3) Draw on it with the reader's pen.
await grid.scrollIntoViewIfNeeded();
const g = await grid.boundingBox();
await pen.click();
await page.mouse.move(g.x + 60, g.y + 80);
await page.mouse.down();
await page.mouse.move(g.x + 180, g.y + 140, { steps: 8 });
await page.mouse.up();
await pen.click();
const strokes = () => page.locator(`[data-nb-page="${gridKey}"] path[data-kind="pen"]`).count();
await page.waitForFunction((k) => document.querySelectorAll(`[data-nb-page="${k}"] path[data-kind="pen"]`).length === 1, gridKey, { timeout: 5000 })
  .catch(() => fail("stroke not drawn on the notebook page"));
if (await page.locator('.scroller [data-page] path[data-kind="pen"]').count()) await fail("stroke leaked onto a PDF page");
console.log("notebook: opens beside the PDF, Kareli page added, pen draws on it");

// ---- 4) Drag the left edge: the column grows.
const handle = pane.getByRole("separator", { name: "Defter genişliği" });
const h = await handle.boundingBox();
await page.mouse.move(h.x + h.width / 2, h.y + 200);
await page.mouse.down();
await page.mouse.move(h.x - 100, h.y + 200, { steps: 5 });
await page.mouse.up();
const grown = (await pane.boundingBox()).width;
if (!(grown > nbBox.width + 60)) await fail(`resize: ${nbBox.width} -> ${grown}`);
await page.screenshot({ path: "test-results/notebook-desktop.png" });

// ---- 5) Close, reopen the document: pages and the stroke are kept.
await toggle.click();
if (await pane.count()) await fail("notebook did not close");
await page.getByRole("button", { name: "← Kütüphane" }).click();
await openDoc();
await toggle.click();
await waitCount(2, "pages lost after reopening");
if ((await nbPages.nth(1).getAttribute("data-kind")) !== "grid") await fail("page kind lost after reopening");
if ((await strokes()) !== 1) await fail("stroke lost after reopening");
console.log("notebook: pages and ink kept after reopening");

// ---- 6) Add a Çizgili page and delete it with confirm.
await pane.getByRole("button", { name: "Sayfa ekle" }).click();
await pane.getByRole("button", { name: "Çizgili" }).click();
await waitCount(3, "Çizgili page not added");
await pane.getByRole("button", { name: "Sayfayı sil" }).nth(2).click();
await page.getByRole("dialog").getByRole("button", { name: "Sil" }).click();
await waitCount(2, "page not deleted");
if ((await strokes()) !== 1) await fail("deleting another page removed the stroke");
console.log("notebook: delete with confirm");

// ---- 7) Phone: the notebook covers the PDF; closing it shows the PDF again.
await page.setViewportSize(PHONE);
await page.waitForTimeout(200);
const pb = await pane.boundingBox();
if (!(pb.width >= PHONE.width - 2)) await fail(`phone: notebook should fill the width (${pb.width})`);
const nb0 = await nbPages.first().boundingBox();
if (!(nb0.width > 300 && nb0.x >= 0 && nb0.x + nb0.width <= PHONE.width)) await fail("phone: page should fit the screen");
await page.screenshot({ path: "test-results/notebook-phone.png" });
await pane.getByRole("button", { name: "Defteri kapat" }).click();
if (await pane.count()) await fail("phone: notebook did not close");
if (!(await page.locator(".scroller [data-page]").first().isVisible())) await fail("phone: PDF not shown after closing");
console.log("notebook: phone covers the PDF and closes");

if (errors.length) await fail("console errors");
await browser.close();
console.log("e2e-notebook OK");
