// E2E for page tools: tape cover / reveal saved after reopen, layer toggles, text box with LaTeX and a highlighted
// code block, sticky note collapse, margin expansion keeps a stroke drawn in the margin. Needs `npm run dev`.
import { chromium } from "@playwright/test";
import { penToggle } from "./e2e-ink.mjs";
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

await page.goto(url);
const chooser = page.waitForEvent("filechooser");
await page.getByRole("button", { name: "PDF ekle" }).click();
await (await chooser).setFiles([resolve("tests/fixtures/notes/Hafta 5_Uzun Belge.pdf")]);
await page.getByRole("button", { name: /Uzun Belge/ }).click();
const open = async () => {
  await page.getByRole("button", { name: "Aç" }).click();
  await page.locator(".textLayer span").first().waitFor();
};
const reopen = async () => {
  await page.getByRole("button", { name: "← Kütüphane" }).click();
  await open();
};
await open();
const p1 = page.locator('[data-page="1"]');
const box = async () => p1.boundingBox();

// Tape: drag a rect, it covers; tap opens; reopen keeps the state; "Tümünü kapat" covers again.
await page.getByRole("button", { name: "Bant" }).click();
let b = await box();
await page.mouse.move(b.x + 80, b.y + 120);
await page.mouse.down();
await page.mouse.move(b.x + 300, b.y + 200, { steps: 6 });
await page.mouse.up();
const tape = p1.locator(".tape").first();
await tape.waitFor({ timeout: 3000 }).catch(() => fail("tape not drawn"));
if (!(await tape.evaluate((el) => el.classList.contains("covered")))) fail("new tape not covered");
await page.getByRole("button", { name: "Bant" }).click(); // tool off: tapes are buttons now
await p1.getByRole("button", { name: "Bandı aç" }).click();
await p1.locator(".tape.open").waitFor({ timeout: 3000 }).catch(() => fail("tap did not reveal"));
await page.waitForTimeout(200);
await reopen();
await p1.locator(".tape.open").waitFor({ timeout: 5000 }).catch(() => fail("revealed tape lost after reopen"));
await page.getByRole("button", { name: "Bant" }).click();
await page.getByRole("button", { name: "Tümünü kapat" }).click();
await p1.locator(".tape.covered").waitFor({ timeout: 3000 }).catch(() => fail("Tümünü kapat did not cover"));
await page.getByRole("button", { name: "Tümünü aç" }).click();
await p1.locator(".tape.open").waitFor({ timeout: 3000 }).catch(() => fail("Tümünü aç did not reveal"));
await page.getByRole("button", { name: "Tümünü kapat" }).click();
await page.getByRole("button", { name: "Bant" }).click();

// Text box with inline LaTeX and a code block.
await page.getByRole("button", { name: "Metin", exact: true }).click();
b = await box();
await page.mouse.click(b.x + 80, b.y + 420);
const editor = page.getByLabel("Not metni");
await editor.waitFor({ timeout: 3000 }).catch(() => fail("text box editor did not open"));
await editor.fill("Alan: $\\pi r^2$ <b>kaçış</b>\n```python\ndef f(x):\n    return x * 2\n```");
await page.getByRole("button", { name: "Bitti" }).click();
const text = p1.locator(".pnote.text");
await text.locator(".katex").first().waitFor({ timeout: 8000 }).catch(() => fail("LaTeX not rendered by KaTeX"));
await text.locator(".hljs-keyword").first().waitFor({ timeout: 8000 }).catch(() => fail("code block not highlighted"));
if (await text.locator("b").count()) fail("raw HTML was not escaped");

