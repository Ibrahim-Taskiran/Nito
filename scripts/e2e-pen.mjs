// E2E for the pen, round 2, on a phone (390×844) and a tablet (820×1180), with CDP pen and touch input:
// hold-to-correct shapes (line saved straight after reopen, circle), undo back to the raw stroke, palm rejection
// (large contact, "Yalnız kalemle çiz"), pictures from paste / drop / link, lasso select → move → scale 2× → reopen.
// Needs `npm run dev`.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env.NITO_URL ?? "http://localhost:1420";
const browser = await chromium.launch({ channel: process.env.NITO_BROWSER ?? "msedge" });
const errors = [];
let shot = null;
const fail = async (msg) => {
  console.error("FAIL:", msg, errors.join("\n"));
  await shot?.screenshot({ path: "tests/.out/pen-fail.png" }).catch(() => {});
  process.exit(1);
};

// A small PNG served by the dev server for the "Bağlantıdan resim ekle" and browser-drop checks.
mkdirSync("tests/.out", { recursive: true });
const PNG_B64 = await (async () => {
  const pg = await browser.newPage();
  const b64 = await pg.evaluate(() => {
    const c = Object.assign(document.createElement("canvas"), { width: 64, height: 32 });
    const g = c.getContext("2d");
    g.fillStyle = "#2f6fb0";
    g.fillRect(0, 0, 64, 32);
    return c.toDataURL("image/png").split(",")[1];
  });
  await pg.close();
  return b64;
})();
writeFileSync("tests/.out/pen-test.png", Buffer.from(PNG_B64, "base64"));
const imgUrl = new URL("/tests/.out/pen-test.png", url).href;

