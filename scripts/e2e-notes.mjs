// E2E: highlights -> live note + colour digest, back-link opens the reader on the page, free note, Markdown export.
// Needs a dev server; URL from NITO_URL.
import { chromium } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env.NITO_URL ?? "http://localhost:1420";
const pdfs = (dir) => readdirSync(dir).filter((f) => f.endsWith(".pdf")).map((f) => resolve(dir, f));
const fixtures = [...pdfs("tests/fixtures"), ...pdfs("tests/fixtures/notes")];
const browser = await chromium.launch({ channel: process.env.NITO_BROWSER ?? "msedge" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: "light", acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const fail = (msg) => {
  console.error("FAIL:", msg, errors.join("\n"));
  process.exit(1);
};
const check = (ok, msg) => ok || fail(msg);
const shot = (name) => page.screenshot({ path: `docs/screenshots/notes-${name}.png` });

/** Selects the first text span of a page and picks a label (like a mouse selection would). */
async function highlight(pageNo, label, comment) {
  const span = page.locator(`[data-page="${pageNo}"] .textLayer span`).first();
  await span.scrollIntoViewIfNeeded();
  await span.waitFor();
  await span.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  });
  await page.getByRole("toolbar", { name: "Vurgu etiketi" }).getByRole("button", { name: label }).click();
  if (comment) {
    const box = page.locator("article.item.focused textarea");
    await box.fill(comment);
    await box.blur();
  }
}

await page.goto(url);
const chooser = page.waitForEvent("filechooser");
await page.getByRole("button", { name: "PDF ekle" }).click();
await (await chooser).setFiles(fixtures);
await page.getByRole("button", { name: /Hafta 5/ }).click();
await page.getByRole("button", { name: "Aç" }).click();
await page.locator(".textLayer span").first().waitFor({ timeout: 10_000 }).catch(async () => {
  await page.screenshot({ path: process.env.NITO_DEBUG_SHOT ?? "e2e-notes-fail.png" });
  fail("reader text layer did not appear");
});
await highlight(1, "Önemli", "ilk sayfa yorumu");
await page.locator('[data-page="3"]').scrollIntoViewIfNeeded();
await highlight(3, "Sınav");
await page.getByRole("button", { name: "← Kütüphane" }).click();

// Live note
await page.getByRole("button", { name: "Notlar" }).click();
await page.getByLabel("Belge").selectOption({ label: "Hafta 5: Uzun Belge" });
await page.getByRole("button", { name: "Canlı notu güncelle" }).click();
const md = page.locator("article.md");
await md.getByRole("heading", { name: "Sayfa 3" }).waitFor().catch(() => fail("live note has no 'Sayfa 3' section"));
check((await md.locator("a[data-annotation]").count()) === 2, "live note should link 2 highlights");
check((await md.textContent()).includes("ilk sayfa yorumu"), "live note misses the comment");
check((await md.locator("blockquote strong").allTextContents()).join(",") === "Önemli,Sınav", "live note labels");
await shot("live-light");

// Colour digest for documents without a course
await page.getByLabel("Ders").selectOption({ label: "Derssiz belgeler" });
await page.getByRole("button", { name: "Renk özeti oluştur" }).click();
await md.getByRole("heading", { name: "Sınav (1)" }).waitFor().catch(() => fail("digest has no 'Sınav (1)'"));
await md.getByRole("heading", { name: "Önemli (1)" }).waitFor();
await md.getByRole("heading", { name: "Hafta 5", exact: true }).first().waitFor();
await shot("digest-light");

// Back-link opens the reader on page 3 with the highlight focused
await md.getByRole("link", { name: "s. 3" }).click();
await page.locator('[data-page="3"] .hl.focused').waitFor({ timeout: 10_000 }).catch(() => fail("focused highlight on page 3 missing"));
await page.waitForFunction(() => document.querySelector(".pages")?.textContent?.trim().startsWith("3 /"), null, { timeout: 5000 })
  .catch(() => fail("reader did not scroll to page 3"));
await page.screenshot({ path: "docs/screenshots/notes-backlink-light.png" });
await page.getByRole("button", { name: "← Kütüphane" }).click();
await page.getByRole("navigation", { name: "Not listesi" }).waitFor().catch(() => fail("did not return to notes"));

// Free note: create, edit (autosave on blur), view
await page.getByRole("button", { name: "Yeni not" }).click();
await page.getByLabel("Not başlığı").waitFor({ timeout: 5000 }).catch(async () => {
  await page.screenshot({ path: process.env.NITO_DEBUG_SHOT ?? "e2e-notes-fail.png" });
  fail("new note editor did not open");
});
await page.getByLabel("Not başlığı").fill("Sınav planı");
await page.getByLabel("Not başlığı").blur();
await page.getByLabel("Not metni").fill("# Plan\n\n- TCP **el sıkışma** tekrar\n- UDP *başlık* alanları");
await page.getByLabel("Not metni").blur();
await page.getByRole("button", { name: "Görüntüle" }).click();
await md.locator("strong", { hasText: "el sıkışma" }).waitFor().catch(() => fail("free note not rendered"));
await page.getByRole("navigation", { name: "Not listesi" }).getByRole("button", { name: /Sınav planı/ }).waitFor()
  .catch(() => fail("free note title not saved"));
await shot("free-light");

// Markdown export (web: download)
const dl = page.waitForEvent("download");
await page.getByRole("button", { name: "Markdown olarak dışa aktar" }).click();
const file = await dl;
check(file.suggestedFilename() === "Sinav-plani.md", `export name: ${file.suggestedFilename()}`);
check(readFileSync(await file.path(), "utf8").includes("**el sıkışma**"), "export content");

// Watched folder dialog (web cannot list real folders, so it reports none)
await page.getByRole("button", { name: "Klasör izle" }).click();
const dialog = page.getByRole("dialog", { name: "İzlenen klasörler" });
await dialog.getByLabel("Klasör yolu").fill("C:\\Dersler\\Ağlar\\");
await dialog.getByRole("button", { name: "Klasör izle" }).click();
await dialog.getByText("C:/Dersler/Ağlar").waitFor().catch(() => fail("watched folder not listed"));
await dialog.getByText(/PDF bulunamadı/).waitFor().catch(() => fail("watched folder not scanned"));
await shot("watch-light");

await page.emulateMedia({ colorScheme: "dark" });
await shot("watch-dark");
await dialog.getByRole("button", { name: "Kapat" }).click();
await page.getByRole("navigation", { name: "Not listesi" }).getByRole("button", { name: /Canlı not/ }).click();
await md.getByRole("heading", { name: "Sayfa 3" }).waitFor();
await shot("live-dark");

console.log("live note ok | digest ok | back-link -> page 3 ok | free note ok | export", file.suggestedFilename(), "| watch ok");
if (errors.length) fail("console errors");
await browser.close();
