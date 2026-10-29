// E2E: side-by-side reader, AI screen (Ollama down state, real or mocked chat, citation opens the page).
// Needs the dev server. NITO_URL picks it; NITO_MOCK_OLLAMA=1 forces a mocked Ollama.
import { chromium } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const url = process.env.NITO_URL ?? "http://localhost:1420";
const fixtures = readdirSync("tests/fixtures").filter((f) => f.endsWith(".pdf")).map((f) => resolve("tests/fixtures", f));

/** A two-page PDF with real sentences, so retrieval has something to find. */
function lecturePdf() {
  const pages = [
    ["Hafta 5: Tasima katmani", "TCP baglanti yonelimli bir protokoldur.", "Baglanti uclu el sikisma ile kurulur: SYN, SYN-ACK, ACK.", "TCP veriyi sirali ve guvenilir iletir."],
    ["UDP baglantisiz calisir.", "UDP basligi 8 bayttir ve hizlidir.", "DNS ve canli yayin genelde UDP kullanir."],
  ];
  const streams = pages.map((lines) => `BT /F1 16 Tf 72 720 Td 22 TL ${lines.map((l) => `(${l}) Tj T*`).join(" ")} ET`);
  const n = pages.length;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${n} >>`,
  ];
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

const browser = await chromium.launch({ channel: process.env.NITO_BROWSER ?? "msedge" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/11434|ERR_FAILED|ERR_CONNECTION/.test(m.text()) && errors.push(m.text()));
const fail = async (msg) => {
  console.error("FAIL:", msg, errors.join("\n"));
  await page.screenshot({ path: "docs/screenshots/ai-fail.png" }).catch(() => {});
  process.exit(1);
};

await page.goto(url);
const chooser = page.waitForEvent("filechooser");
await page.getByRole("button", { name: "PDF ekle" }).click();
await (await chooser).setFiles([
  ...fixtures.map((f) => ({ name: basename(f), mimeType: "application/pdf", buffer: readFileSync(f) })),
  { name: "Hafta 5_Tasima.pdf", mimeType: "application/pdf", buffer: lecturePdf() },
]);
await page.getByRole("button", { name: /Hafta 5/ }).first().waitFor();

// ---- side by side
await page.getByRole("button", { name: /Hafta 5/ }).first().click();
await page.getByRole("button", { name: "Aç" }).click();
await page.locator(".textLayer span").first().waitFor();
await page.getByRole("button", { name: "Yan yana" }).click();
await page.getByRole("dialog", { name: "Yan yana açılacak belge" }).getByRole("button", { name: /Hafta 2/ }).click();
const panes = page.locator(".split .pane");
if ((await panes.count()) !== 2) await fail("split view should show two panes");
await panes.nth(1).locator(".textLayer span").first().waitFor();
if (await page.getByRole("complementary", { name: "Vurgular" }).count()) await fail("annotation panels should start hidden in split");
await panes.nth(1).getByRole("button", { name: "Yakınlaştır" }).click();
const zooms = await panes.locator(".zoom").allTextContents();
if (zooms[0] === zooms[1]) await fail(`each pane should zoom on its own, got ${zooms}`);
await panes.nth(0).getByRole("button", { name: "Vurgular paneli" }).click();
await page.screenshot({ path: "docs/screenshots/split-light.png" });
await page.getByRole("button", { name: "Tek görünüme dön" }).click();
await page.getByRole("button", { name: "← Kütüphane" }).waitFor();
if (await page.locator(".split").count()) await fail("split should close");
console.log("split: two panes, independent zoom, panel toggle, back to single reader ok");
await page.getByRole("button", { name: "← Kütüphane" }).click();

// ---- AI: down state first (Ollama blocked), then real or mocked
await page.route(/:11434\//, (r) => r.abort("connectionrefused"));
await page.getByRole("button", { name: "Yapay zekâ" }).click();
await page.getByRole("heading", { name: "Ollama çalışmıyor" }).waitFor();
await page.screenshot({ path: "docs/screenshots/ai-down-light.png" });
await page.unroute(/:11434\//);

let real = process.env.NITO_MOCK_OLLAMA !== "1";
if (real) {
  real = await fetch("http://localhost:11434/api/tags").then((r) => r.ok, () => false);
  if (!real) console.log("Ollama not reachable: using a mocked Ollama");
}
if (!real) {
  await page.route(/:11434\/api\/tags/, (r) => r.fulfill({ json: { models: [{ name: "qwen2.5:7b" }] } }));
  await page.route(/:11434\/api\/chat/, (r) =>
    r.fulfill({
      contentType: "application/x-ndjson",
      body: ["TCP bağlantıyı üçlü el sıkışma ile kurar ", "[s. 1].", " UDP bağlantısızdır [s. 2]."]
        .map((t) => JSON.stringify({ message: { content: t }, done: false })).join("\n") + "\n" + JSON.stringify({ done: true }) + "\n",
    }));
}
await page.getByRole("button", { name: "Yeniden dene" }).click();
await page.getByRole("heading", { name: "Notlarla sohbet" }).waitFor();
const models = await page.getByLabel("Model").locator("option").allTextContents();
// Prefer the small model for test speed when it is installed (research licence: local dev only).
if (real && models.includes("qwen2.5:3b")) {
  await page.getByLabel("Model").selectOption("qwen2.5:3b");
  await page.getByText("yalnız araştırma lisanslıdır").waitFor();
}
const model = await page.getByLabel("Model").inputValue();

const t0 = Date.now();
await page.getByLabel("Soru").fill("TCP bağlantıyı nasıl kurar?");
await page.getByRole("button", { name: "Gönder" }).click();
await page.locator(".turn.assistant").first().waitFor();
await page.getByRole("button", { name: "Gönder" }).waitFor({ timeout: 120_000 }).catch(() => fail("no answer in 120 s"));
const answer = (await page.locator(".turn.assistant").first().innerText()).trim();
console.log(`chat (${real ? "real Ollama" : "mocked"}, ${model}, ${((Date.now() - t0) / 1000).toFixed(1)} s):`, answer.replace(/\s+/g, " ").slice(0, 400));
if (!answer || answer === "…") await fail("empty answer");
await page.screenshot({ path: "docs/screenshots/ai-chat-light.png" });

const cites = page.locator(".turn.assistant .cite");
if (await cites.count()) {
  const cited = (await cites.last().textContent()).match(/\d+/)[0];
  await cites.last().click();
  const opened = await page.getByRole("button", { name: "← Kütüphane" }).waitFor({ timeout: 5000 }).then(() => true, () => false);
  if (opened) {
    await page.locator(".textLayer span").first().waitFor();
    await page.waitForTimeout(500);
    const shown = (await page.locator(".pages").textContent()).trim();
    console.log(`citation: [s. ${cited}] opened the reader at ${shown}`);
    if (!shown.startsWith(`${cited} /`)) await fail(`reader should show page ${cited}, shows ${shown}`);
    await page.getByRole("button", { name: "← Kütüphane" }).click();
    await page.getByRole("button", { name: "Yapay zekâ" }).click();
    await page.locator(".turn.user").first().waitFor({ timeout: 3000 }).catch(() => fail("chat should survive opening a cited page"));
  } else {
    console.log(`citation: [s. ${cited}] not in the sources (shown as a note)`);
  }
} else {
  console.log("citation: the model gave no [s. N] citation");
}

// Summary of the lecture PDF, saved as an AI note.
await page.getByRole("heading", { name: "Özetle" }).waitFor();
const opts = await page.getByLabel("Belge", { exact: true }).locator("option").allTextContents();
await page.getByLabel("Belge", { exact: true }).selectOption({ label: opts.find((o) => o.includes("Hafta 5")) });
const t1 = Date.now();
await page.getByRole("button", { name: "Özetle", exact: true }).click();
await page.getByText("Notlara kaydedildi.").waitFor({ timeout: 120_000 }).catch(() => fail("summary not saved in 120 s"));
const summary = (await page.locator(".summary .text").innerText()).trim();
console.log(`summary (${((Date.now() - t1) / 1000).toFixed(1)} s):`, summary.replace(/\s+/g, " ").slice(0, 300));
await page.screenshot({ path: "docs/screenshots/ai-summary-light.png" });

await page.emulateMedia({ colorScheme: "dark" });
await page.screenshot({ path: "docs/screenshots/ai-chat-dark.png" });
if (errors.length) await fail("console errors");
console.log("e2e-ai ok");
await browser.close();