// Sticky note: write, collapse to an icon, reopen keeps it collapsed, expand again.
await page.getByRole("button", { name: "Not", exact: true }).click();
b = await box();
await page.mouse.click(b.x + 500, b.y + 560);
await editor.waitFor({ timeout: 3000 }).catch(() => fail("sticky editor did not open"));
await editor.fill("**Sınavda çıkar**");
// Note colour: pink, kept after reopen (also on the folded icon).
const PINK = "rgb(255, 214, 224)";
const bg = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);
await page.getByRole("button", { name: "Not rengi", exact: true }).click();
await page.getByRole("button", { name: "Not rengi: Pembe" }).click();
if ((await bg(p1.locator(".pnote.sticky"))) !== PINK) fail("sticky note not recoloured");
await page.getByRole("button", { name: "Notu küçült" }).click();
await p1.getByRole("button", { name: "Notu aç" }).waitFor({ timeout: 3000 }).catch(() => fail("sticky did not collapse"));
await page.waitForTimeout(200);
await reopen();
if ((await bg(p1.getByRole("button", { name: "Notu aç" })).catch(() => "")) !== PINK) fail("note colour lost after reopen");
await p1.getByRole("button", { name: "Notu aç" }).click({ timeout: 5000 }).catch(() => fail("collapsed sticky lost after reopen"));
await p1.locator(".pnote.sticky strong").waitFor({ timeout: 3000 }).catch(() => fail("sticky text lost"));
if ((await bg(p1.locator(".pnote.sticky"))) !== PINK) fail("open sticky lost its colour");
if (!(await p1.locator(".pnote.text .katex").count())) fail("text box lost after reopen");

// Layers: hide and show tapes, notes, highlights.
const layers = page.getByRole("button", { name: "Katmanlar" });
const toggleLayer = async (name) => {
  await layers.click();
  await page.getByLabel(name).click();
  await page.keyboard.press("Escape");
};
await toggleLayer("Bantlar");
if (await p1.locator(".tape").count()) fail("tape layer not hidden");
await toggleLayer("Metin kutuları ve notlar");
if (await p1.locator(".pnote").count()) fail("notes layer not hidden");
await reopen(); // per device: remembered
if (await p1.locator(".tape").count() || await p1.locator(".pnote").count()) fail("hidden layers not remembered");
await toggleLayer("Bantlar");
await toggleLayer("Metin kutuları ve notlar");
await p1.locator(".tape").first().waitFor({ timeout: 3000 }).catch(() => fail("tape layer not shown again"));
await p1.locator(".pnote").first().waitFor({ timeout: 3000 }).catch(() => fail("notes layer not shown again"));

// Margin: add space on the right, draw there, reopen keeps the stroke where it was.
b = await box();
const w0 = b.width;
await page.getByRole("button", { name: "Kenar boşluğu" }).click();
await page.getByRole("button", { name: "Sağa boşluk ekle" }).click();
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
b = await box();
if (!(b.width > w0 * 1.2)) fail(`page did not grow: ${w0} -> ${b.width}`);
let sheetW = (await p1.locator(".sheet").boundingBox()).width;
if (Math.abs(sheetW - w0) > 1) fail("PDF area changed size");
// Fit to width now counts the margin, so the whole grown page is on screen.
await page.getByRole("button", { name: "Genişliğe sığdır" }).click();
await page.waitForTimeout(300);
b = await box();
sheetW = (await p1.locator(".sheet").boundingBox()).width;
await penToggle(page);
const mx = b.x + sheetW + 40;
await page.mouse.move(mx, b.y + 200);
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(mx + i * 12, b.y + 200 + (i % 2 ? 10 : 0), { steps: 2 });
await page.mouse.up();
await page.waitForTimeout(300);
await penToggle(page);
const strokeX = async () => (await p1.locator('path[data-kind="pen"]').first().boundingBox())?.x;
const x0 = await strokeX();
if (!x0 || x0 < b.x + sheetW) fail("stroke not in the margin");
const rel0 = x0 - b.x;
await toggleLayer("Kalem yazısı");
if (await p1.locator('path[data-kind="pen"]').count()) fail("ink layer not hidden");
await toggleLayer("Kalem yazısı");
await reopen();
await p1.locator('path[data-kind="pen"]').first().waitFor({ timeout: 5000 }).catch(() => fail("margin stroke lost after reopen"));
b = await box();
const x1 = await strokeX();
if (Math.abs(x1 - b.x - rel0) > 2) fail(`margin stroke moved: ${rel0} -> ${x1 - b.x}`);
// The margin cannot be removed while the stroke is there.
await page.getByRole("button", { name: "Kenar boşluğu" }).click();
await page.getByRole("button", { name: "Sağ boşluğu kaldır" }).click();
await page.keyboard.press("Escape");
if (!(await page.getByRole("alert").isVisible())) fail("no warning when the margin holds ink");
await page.screenshot({ path: "docs/screenshots/page-tools-light.png" });

console.log("tape ok | layers ok | katex ok | code ok | sticky ok | margin ok");
if (errors.length) fail("console errors");
await browser.close();
