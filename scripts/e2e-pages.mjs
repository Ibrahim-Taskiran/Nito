// E2E for Phase 3.7 pages: the transcript beside its page (side column on wide screens, a collapsible block
// under the page on phones), the "Önemli" mini PDF (only important pages, tap jumps the main reader,
// "PDF olarak kaydet" downloads a real PDF), and blank pages (insert from the page menu and from a
// PageNav long press, draw on one, reopen, delete with confirm). Phone 390x844, tablet 820x1180, desktop.
// Fake whisper. Needs the dev server (NITO_URL).
import { chromium } from "@playwright/test";
import { penToggle } from "./e2e-ink.mjs";
import { mkdirSync, readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

const url = process.env.NITO_URL ?? "http://localhost:1420";
const PHONE = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };
const DESKTOP = { width: 1280, height: 860 };

/** A six-page PDF; each page has its own sentence. */
function lecturePdf() {
  const pages = ["Giris katmanlar", "Fiziksel katman bitleri tasir", "Veri baglantisi cerceve kurar", "Bellman-Ford uzaklik vektoru",
    "Ag katmani yonlendirir", "Ozet ve tekrar"];
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
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

// One paragraph; the cue falls late in the text, i.e. on page 2.
const whisper = JSON.stringify({
  transcription: [
    { offsets: { from: 0, to: 3000 }, text: " Merhaba arkadaşlar, bugün katmanları ve aralarındaki ilişkileri ayrıntılı olarak anlatacağım, iyi dinleyin." },
    { offsets: { from: 3000, to: 6000 }, text: " Bu konu çok önemli, sınavda çıkar." },
  ],
});

mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({
  channel: process.env.NITO_BROWSER ?? "msedge",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const ctx = await browser.newContext({ viewport: DESKTOP, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
await page.addInitScript((w) => (window.__NITO_FAKE_WHISPER__ = w), whisper);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const fail = async (msg) => {
  console.error("FAIL:", msg, errors.join("\n"));
  await page.screenshot({ path: "test-results/e2e-pages-fail.png" }).catch(() => {});
  process.exit(1);
};
const minHeight = async (loc, what) => {
  for (const b of await loc.all()) {
    const h = (await b.boundingBox())?.height ?? 0;
    if (h && h < 40) await fail(`${what}: touch target ${h}px < 40px`);
  }
};
const input = page.getByRole("textbox", { name: "Sayfa numarası" });
const jump = async (label) => {
  await input.fill(String(label));
  await input.press("Enter");
  await page.waitForFunction((l) => document.querySelector(".page-input")?.value === l, String(label)).catch(() => fail(`jump to ${label}`));
};
const tr = (n) => page.locator(`[data-transcript="${n}"]`);
const drawOn = async (loc) => {
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  await penToggle(page);
  await page.mouse.move(box.x + 60, box.y + 80);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 120, { steps: 8 });
  await page.mouse.up();
  await penToggle(page);
};
/** Touch long press through CDP: pointerType "touch", as on a tablet. */
const cdp = await ctx.newCDPSession(page);
const longPress = async (loc) => {
  const b = await loc.boundingBox();
  const p = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p] });
  await page.waitForTimeout(700);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};

await page.goto(url);
const chooser = page.waitForEvent("filechooser");
await page.getByRole("button", { name: "PDF ekle" }).click();
await (await chooser).setFiles([{ name: "Hafta 3_Katmanlar.pdf", mimeType: "application/pdf", buffer: lecturePdf() }]);
const openDoc = async () => {
  const open = page.getByRole("button", { name: "Aç" });
  await page.getByRole("button", { name: /Hafta 3: Katmanlar/ }).first().click();
  // A selected document opens on the first tap; otherwise its detail panel offers "Aç".
  await open.or(input).first().waitFor();
  if (await open.isVisible()) await open.click();
  await page.locator('.scroller .textLayer span').first().waitFor();
};
await openDoc();

// ---- 1) Transcript beside the page. Record: page 1 for 2 s, page 2 for 2.5 s; then the fake transcript.
await page.getByRole("button", { name: "Ses kaydı" }).click();
await page.getByRole("button", { name: "Duraklat" }).waitFor();
await page.waitForTimeout(2000);
await jump(2);
await page.waitForTimeout(2500);
await page.getByRole("button", { name: "Kaydı durdur" }).click();
await page.getByRole("button", { name: "Yazıya dök" }).click({ timeout: 10_000 });
await page.getByRole("button", { name: "Dökümü gizle" }).waitFor({ timeout: 20_000 }).catch(() => fail("no transcript"));
// Desktop without the side panel: a column right of page 2.
await page.getByRole("button", { name: "Vurgular", exact: true }).click();
await tr(2).waitFor({ timeout: 5000 }).catch(() => fail("no transcript beside page 2"));
const p2 = page.locator('.scroller [data-page="2"]');
const [pb, tb] = [await p2.boundingBox(), await tr(2).boundingBox()];
if (!(tb.x >= pb.x + pb.width - 1)) await fail(`desktop: transcript should be right of the page (${tb.x} vs ${pb.x + pb.width})`);
if (!(await tr(2).locator("li p", { hasText: "sınavda çıkar" }).count())) await fail("page 2 transcript lacks the paragraph");
if (!(await tr(2).getByRole("button", { name: /“çok önemli”/ }).count())) await fail("cue badge missing in the paragraph");
await tr(2).getByRole("button", { name: /anından dinle/ }).first().click();
// The player controls live in the side panel.
await page.getByRole("button", { name: "Vurgular", exact: true }).click();
await page.getByRole("button", { name: "Oynatmayı durdur" }).waitFor({ timeout: 5000 }).catch(() => fail("mm:ss did not play"));
await page.getByRole("button", { name: "Oynatmayı durdur" }).click();
await page.getByRole("button", { name: "Vurgular", exact: true }).click();
// No popover any more: the cue chip opens the same block.
if (await page.getByRole("dialog", { name: /dökümü/ }).count()) await fail("old popover still there");
await page.screenshot({ path: "docs/screenshots/pages-transcript-desktop.png" });
console.log("transcript: side column on desktop, mm:ss plays, cue badge");

// Tablet portrait and phone: a collapsible block under the page.
for (const [vp, name] of [[TABLET, "tablet"], [PHONE, "phone"]]) {
  await page.setViewportSize(vp);
  await jump(2);
  await tr(2).waitFor().catch(() => fail(`${name}: no transcript block`));
  const [b, t] = [await p2.boundingBox(), await tr(2).boundingBox()];
  if (!(t.y >= b.y + b.height - 8)) await fail(`${name}: transcript should be under the page (${t.y} vs ${b.y + b.height})`);
  const head = tr(2).getByRole("button", { name: /Döküm · s\. 2/ });
  if ((await head.getAttribute("aria-expanded")) !== "false") await fail(`${name}: block should start collapsed`);
  await head.click();
  await tr(2).locator("li p", { hasText: "sınavda çıkar" }).waitFor().catch(() => fail(`${name}: block did not expand`));
  await minHeight(tr(2).getByRole("button"), `${name} transcript`);
  if (name === "phone") await page.screenshot({ path: "docs/screenshots/pages-transcript-phone.png" });
  await head.click();
}
// The cue chip on the page opens the block too.
await p2.getByRole("button", { name: /Sınav ipucu/ }).click();
await tr(2).locator("li p", { hasText: "sınavda çıkar" }).waitFor().catch(() => fail("cue chip did not open the block"));
await p2.getByRole("button", { name: /Sınav ipucu/ }).click();
// Toggle off in the Sayfa menu: no blocks; on again.
await page.setViewportSize(DESKTOP);
const pageMenu = async () => {
  await page.getByRole("button", { name: "Sayfa", exact: true }).click();
  return page.getByRole("group", { name: "Sayfa" });
};
await (await pageMenu()).getByText("Dökümü sayfanın yanında göster").click();
await page.keyboard.press("Escape");
if (await tr(2).count()) await fail("transcript still shown after turning it off");
await (await pageMenu()).getByText("Dökümü sayfanın yanında göster").click();
await page.keyboard.press("Escape");
await tr(2).waitFor().catch(() => fail("transcript did not come back"));
console.log("transcript: under the page on tablet portrait and phone, collapsible, toggle works");

// ---- 2) "Önemli" mini PDF: pages 4 and 2, ink on 4.
const markImportant = async (n) => {
  await jump(n);
  await page.getByRole("button", { name: /^İşaret/ }).click();
  await page.getByRole("group", { name: /^İşaret/ }).getByText("Önemli", { exact: true }).click();
  await page.keyboard.press("Escape");
};
await jump(4);
await drawOn(page.locator('.scroller [data-page="4"]'));
await markImportant(4);
await markImportant(2);
await jump(1);
await page.getByRole("button", { name: "Önemli sayfalar (2)" }).click();
const pane = page.getByRole("complementary", { name: "Önemli sayfalar" });
await pane.waitFor();
const labels = await pane.locator(".label").allInnerTexts();
if (labels.join(",") !== "s. 2,s. 4") await fail(`mini PDF pages: ${labels.join(",")}`);
await pane.locator('[data-mini="4"] canvas').waitFor();
if (!(await pane.locator('[data-mini="4"] svg path').count())) await fail("mini page 4 lacks its ink");
await pane.getByRole("button", { name: "Sayfa 4'ye git" }).click();
await page.waitForFunction(() => document.querySelector(".page-input")?.value === "4").catch(() => fail("mini page tap did not jump"));
const dl = page.waitForEvent("download");
await pane.getByRole("button", { name: "PDF olarak kaydet" }).click();
const file = await (await dl).path();
const out = await PDFDocument.load(readFileSync(file));
if (out.getPageCount() !== 2) await fail(`export should have 2 pages, got ${out.getPageCount()}`);
console.log("important: mini PDF shows s. 2, s. 4 with ink, tap jumps, export has 2 pages");
await page.setViewportSize(PHONE);
const sheet = await pane.boundingBox();
if (Math.round(sheet.y + sheet.height) !== PHONE.height || Math.round(sheet.width) !== PHONE.width) {
  await fail(`phone: mini PDF should be a bottom sheet, got ${JSON.stringify(sheet)}`);
}
await minHeight(pane.getByRole("button", { name: /PDF olarak kaydet|kapat/ }), "mini PDF header");
await page.screenshot({ path: "docs/screenshots/pages-important-phone.png" });
await pane.getByRole("button", { name: "Önemli sayfaları kapat" }).click();

// ---- 3) Blank pages on the tablet.
await page.setViewportSize(TABLET);
await jump(3);
await (await pageMenu()).getByRole("button", { name: "Arkasına boş sayfa ekle" }).click();
await page.waitForFunction(() => document.querySelector(".page-input")?.value === "3a").catch(() => fail("blank page 3a not shown"));
const blank = page.locator(".scroller [data-blank]");
if ((await blank.count()) !== 1) await fail("one blank page expected");
if (!/\+ 1 boş/.test(await page.locator(".total").innerText())) await fail("page count lacks the blank page");
await drawOn(blank.first());
if (!(await blank.first().locator("svg path").count())) await fail("no stroke on the blank page");
// PageNav: long press on page 5 adds a blank page before it (4a).
const nav = page.getByRole("complementary", { name: "Sayfalar ve içindekiler" });
if (!(await nav.count())) await page.getByRole("button", { name: "Sayfalar", exact: true }).click();
await nav.getByRole("button", { name: "Boş sayfa 3a" }).waitFor().catch(() => fail("no thumbnail for 3a"));
await longPress(nav.getByRole("button", { name: "Sayfa 5", exact: true }));
await page.getByRole("menu", { name: "Sayfa 5" }).getByRole("menuitem", { name: "Önüne boş sayfa ekle" }).click()
  .catch(() => fail("long press menu did not open"));
await nav.getByRole("button", { name: "Boş sayfa 4a" }).waitFor().catch(() => fail("4a not inserted"));
const order = await nav.locator(".thumb > span:not(.flags)").allInnerTexts();
if (order.join(",") !== "1,2,3,3a,4,4a,5,6") await fail(`thumbnail order: ${order.join(",")}`);
await page.screenshot({ path: "docs/screenshots/pages-blank-tablet.png" });
// Reopen: blank pages and the stroke are still there.
await page.getByRole("button", { name: "← Kütüphane" }).click();
await openDoc();
await jump("3a");
if (!(await page.locator(".scroller [data-blank] svg path").count())) await fail("stroke on 3a lost after reopening");
if ((await page.locator(".scroller [data-blank]").count()) !== 2) await fail("blank pages lost after reopening");
// Search and flags still work around blank pages.
await page.getByRole("button", { name: "Ara", exact: true }).click();
await page.getByRole("searchbox", { name: "PDF'te ara" }).fill("Bellman");
await page.locator('.scroller [data-page="4"] .found.current').waitFor({ timeout: 5000 }).catch(() => fail("search did not find page 4"));
await page.getByRole("button", { name: "Aramayı kapat" }).click();
// Delete 3a with confirm.
await jump("3a");
await (await pageMenu()).getByRole("button", { name: "Bu boş sayfayı sil" }).click();
const dlg = page.getByRole("dialog", { name: "Boş sayfayı sil" });
await dlg.getByRole("button", { name: "Vazgeç" }).click();
if ((await page.locator(".scroller [data-blank]").count()) !== 2) await fail("cancel deleted the page");
await (await pageMenu()).getByRole("button", { name: "Bu boş sayfayı sil" }).click();
await dlg.getByRole("button", { name: "Sil" }).click();
await page.waitForFunction(() => document.querySelectorAll(".scroller [data-blank]").length === 1).catch(() => fail("blank page not deleted"));
if (!/\+ 1 boş/.test(await page.locator(".total").innerText())) await fail("page count after delete");
// "Sayfayı kaldır" sits on blank pages only.
await jump("4a");
const dropBlank = page.locator(".scroller [data-blank]").getByRole("button", { name: "Sayfayı kaldır" });
await dropBlank.waitFor({ timeout: 3000 }).catch(() => fail("no Sayfayı kaldır on the blank page"));
if (await page.locator(".scroller [data-page]:not([data-blank])").getByRole("button", { name: "Sayfayı kaldır" }).count()) await fail("Sayfayı kaldır on a PDF page");
await dropBlank.click();
await dlg.getByRole("button", { name: "Sil" }).click();
await page.waitForFunction(() => !document.querySelector(".scroller [data-blank]")).catch(() => fail("Sayfayı kaldır did not remove the page"));
console.log("blank: insert from menu and long press, draw, reopen, search, delete with confirm");

// Phone: the toolbar controls stay touch-sized.
await page.setViewportSize(PHONE);
await minHeight(page.getByRole("button", { name: /^(Sayfa|İşaret|Önemli sayfalar)/ }), "phone toolbar");

if (errors.length) await fail("console errors");
await browser.close();
console.log("e2e-pages OK");
