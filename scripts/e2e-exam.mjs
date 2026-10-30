// E2E for Phase 3.6 exam tools: page flags in the reader and on thumbnails, the "Sınav hazırlığı" list
// (filters, preview, tap opens the reader at that page), AI cards from slides with review before saving,
// and AI chat citing a lecture transcript ("[kayıt mm:ss]" plays the recording). Fake AI and fake whisper.
// Needs the dev server (NITO_URL).
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env.NITO_URL ?? "http://localhost:1420";
const engineUrl = "http://127.0.0.1:18080";

/** A six-page lecture PDF; each page has its own sentences. */
function lecturePdf() {
  const pages = [
    ["Hafta 4: Yonlendirme", "Yonlendirme paketin yolunu secer."],
    ["Statik yonlendirme elle yazilir.", "Dinamik yonlendirme protokollerle ogrenilir."],
    ["Dijkstra en kisa yolu bulur.", "Bagli durum protokolu OSPF Dijkstra kullanir."],
    ["Bellman-Ford uzaklik vektoru algoritmasidir.", "RIP en fazla 15 atlama sayar."],
    ["BGP otonom sistemler arasinda calisir.", "Yol vektoru kullanir."],
    ["Ozet: statik, dinamik, OSPF, RIP, BGP."],
  ];
  const streams = pages.map((lines) => `BT /F1 16 Tf 72 720 Td 22 TL ${lines.map((l) => `(${l}) Tj T*`).join(" ")} ET`);
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

/** whisper -oj with two paragraphs: 00:00 (Dijkstra) and 00:40 (Bellman-Ford). */
const whisper = JSON.stringify({
  transcription: [
    { offsets: { from: 0, to: 10_000 }, text: "Bugün yönlendirme algoritmalarına giriyoruz." },
    { offsets: { from: 10_000, to: 35_000 }, text: "Dijkstra algoritması en kısa yolu bulur." },
    { offsets: { from: 40_000, to: 50_000 }, text: "Bellman-Ford negatif kenarlarla da çalışır, sınavda çıkar." },
  ],
});

const cardsJson = JSON.stringify({
  cards: [
    { term: "Dijkstra", definition: "En kısa yolu bulan algoritma.", page: 3 },
    { term: "RIP", definition: "En fazla 15 atlama sayan protokol.", page: 4 },
    { term: "Bozuk" },
  ],
  questions: [
    { question: "OSPF hangi algoritmayı kullanır?", answer: "Dijkstra", wrong: ["Bellman-Ford", "Prim", "Kruskal"], page: 3 },
  ],
});
const sse = (parts) =>
  parts.map((t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`).join("") + "data: [DONE]\n\n";

const browser = await chromium.launch({
  channel: process.env.NITO_BROWSER ?? "msedge",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, hasTouch: true });
await page.addInitScript(([ai, w]) => {
  window.__NITO_FAKE_AI__ = ai;
  window.__NITO_FAKE_WHISPER__ = w;
}, [{ url: engineUrl, key: "test-key", installed: ["fast"], ramGb: 16 }, whisper]);
await page.route(/:11434\//, (r) => r.abort("connectionrefused"));
let lastPrompt = "";
await page.route(/127\.0\.0\.1:18080\/v1\/chat\/completions/, (r) => {
  const body = r.request().postData() ?? "";
  lastPrompt = body;
  const content = body.includes("JSON nesnesi")
    ? sse(["Kartlar:\n```json\n", cardsJson.slice(0, 40), cardsJson.slice(40), "\n```"])
    : sse(["Dijkstra en kısa yolu bulur ", "[kayıt 00:02]", ", slaytta da var [s. 3]."]);
  return r.fulfill({ contentType: "text/event-stream", body: content });
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/11434|ERR_FAILED|ERR_CONNECTION|net::/.test(m.text()) && errors.push(m.text()));
const fail = async (msg) => {
  console.error("FAIL:", msg, errors.join("\n"));
  await page.screenshot({ path: "test-results/e2e-exam-fail.png" }).catch(() => {});
  process.exit(1);
};
const minHeight = async (loc, what) => {
  for (const b of await loc.all()) {
    const h = (await b.boundingBox())?.height ?? 0;
    if (h && h < 40) await fail(`${what}: touch target ${h}px < 40px`);
  }
};
const jump = async (n) => {
  await page.locator(".page-input").fill(String(n));
  await page.locator(".page-input").press("Enter");
  await page.waitForFunction((n) => document.querySelector(".page-input")?.value === String(n), n);
};

await page.goto(url);
const chooser = page.waitForEvent("filechooser");
await page.getByRole("button", { name: "PDF ekle" }).click();
await (await chooser).setFiles([
  { name: "Hafta 4_Yonlendirme.pdf", mimeType: "application/pdf", buffer: lecturePdf() },
  { name: "Hafta 2_Katmanlar.pdf", mimeType: "application/pdf", buffer: readFileSync(resolve("tests/fixtures/Hafta 2_Katmanlar.pdf")) },
]);
await page.getByRole("button", { name: /Hafta 4: Yonlendirme/ }).first().click();
await page.getByRole("button", { name: "Aç" }).click();
await page.locator(".textLayer span").first().waitFor();

// ---- page flags in the reader and on the thumbnails
await jump(3);
const flagBtn = page.getByRole("button", { name: /^İşaretle/ });
await flagBtn.click();
const menu = page.getByRole("group", { name: "İşaretle" });
await menu.getByText("Sınav adayı").click();
await page.getByRole("group", { name: /İşaretli/ }).getByText("Hoca vurguladı").click();
await minHeight(page.getByRole("group", { name: /İşaretli/ }).locator(".item"), "flag menu");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "İşaretli (2)" }).waitFor().catch(() => fail("flag button should count 2 flags on page 3"));
const thumb3 = page.locator('[data-thumb="3"] .flags i');
await thumb3.first().waitFor().catch(() => fail("thumbnail 3 shows no flags"));
if ((await thumb3.count()) !== 2) await fail(`thumbnail 3 should show 2 flags, got ${await thumb3.count()}`);
await jump(5);
await page.getByRole("button", { name: /^İşaretle$/ }).click();
await page.getByRole("group", { name: "İşaretle" }).getByText("Anlaşılmadı").click();
await page.keyboard.press("Escape");
await page.locator('[data-thumb="5"] .flags i').first().waitFor().catch(() => fail("thumbnail 5 shows no flag"));
// A "Sınav" highlight on page 1 (programmatic selection, as in e2e-study).
await jump(1);
await page.locator('[data-page="1"] .textLayer span').first().waitFor();
await page.evaluate(() => {
  const span = [...document.querySelectorAll('[data-page="1"] .textLayer span')].find((s) => s.textContent.trim());
  const range = document.createRange();
  range.selectNodeContents(span);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  span.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
});
await page.getByRole("toolbar", { name: "Vurgu etiketi" }).getByRole("button", { name: "Sınav" }).click();
console.log("flags: menu toggles, counts, thumbnails show flags, Sınav highlight added");

// ---- a lecture recording with a transcript (fake whisper)
await page.getByRole("button", { name: "Ses kaydı" }).click();
await page.getByRole("button", { name: "Duraklat" }).waitFor();
await page.waitForTimeout(4000);
await page.getByRole("button", { name: "Kaydı durdur" }).click();
await page.getByRole("button", { name: "Yazıya dök" }).click({ timeout: 10_000 });
await page.getByRole("button", { name: "Dökümü gizle" }).waitFor({ timeout: 20_000 }).catch(() => fail("no transcript"));
await page.getByRole("button", { name: "← Kütüphane" }).click();

// ---- Sınav hazırlığı
await page.getByRole("button", { name: "Çalışma Merkezi" }).click();
const exam = page.getByRole("region", { name: "Sınav hazırlığı" });
const item = (n) => exam.getByRole("button", { name: `Hafta 4: Yonlendirme, sayfa ${n}` });
await item(3).waitFor({ timeout: 5000 }).catch(() => fail("flagged page 3 not in the exam list"));
const listed = async () => (await exam.locator(".item").allInnerTexts()).map((t) => t.match(/s\. (\d+)/)?.[1]).join(",");
if ((await listed()) !== "1,3,5") await fail(`exam list should be pages 1,3,5, got ${await listed()}`);
if (!(await item(3).innerText()).includes("Hoca vurguladı")) await fail("page 3 should show Hoca vurguladı");
if (!(await item(1).innerText()).includes("(metinsiz vurgu)") && !(await item(1).innerText()).includes("Yonlendirme")) await fail("page 1 should show the Sınav highlight text");
await exam.locator("canvas[data-drawn]").first().waitFor({ timeout: 10_000 }).catch(() => fail("page previews not drawn"));
await minHeight(exam.locator(".chip, .item, select"), "exam view");
await exam.getByRole("button", { name: /^Sınav adayı/ }).click();
if ((await listed()) !== "3") await fail(`Sınav adayı filter should leave page 3, got ${await listed()}`);
await exam.getByRole("button", { name: /^Sınav vurgusu/ }).click();
if ((await listed()) !== "1") await fail(`Sınav vurgusu filter should leave page 1, got ${await listed()}`);
await exam.getByRole("button", { name: /^Tümü/ }).click();
await exam.getByLabel("Hafta filtresi").selectOption("4");
if ((await listed()) !== "1,3,5") await fail(`week 4 should keep all pages, got ${await listed()}`);
await page.screenshot({ path: "docs/screenshots/exam-light.png" });
await item(5).click();
await page.locator('[data-page="5"] .textLayer span').first().waitFor();
await page.waitForFunction(() => document.querySelector(".page-input")?.value === "5", null, { timeout: 5000 }).catch(() => fail("reader should open at page 5"));
console.log("exam view: flags + Sınav highlight listed, filters, previews, tap opens page 5");
await page.getByRole("button", { name: "← Kütüphane" }).click();

// ---- AI cards from slides
await page.getByRole("button", { name: "Yapay zekâ" }).click();
const cards = page.getByRole("region", { name: "Slayttan kart üret" });
await cards.waitFor({ timeout: 10_000 }).catch(() => fail("AI cards panel missing"));
await cards.getByLabel("Kart için belge").selectOption({ label: "Hafta 4: Yonlendirme" });
await cards.getByLabel("İlk sayfa").fill("3");
await cards.getByLabel("Son sayfa").fill("4");
await cards.getByRole("button", { name: "Kart üret" }).click();
const drafts = cards.getByRole("list", { name: "Kart önerileri" }).locator("li");
await drafts.first().waitFor({ timeout: 10_000 }).catch(() => fail("no card drafts"));
if (!lastPrompt.includes("[s. 3]") || lastPrompt.includes("[s. 5]")) await fail("prompt should hold pages 3-4 only");
if ((await drafts.count()) !== 3) await fail(`3 valid drafts expected, got ${await drafts.count()}`);
if (!(await cards.getByText("1 hatalı öneri atlandı").count())) await fail("the broken draft should be reported");
await minHeight(cards.locator("button, input:not([type=checkbox]), .keep"), "AI cards");
await drafts.nth(0).getByLabel("Kavram").fill("Dijkstra algoritması");
await drafts.nth(1).getByRole("button", { name: "Öneriyi sil" }).click();
if ((await drafts.count()) !== 2) await fail("deleting a draft should leave 2");
await page.screenshot({ path: "docs/screenshots/ai-cards-light.png" });
await cards.getByRole("button", { name: "2 kartı kaydet" }).click();
await cards.getByText("2 kart kaydedildi.").waitFor().catch(() => fail("cards not saved"));
console.log("AI cards: only pages 3-4 sent, invalid item skipped, edit + delete, 2 saved");

// ---- chat cites the transcript and plays the recording from there
await page.getByLabel("Soru").fill("Dijkstra ne yapar?");
await page.getByRole("button", { name: "Gönder" }).click();
const recCite = page.getByRole("button", { name: "[kayıt 00:02]" });
await recCite.waitFor({ timeout: 10_000 }).catch(() => fail("no [kayıt 00:02] citation"));
if (!lastPrompt.includes("ders kaydı [kayıt 00:00]")) await fail("chat prompt should include the transcript paragraph");
await recCite.click();
await page.getByRole("status").filter({ hasText: /Dinleniyor: Hafta 4: Yonlendirme · 00:02/ }).waitFor({ timeout: 5000 })
  .catch(() => fail("recording did not start from the cited moment"));
console.log("chat: transcript retrieved, [kayıt 00:02] citation plays the recording");

// ---- saved AI cards are Leitner cards with their own quiz options
await page.getByRole("button", { name: "Çalışma Merkezi'ne git" }).click();
await page.getByTestId("due-count").waitFor();
if ((await page.getByTestId("due-count").textContent()) !== "2") await fail(`2 due cards expected, got ${await page.getByTestId("due-count").textContent()}`);
await page.getByRole("button", { name: "Test çöz" }).click();
const body = await page.locator("main").innerText();
if (body.includes("OSPF hangi algoritmayı kullanır?") && !/Bellman-Ford|Prim|Kruskal/.test(body)) await fail("AI question should show its own wrong options");
console.log("study: AI cards due today, quiz runs");

if (errors.length) await fail("console errors");
await browser.close();
console.log("e2e-exam ok");
