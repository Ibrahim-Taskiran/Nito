// Big-PDF performance check (not in the e2e chain): builds a 500-page PDF with a full-page "scan" on every
// 5th page and three huge (A0) pages, opens it in the reader and prints open time, scroll time and memory.
// Needs the dev server (NITO_URL). PAGES=… changes the page count. No dependencies: the PDF is written by hand.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const url = process.env.NITO_URL ?? "http://localhost:1420";
const PAGES = Number(process.env.PAGES ?? 500);

/** Grey "scan" (A4 at 300 dpi) with ruled text-like stripes and noise, deflated once and reused per page. */
function scanImage(w = 2480, h = 3508) {
  const px = Buffer.alloc(w * h);
  let seed = 7;
  for (let y = 0; y < h; y++) {
    const line = Math.floor(y / 60) % 2 === 0 && y % 60 > 20;
    for (let x = 0; x < w; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const ink = line && x > 200 && x < w - 200 && (x >> 5) % 5 !== 0 ? 60 : 235;
      px[y * w + x] = ink + ((seed >> 16) & 15);
    }
  }
  return { w, h, data: deflateSync(px, { level: 6 }) };
}

export function bigPdf(pages = PAGES) {
  const img = scanImage();
  const chunks = [];
  let size = 0;
  const offsets = [];
  const push = (b) => {
    const buf = typeof b === "string" ? Buffer.from(b, "latin1") : b;
    chunks.push(buf);
    size += buf.length;
  };
  // Object numbers: 1 catalog, 2 pages, 3 font, then per page: page, content, (image).
  let next = 4;
  const plan = [];
  for (let i = 1; i <= pages; i++) {
    const scanned = i % 5 === 0;
    const huge = i >= 250 && i <= 252;
    plan.push({ i, scanned, huge, page: next, content: next + 1, image: scanned ? next + 2 : 0 });
    next += scanned ? 3 : 2;
  }
  const obj = (n, body) => {
    offsets[n] = size;
    push(`${n} 0 obj\n`);
    for (const b of [body].flat()) push(b);
    push("\nendobj\n");
  };
  push("%PDF-1.5\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${plan.map((p) => `${p.page} 0 R`).join(" ")}] /Count ${pages} >>`);
  obj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  for (const p of plan) {
    const [w, h] = p.huge ? [2384, 3370] : [595, 842];
    const lines = Array.from({ length: 30 }, (_, k) => `(Sayfa ${p.i} satir ${k + 1}: ag protokolleri ve katmanlar) Tj T*`).join(" ");
    const stream = (p.scanned ? `q ${w} 0 0 ${h} 0 0 cm /Im1 Do Q ` : "") + `BT /F1 12 Tf 50 ${h - 60} Td 16 TL ${lines} ET`;
    const res = `/Font << /F1 3 0 R >>${p.scanned ? ` /XObject << /Im1 ${p.image} 0 R >>` : ""}`;
    obj(p.page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Contents ${p.content} 0 R /Resources << ${res} >> >>`);
    obj(p.content, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    if (p.scanned) {
      obj(p.image, [
        `<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${img.data.length} >>\nstream\n`,
        img.data,
        "\nendstream",
      ]);
    }
  }
  const xref = size;
  let table = `xref\n0 ${next}\n0000000000 65535 f \n`;
  for (let n = 1; n < next; n++) table += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(table + `trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(chunks);
}

const t0 = Date.now();
const pdf = bigPdf();
console.log(`PDF: ${PAGES} pages, ${(pdf.length / 1024 ** 2).toFixed(1)} MB, built in ${Date.now() - t0} ms`);

const browser = await chromium.launch({ channel: process.env.NITO_BROWSER ?? "msedge", args: ["--enable-precise-memory-info"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

/** JS heap (MB), live canvas pixels (megapixels: page + thumbnail bitmaps), page/thumb canvases holding a bitmap, DOM nodes. */
async function snapshot(label) {
  await cdp.send("HeapProfiler.collectGarbage").catch(() => {});
  const { metrics } = await cdp.send("Performance.getMetrics");
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const c = await page.evaluate(() => {
    let px = 0, pages = 0, thumbs = 0;
    for (const el of document.querySelectorAll("canvas")) {
      // 300x150 is the size of a canvas nothing was drawn on yet.
      if (!el.width || (el.width === 300 && el.height === 150)) continue;
      px += el.width * el.height;
      if (el.closest("[data-page]")) pages++;
      else thumbs++;
    }
    return { px, pages, thumbs };
  });
  const row = {
    label,
    heapMB: +(m.JSHeapUsedSize / 1024 ** 2).toFixed(1),
    canvasMP: +(c.px / 1e6).toFixed(1),
    pageCanvases: c.pages,
    thumbCanvases: c.thumbs,
    domNodes: m.Nodes,
  };
  console.log(JSON.stringify(row));
  return row;
}

await page.goto(url);
const chooser = page.waitForEvent("filechooser");
await page.getByRole("button", { name: "PDF ekle" }).click();
// Playwright passes buffers up to 50 MB only, so go through a file (tests/.out is git-ignored).
mkdirSync("tests/.out", { recursive: true });
writeFileSync("tests/.out/Hafta 9_Buyuk Tarama.pdf", pdf);
await (await chooser).setFiles(["tests/.out/Hafta 9_Buyuk Tarama.pdf"]);
await page.getByRole("button", { name: /Buyuk Tarama/ }).first().waitFor({ timeout: 60_000 });
await page.getByRole("button", { name: /Buyuk Tarama/ }).first().click();

await page.evaluate(() => {
  window.__longTasks = 0;
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longTasks += e.duration; }).observe({ type: "longtask", buffered: false });
});
const tOpen = Date.now();
await page.getByRole("button", { name: "Aç" }).click();
await page.locator('[data-page="1"] .textLayer span').first().waitFor({ state: "attached", timeout: 120_000 }).catch(async (e) => {
  await page.screenshot({ path: "tests/.out/perf-fail.png" });
  console.log(await page.evaluate(() => document.querySelector(".scroller")?.innerText.slice(0, 200)), errors);
  throw e;
});
const openMs = Date.now() - tOpen;
await page.waitForFunction((n) => document.querySelectorAll("[data-page]").length === n, PAGES, { timeout: 60_000 });
const allMs = Date.now() - tOpen;
console.log(`open: first page text ${openMs} ms, all ${PAGES} page boxes ${allMs} ms`);
await page.waitForTimeout(1500);
await snapshot("after open");

// Scroll through the whole document in viewport steps; each step waits until the visible page has pixels.
const scroller = page.locator(".scroller");
const steps = await scroller.evaluate((el) => Math.ceil(el.scrollHeight / el.clientHeight));
let stepMax = 0;
let stepSum = 0;
const tScroll = Date.now();
for (let s = 1; s <= steps; s++) {
  const t = Date.now();
  await scroller.evaluate((el, s) => (el.scrollTop = s * el.clientHeight), s);
  await page.waitForFunction(() => {
    const sc = document.querySelector(".scroller");
    const box = sc.getBoundingClientRect();
    const mid = document.elementsFromPoint(box.left + box.width / 2, box.top + box.height / 2).find((e) => e.matches?.("[data-page]"));
    return !mid || mid.querySelector("canvas").width > 0;
  }, null, { timeout: 30_000 });
  const d = Date.now() - t;
  stepMax = Math.max(stepMax, d);
  stepSum += d;
}
const scrollMs = Date.now() - tScroll;
const longTasks = Math.round(await page.evaluate(() => window.__longTasks));
console.log(`scroll: ${steps} steps in ${scrollMs} ms, avg ${Math.round(stepSum / steps)} ms, worst ${stepMax} ms, long tasks ${longTasks} ms`);
await page.waitForTimeout(1500);
await snapshot("after scroll to end");

// Fast fling back to the top: render tasks for pages that left the screen should be cancelled.
const tFling = Date.now();
for (let s = steps; s >= 0; s -= 4) await scroller.evaluate((el, s) => (el.scrollTop = s * el.clientHeight), s);
await page.locator('[data-page="1"] canvas').evaluate((c) => new Promise((r) => {
  const tick = () => (c.width ? r() : setTimeout(tick, 20));
  tick();
}));
console.log(`fling to top: page 1 drawn after ${Date.now() - tFling} ms`);

// Page panel: scroll the thumbnails to the end.
const navBtn = page.getByRole("button", { name: "Sayfalar", exact: true });
if (!(await page.getByRole("complementary", { name: "Sayfalar ve içindekiler" }).count())) await navBtn.click();
const list = page.locator(".nav .list");
await list.waitFor();
const tNav = Date.now();
const navSteps = await list.evaluate((el) => Math.ceil(el.scrollHeight / el.clientHeight));
for (let s = 1; s <= navSteps; s++) {
  await list.evaluate((el, s) => (el.scrollTop = s * el.clientHeight), s);
  await page.waitForTimeout(40);
}
await page.locator(`[data-thumb="${PAGES}"] canvas`).evaluate((c) => new Promise((r) => {
  const tick = () => (c.width ? r() : setTimeout(tick, 20));
  tick();
}));
console.log(`thumbnails: scrolled ${navSteps} steps, last thumbnail drawn after ${Date.now() - tNav} ms`);
await page.waitForTimeout(1000);
await snapshot("after thumbnails to end");

// Zoom to the max on a huge (A0) page: the canvas must stay within the cap.
await page.locator(".page-input").fill("251");
await page.locator(".page-input").press("Enter");
for (let i = 0; i < 8; i++) await page.getByRole("button", { name: "Yakınlaştır" }).click();
await page.waitForTimeout(400);
// Zoom keeps the scroll offset, so jump back to the huge page.
const tZoom = Date.now();
await page.locator(".page-input").fill("251");
await page.locator(".page-input").press("Enter");
const drawn = await page.waitForFunction(() => {
  const c = document.querySelector('[data-page="251"] canvas');
  if (!c?.width) return false;
  // After the fix the canvas says which zoom it was drawn at; before it, the bitmap matched the CSS size.
  const zoom = parseInt(document.querySelector(".zoom").textContent) / 100;
  return c.dataset.scale ? Number(c.dataset.scale) === zoom : Math.abs(c.getBoundingClientRect().width - c.width / devicePixelRatio) < 2;
}, null, { timeout: 60_000 }).then(() => true, () => false);
const huge = await page.locator('[data-page="251"] canvas').evaluate((c) => ({ w: c.width, h: c.height }));
console.log(`huge page at 400%: ${drawn ? "drawn" : "NOT drawn in 60 s"}, canvas ${huge.w}x${huge.h} (${(huge.w * huge.h / 1e6).toFixed(1)} MP), ${Date.now() - tZoom} ms`);
await snapshot("huge page zoomed");

if (errors.length) console.log("page errors:", errors.slice(0, 5).join(" | "));
await browser.close();
