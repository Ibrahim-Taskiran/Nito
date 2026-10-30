// E2E: side-by-side reader, AI screen (built-in engine setup card with progress/cancel, chat, citation opens
// the page, summary, settings switch/delete), Ollama-only down state, low disk, and no AI on a phone.
// Needs the dev server. NITO_URL picks it. The built-in engine is faked in the web build; its server is mocked,
// or real when NITO_AI_URL (+ NITO_AI_KEY) points at a running llama-server.
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

const realUrl = process.env.NITO_AI_URL;
const engineUrl = realUrl ?? "http://127.0.0.1:18080";
const browser = await chromium.launch({ channel: process.env.NITO_BROWSER ?? "msedge" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript((cfg) => (window.__NITO_FAKE_AI__ = cfg), { url: engineUrl, key: process.env.NITO_AI_KEY ?? "test-key", ramGb: 16 });
// The owner's Ollama must not change the flow.
await page.route(/:11434\//, (r) => r.abort("connectionrefused"));
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/11434|ERR_FAILED|ERR_CONNECTION|net::/.test(m.text()) && errors.push(m.text()));
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
await panes.nth(0).getByRole("button", { name: "Vurgular", exact: true }).click();
await page.screenshot({ path: "docs/screenshots/split-light.png" });
await page.getByRole("button", { name: "Tek görünüme dön" }).click();
await page.getByRole("button", { name: "← Kütüphane" }).waitFor();
if (await page.locator(".split").count()) await fail("split should close");
console.log("split: two panes, independent zoom, panel toggle, back to single reader ok");
await page.getByRole("button", { name: "← Kütüphane" }).click();

// ---- AI: built-in engine not set up yet -> setup card
if (!realUrl) {
  await page.route(/127\.0\.0\.1:18080\/v1\/chat\/completions/, (r) =>
    r.fulfill({
      contentType: "text/event-stream",
      body: ["TCP bağlantıyı üçlü el sıkışma ile kurar ", "[s. 1].", " UDP bağlantısızdır [s. 2]."]
        .map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`).join("") + "data: [DONE]\n\n",
    }));
}
await page.getByRole("button", { name: "Yapay zekâ" }).click();
const setup = page.getByRole("region", { name: "Yapay zekâyı kur" });
await setup.waitFor();
const suggested = await setup.locator(".choice", { hasText: "Bu bilgisayar için önerilen" }).innerText();
if (!suggested.includes("Kaliteli")) await fail(`16 GB RAM should suggest Kaliteli, got ${suggested}`);
if (!(await setup.getByText(/Gereken alan: 4,5 GB/).count())) await fail("setup card should show the space it needs");
for (const b of await setup.locator(".choice, button").all()) {
  const h = (await b.boundingBox())?.height ?? 0;
  if (h < 40) await fail(`setup targets must be 40px, got ${h}`);
}
await page.screenshot({ path: "docs/screenshots/ai-setup-light.png" });
await setup.getByRole("button", { name: "İndir ve kur" }).click();
await setup.getByText(/indiriliyor/).first().waitFor();
await setup.getByRole("button", { name: "İptal" }).click();
await setup.getByRole("alert").filter({ hasText: "İndirme iptal edildi." }).waitFor();
console.log("setup: Kaliteli suggested, disk note, progress shown, cancel works");
await setup.getByText("Hızlı", { exact: true }).click();
await setup.getByRole("button", { name: "İndir ve kur" }).click();
await page.getByRole("heading", { name: "Notlarla sohbet" }).waitFor({ timeout: 10_000 });
const model = realUrl ? "real llama-server" : "mocked llama-server";

const t0 = Date.now();
await page.getByLabel("Soru").fill("TCP bağlantıyı nasıl kurar?");
await page.getByRole("button", { name: "Gönder" }).click();
await page.locator(".turn.assistant").first().waitFor();
await page.getByRole("button", { name: "Gönder" }).waitFor({ timeout: 120_000 }).catch(() => fail("no answer in 120 s"));
const answer = (await page.locator(".turn.assistant").first().innerText()).trim();
console.log(`chat (${model}, ${((Date.now() - t0) / 1000).toFixed(1)} s):`, answer.replace(/\s+/g, " ").slice(0, 400));
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
await page.emulateMedia({ colorScheme: "light" });

// ---- settings: download and use Kaliteli, then delete Hızlı
await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
const settings = page.getByRole("region", { name: "Yapay zekâ ayarları" });
const row = (name) => settings.locator("li").filter({ has: page.getByText(name, { exact: true }) });
await row("Hızlı").getByText("Kullanılıyor").waitFor();
await row("Kaliteli").getByRole("button", { name: "İndir" }).click();
await settings.getByText(/indiriliyor/).first().waitFor();
await row("Kaliteli").getByText("Kullanılıyor").waitFor({ timeout: 10_000 });
await row("Hızlı").getByRole("button", { name: "Sil" }).click();
await row("Hızlı").getByRole("button", { name: "Evet, sil" }).click();
await row("Hızlı").getByText("İndirilmedi").waitFor();
await page.screenshot({ path: "docs/screenshots/ai-settings-light.png" });
await page.getByRole("button", { name: "Ayarları kapat" }).click();
await page.getByRole("heading", { name: "Notlarla sohbet" }).waitFor();
console.log("settings: Kaliteli downloaded and in use, Hızlı deleted");
if (errors.length) await fail("console errors");

/** A fresh page (own in-memory library) with one PDF, so the sidebar shows. */
async function freshPage(opts, fake) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 }, ...opts });
  if (fake) await p.addInitScript((cfg) => (window.__NITO_FAKE_AI__ = cfg), fake);
  await p.route(/:11434\//, (r) => r.abort("connectionrefused"));
  await p.goto(url);
  const ch = p.waitForEvent("filechooser");
  await p.getByRole("button", { name: "PDF ekle" }).click();
  await (await ch).setFiles([{ name: "Hafta 5_Tasima.pdf", mimeType: "application/pdf", buffer: lecturePdf() }]);
  await p.getByRole("button", { name: /Hafta 5/ }).first().waitFor();
  return p;
}

// ---- no built-in engine (other OS / browser) and no Ollama: the Ollama help card
const down = await freshPage({});
await down.getByRole("button", { name: "Yapay zekâ" }).click();
await down.getByRole("heading", { name: "Ollama çalışmıyor" }).waitFor();
await down.screenshot({ path: "docs/screenshots/ai-down-light.png" });
await down.close();
console.log("down: Ollama help card without a built-in engine");

// ---- not enough disk space: clear note, button off
const low = await freshPage({}, { freeGb: 1, ramGb: 8 });
await low.getByRole("button", { name: "Yapay zekâ" }).click();
await low.getByText("Diskte yeterli yer yok").waitFor();
if (!(await low.getByRole("button", { name: "İndir ve kur" }).isDisabled())) await fail("install should be off with a full disk");
await low.close();
console.log("low disk: note shown, install disabled");

// ---- phone: no AI anywhere
const phone = await freshPage({
  viewport: { width: 800, height: 1100 }, hasTouch: true, isMobile: true,
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
}, { ramGb: 16 });
await phone.getByRole("button", { name: "Bugün" }).waitFor();
if (await phone.getByRole("button", { name: "Yapay zekâ" }).count()) await fail("mobile must not show AI in the sidebar");
if (await phone.getByText(/Yapay zekâ|Özetle/).count()) await fail("mobile must not show any AI entry point");
await phone.close();
console.log("mobile: no AI entry point");

if (errors.length) await fail("console errors");
console.log("e2e-ai ok");
await browser.close();