async function run(vp, label) {
  const page = await browser.newPage({ viewport: vp, hasTouch: true });
  shot = page;
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${label}: ${m.text()}`));
  const cdp = await page.context().newCDPSession(page);

  await page.goto(url);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "PDF ekle" }).click();
  await (await chooser).setFiles([resolve("tests/fixtures/notes/Hafta 5_Uzun Belge.pdf")]);
  // Phone: a tap on the document opens it. Tablet: it shows the detail panel with "Aç".
  const open = async () => {
    await page.getByRole("button", { name: /Uzun Belge/ }).first().click();
    const openBtn = page.getByRole("button", { name: "Aç", exact: true });
    if (await openBtn.waitFor({ timeout: 1500 }).then(() => true, () => false)) await openBtn.click();
    await page.locator(".textLayer span").first().waitFor();
    // The side panel would cover half of a phone page.
    const panel = page.getByRole("button", { name: "Vurgular", exact: true });
    if ((await panel.getAttribute("aria-pressed")) === "true") await panel.click();
    await page.waitForTimeout(300);
  };
  const reopen = async () => {
    await page.getByRole("button", { name: "← Kütüphane" }).click();
    await open();
  };
  await open();
  const p1 = page.locator('[data-page="1"]');
  const strokes = p1.locator("svg.ink:not(.under) path[data-id]");
  const box = async () => {
    await p1.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(150);
    return p1.boundingBox();
  };

  // ---- CDP input ----
  const pen = (type, x, y) =>
    cdp.send("Input.dispatchMouseEvent", {
      type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "pen", force: 0.5,
    });
  /** Pen stroke through points; `holdMs` keeps the pen still at the end before lifting. */
  const penStroke = async (pts, holdMs = 0) => {
    await pen("mousePressed", pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) await pen("mouseMoved", x, y);
    if (holdMs) await page.waitForTimeout(holdMs);
    await pen("mouseReleased", ...pts[pts.length - 1]);
    await page.waitForTimeout(450); // save + the pen-lift grace for touches
  };
  const touchStroke = async (pts, radius = 4) => {
    const tp = ([x, y]) => [{ x, y, id: 7, radiusX: radius, radiusY: radius, force: 0.5 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: tp(pts[0]) });
    for (const p of pts.slice(1)) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: tp(p) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(300);
  };
  let seed = 11;
  const jit = (a) => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * a;
  const wobblyLine = (x0, y0, x1, y1, n = 24, a = 2.5) =>
    Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n + jit(a), y0 + ((y1 - y0) * i) / n + jit(a)]);
  const circle = (cx, cy, r, n = 40) =>
    Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((i / n) * 2.05 * Math.PI) + jit(2), cy + r * Math.sin((i / n) * 2.05 * Math.PI) + jit(2)]);
  const count = () => strokes.count();
  const tool = (name) => page.getByRole("button", { name, exact: true }).click();
  const penMenu = async (option) => {
    await page.getByRole("button", { name: "Kalem ve dokunma" }).click();
    await page.getByRole("radio", { name: new RegExp(option) }).check();
    await page.keyboard.press("Escape");
  };

  // ---- Shape correction ----
  await tool("Tükenmez");
  let b = await box();
  const W = b.width;
  const H = Math.min(b.height, vp.height - b.y - 10);
  await penStroke(wobblyLine(b.x + W * 0.15, b.y + H * 0.2, b.x + W * 0.75, b.y + H * 0.2 + 6), 700);
  if ((await count()) !== 1) fail(`${label}: line not saved`);
  const straight = /^M([\d.]+) ([\d.]+)L([\d.]+) \2$/;
  if (!straight.test(await strokes.first().getAttribute("d"))) fail(`${label}: held line is not straight: ${await strokes.first().getAttribute("d")}`);
  await reopen();
  if (!straight.test((await strokes.first().getAttribute("d")) ?? "")) fail(`${label}: straight line lost after reopen`);

  await tool("Tükenmez");
  b = await box();
  await penStroke(circle(b.x + W * 0.5, b.y + H * 0.42, Math.min(70, W * 0.18)), 700);
  await page.getByRole("status").filter({ hasText: "Daire düzeltildi" }).waitFor({ timeout: 3000 }).catch(() => fail(`${label}: circle not recognised`));
  const circleD = await strokes.last().getAttribute("d");
  await page.getByRole("status").getByRole("button", { name: "Geri al" }).click();
  await page.waitForTimeout(300);
  const rawD = await strokes.last().getAttribute("d");
  if (rawD === circleD || (await count()) !== 2) fail(`${label}: undo did not restore the raw stroke`);
  // Ctrl+Z again removes the stroke.
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  if ((await count()) !== 1) fail(`${label}: Ctrl+Z did not remove the stroke`);

  // Handwriting-sized marks are never changed even when held.
  await penStroke(circle(b.x + W * 0.3, b.y + H * 0.62, 6, 20), 700);
  if (await page.getByRole("status").filter({ hasText: "düzeltildi" }).count()) fail(`${label}: small mark was corrected`);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);

  // ---- Palm and touch rejection ----
  await penMenu("Parmakla da çiz");
  b = await box();
  await touchStroke(wobblyLine(b.x + W * 0.2, b.y + H * 0.66, b.x + W * 0.6, b.y + H * 0.66 + 20, 10, 1), 30); // palm: 60 px contact
  if ((await count()) !== 1) fail(`${label}: large-contact touch drew`);
  await touchStroke(wobblyLine(b.x + W * 0.2, b.y + H * 0.72, b.x + W * 0.6, b.y + H * 0.72 + 20, 10, 1), 4); // finger draws
  if ((await count()) !== 2) fail(`${label}: finger did not draw in "Parmakla da çiz"`);
  await penMenu("Yalnız kalemle çiz");
  await touchStroke(wobblyLine(b.x + W * 0.2, b.y + H * 0.78, b.x + W * 0.6, b.y + H * 0.78 + 20, 10, 1), 4);
  if ((await count()) !== 2) fail(`${label}: finger drew in "Yalnız kalemle çiz"`);
  await reopen(); // the setting is remembered on this device
  await tool("Tükenmez");
  b = await box();
  await touchStroke(wobblyLine(b.x + W * 0.2, b.y + H * 0.78, b.x + W * 0.6, b.y + H * 0.78 + 20, 10, 1), 4);
  if ((await count()) !== 2) fail(`${label}: "Yalnız kalemle çiz" not remembered`);
  await tool("Tükenmez");

  // ---- Pictures: paste, drop from a browser, link ----
  const images = p1.locator(".pimg");
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "pano.png", { type: "image/png" }));
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt }));
  }, PNG_B64);
  await page.waitForFunction(() => document.querySelectorAll('[data-page="1"] .pimg').length === 1, null, { timeout: 4000 })
    .catch(() => fail(`${label}: pasted image missing`));
  b = await box();
  await page.evaluate(({ x, y, src }) => {
    const dt = new DataTransfer();
    dt.setData("text/html", `<img src="${src}">`);
    dt.setData("text/uri-list", src);
    const el = document.elementFromPoint(x, y);
    el.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  }, { x: b.x + W * 0.7, y: b.y + H * 0.3, src: imgUrl });
  await page.waitForFunction(() => document.querySelectorAll('[data-page="1"] .pimg').length === 2, null, { timeout: 4000 })
    .catch(() => fail(`${label}: dropped browser image missing`));
  await page.getByRole("button", { name: "Web resmi" }).click();
  await page.getByRole("textbox", { name: "Resim bağlantısı" }).fill(imgUrl);
  await page.getByRole("button", { name: "Bağlantıdan resim ekle" }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-page="1"] .pimg').length === 3, null, { timeout: 5000 })
    .catch(() => fail(`${label}: link image missing`));
  // A web page link is refused with a message.
  await page.getByRole("button", { name: "Web resmi" }).click();
  await page.getByRole("textbox", { name: "Resim bağlantısı" }).fill(new URL("/", url).href);
  await page.getByRole("button", { name: "Bağlantıdan resim ekle" }).click();
  await page.getByRole("alert").waitFor({ timeout: 4000 }).catch(() => fail(`${label}: no message for a non-image link`));
  await page.keyboard.press("Escape"); // the link panel stays open on an error so the link can be fixed
  await page.getByRole("button", { name: "Uyarıyı kapat" }).click();
  await reopen();
  if ((await images.count()) !== 3) fail(`${label}: images lost after reopen (${await images.count()})`);

  // ---- Lasso: select two strokes, move, scale 2×, reopen (the pictures' centres lie outside the lasso) ----
  await tool("Tükenmez");
  await penMenu("Otomatik");
  b = await box();
  let y0 = b.y + H * 0.5;
  await penStroke(wobblyLine(b.x + W * 0.2, y0, b.x + W * 0.35, y0 + 30, 10, 1));
  await penStroke(wobblyLine(b.x + W * 0.25, y0 + 50, b.x + W * 0.4, y0 + 40, 10, 1));
  const n0 = await count();
  const geom = () => page.evaluate(() => {
    const ps = [...document.querySelectorAll('[data-page="1"] svg.ink:not(.under) path[data-id]')].slice(-2);
    const rs = ps.map((p) => p.getBoundingClientRect());
    return { x: Math.min(...rs.map((r) => r.left)), y: Math.min(...rs.map((r) => r.top)), w: Math.max(...rs.map((r) => r.right)) - Math.min(...rs.map((r) => r.left)) };
  });
  const before = await geom();
  await tool("Seç");
  // The toolbar loses the colour row, so the page moves: lasso relative to where the page is now.
  const bs = await p1.boundingBox();
  y0 += bs.y - b.y;
  b = bs;
  const lx0 = b.x + W * 0.15, lx1 = b.x + W * 0.45;
  await penStroke([[lx0, y0 - 20], [lx1, y0 - 20], [lx1, y0 + 75], [lx0, y0 + 75], [lx0, y0 - 18]].flatMap((p, i, a) =>
    i ? Array.from({ length: 6 }, (_, k) => [a[i - 1][0] + ((p[0] - a[i - 1][0]) * (k + 1)) / 6, a[i - 1][1] + ((p[1] - a[i - 1][1]) * (k + 1)) / 6]) : [p]));
  const selBox = p1.locator(".sel-layer .box");
  await selBox.waitFor({ timeout: 3000 }).catch(() => fail(`${label}: lasso selected nothing`));
  // Move by (+30, +20) with a finger on the box.
  let sb = await selBox.boundingBox();
  await touchStroke(wobblyLine(sb.x + sb.width / 2, sb.y + sb.height / 2, sb.x + sb.width / 2 + 30, sb.y + sb.height / 2 + 20, 8, 0), 4);
  await page.waitForTimeout(300);
  // Scale 2× from the bottom-right handle with the pen (top-left stays).
  sb = await selBox.boundingBox();
  const hx = sb.x + sb.width, hy = sb.y + sb.height;
  await penStroke(Array.from({ length: 9 }, (_, i) => [hx + (sb.width * i) / 8, hy + (sb.height * i) / 8]));
  await reopen();
  const after = await geom();
  if ((await count()) !== n0) fail(`${label}: stroke count changed after move/scale`);
  const dx = after.x - before.x;
  if (!(Math.abs(after.w / before.w - 2) < 0.15)) fail(`${label}: scale ${(after.w / before.w).toFixed(2)}× instead of 2×`);
  if (!(dx > 20 && dx < 40)) fail(`${label}: moved by ${dx.toFixed(1)} px instead of ~30`);

  // Tap a stroke to select it; copy / paste, recolour, delete, each undoable.
  await tool("Seç");
  const onPath = await strokes.last().evaluate((p) => {
    const q = p.getPointAtLength(p.getTotalLength() / 2).matrixTransform(p.getScreenCTM());
    return [q.x, q.y];
  });
  await penStroke([onPath, onPath]);
  await selBox.waitFor({ timeout: 3000 }).catch(() => fail(`${label}: tap did not select the stroke`));
  await page.getByRole("button", { name: "Kopyala", exact: true }).click();
  await page.getByRole("button", { name: "Yapıştır", exact: true }).click();
  await page.waitForTimeout(300);
  if ((await count()) !== n0 + 1) fail(`${label}: paste did not add the copy`);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  if ((await count()) !== n0) fail(`${label}: undo did not remove the pasted copy`);
  await penStroke([onPath, onPath]);
  await page.getByRole("button", { name: "Seçim rengi: Kırmızı" }).click();
  await page.waitForTimeout(300);
  if ((await strokes.last().getAttribute("stroke")) !== "#c0392b") fail(`${label}: recolour failed`);
  await page.getByRole("button", { name: "Seçimi sil" }).click();
  await page.waitForTimeout(300);
  if ((await count()) !== n0 - 1) fail(`${label}: delete failed`);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  if ((await count()) !== n0) fail(`${label}: undo did not bring the deleted stroke back`);
  await page.screenshot({ path: `tests/.out/pen-${label}.png` });
  await page.close();
  return `${label}: line+circle+undo ok, palm ok, 3 images ok, lasso move ${dx.toFixed(0)}px scale ${(after.w / before.w).toFixed(2)}×`;
}

const out = [];
out.push(await run({ width: 390, height: 844 }, "phone"));
out.push(await run({ width: 820, height: 1180 }, "tablet"));
console.log(out.join(" | "));
if (errors.length) fail("console errors");
await browser.close();
