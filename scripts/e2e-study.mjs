// E2E: Tanım + Soru highlights -> Study Center: review, quiz, Cornell note, course pack. Needs `npm run dev`.
import { chromium } from "@playwright/test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { unzipSync } from "fflate";

const url = process.env.NITO_URL ?? "http://localhost:1420";
const fixtures = readdirSync("tests/fixtures").filter((f) => f.endsWith(".pdf")).map((f) => resolve("tests/fixtures", f));
const browser = await chromium.launch({ channel: process.env.NITO_BROWSER ?? "msedge" });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const fail = (msg) => {
  console.error("FAIL:", msg, errors.join("\n"));
  process.exit(1);
};
const shot = async (name, theme) => {
  await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
  await page.screenshot({ path: `docs/screenshots/study-${name}-${theme}.png` });
};

await page.goto(url);
const chooser = page.waitForEvent("filechooser");
await page.getByRole("button", { name: "PDF ekle" }).click();
await (await chooser).setFiles(fixtures);
await page.getByRole("button", { name: /Hafta 5/ }).click();
await page.getByRole("button", { name: "Aç" }).click();
await page.locator(".textLayer span").first().waitFor();

// Highlight text spans with a label (programmatic selection, as in e2e-record).
const highlight = async (index, label) => {
  await page.evaluate((i) => {
    const span = [...document.querySelectorAll(".textLayer span")].filter((s) => s.textContent.trim())[i];
    const range = document.createRange();
    range.selectNodeContents(span);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    span.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  }, index);
  await page.getByRole("toolbar", { name: "Vurgu etiketi" }).getByRole("button", { name: label }).click();
};
await highlight(0, "Tanım");
await highlight(1, "Soru");
await highlight(2, "Sınav");
const notes = page.getByPlaceholder("Yorum ekle…");
await notes.nth(1).fill("Yedi katman");
await notes.nth(1).blur();
await page.waitForTimeout(300);

await page.getByRole("button", { name: "← Kütüphane" }).click();
await page.getByRole("button", { name: "Çalışma Merkezi" }).click();
const due = page.getByTestId("due-count");
await due.waitFor();
if ((await due.textContent()) !== "2") fail(`expected 2 due cards, got ${await due.textContent()}`);
if (!(await page.getByText("Hafta 5: Protokoller · s. 1").count())) fail("exam highlight not listed");
await shot("overview", "light");
await shot("overview", "dark");

// Review: one known, one not; both leave today's queue.
await page.getByRole("button", { name: "Tekrar et" }).click();
await page.getByRole("button", { name: "Cevabı göster" }).click();
await shot("review", "light");
await page.getByRole("button", { name: "Bildim" }).click();
await page.getByRole("button", { name: "Cevabı göster" }).click();
await page.getByRole("button", { name: "Bilemedim" }).click();
await page.getByText("1 / 2 kartı bildin").waitFor().catch(() => fail("session summary missing"));
await page.getByRole("button", { name: "Bitir" }).click();
await page.waitForFunction(() => document.querySelector("[data-testid=due-count]")?.textContent === "0").catch(() => fail("due count not 0 after review"));

// Quiz: always pick the first option.
await page.getByRole("button", { name: "Test çöz" }).click();
for (let i = 0; i < 10; i++) {
  await page.getByRole("group", { name: "Seçenekler" }).getByRole("button").first().click();
  if (i === 0) await shot("quiz", "dark");
  const next = page.getByRole("button", { name: /Sonraki|Sonucu gör/ });
  const last = (await next.textContent()).includes("Sonucu");
  await next.click();
  if (last) break;
}
const result = await page.getByText(/Puan: \d+ \/ \d+/).textContent().catch(() => fail("no quiz score"));
await page.getByRole("button", { name: "Bitir" }).click();

// Cornell note.
await page.getByRole("button", { name: /Hafta 5: Protokoller: Cornell notu oluştur/ }).click();
await page.getByRole("status").getByText("Cornell notu oluşturuldu: Hafta 5: Protokoller").waitFor().catch(() => fail("no Cornell confirmation"));

// Course pack (fixtures have no course -> "Derssiz").
const dl = page.waitForEvent("download");
await page.getByRole("button", { name: "Paketi dışa aktar" }).first().click();
const download = await dl;
const zip = unzipSync(new Uint8Array(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c))));
const names = Object.keys(zip).filter((k) => !k.endsWith("/"));
const pdfs = names.filter((n) => n.endsWith(".pdf")).length;
const mds = names.filter((n) => n.endsWith(".md")).length;
if (pdfs !== fixtures.length || mds !== fixtures.length + 1) fail(`pack has ${pdfs} pdf / ${mds} md: ${names.join(", ")}`);
const digest = new TextDecoder().decode(zip[names.find((n) => n.includes("renk özeti"))]);
if (!digest.includes("## Tanım (1)") || !digest.includes("## Sınav (1)")) fail("digest misses labels");
await shot("overview-done", "light");

console.log(`review ok | quiz ${result} | cornell ok | pack ${download.suggestedFilename()}: ${pdfs} pdf, ${mds} md`);
if (errors.length) fail("console errors");
await browser.close();
