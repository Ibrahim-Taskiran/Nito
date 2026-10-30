// E2E: lecture audio. Records across two pages from a generated clip with a gap (fake mic file), then checks
// the page chip plays from the right moment, the page timeline, note replay, silence skip, 2.5× and a spoken cue badge.
// Needs `npm run dev` (NITO_URL).
import { chromium } from "@playwright/test";
import { penToggle } from "./e2e-ink.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env.NITO_URL ?? "http://localhost:1420";

// 48 kHz mono 16-bit clip: 2 s voice-like tone, 3 s silence, 4 s tone (Chromium loops the file).
function clip() {
  const rate = 48000;
  const parts = [[2, true], [3, false], [4, true]];
  const n = parts.reduce((s, [d]) => s + d * rate, 0);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  let i = 0;
  for (const [d, loud] of parts) {
    for (let k = 0; k < d * rate; k++, i++) {
      const t = i / rate;
      const am = 0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * t);
      const v = loud ? am * (0.35 * Math.sin(2 * Math.PI * 180 * t) + 0.2 * Math.sin(2 * Math.PI * 360 * t) + 0.1 * Math.sin(2 * Math.PI * 900 * t)) : 0;
      buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
    }
  }
  mkdirSync("test-results", { recursive: true });
  const path = resolve("test-results/e2e-audio-gap.wav");
  writeFileSync(path, buf);
  return path;
}

// Canned whisper output: one paragraph whose cue phrases fall late in the text (on page 2).
const whisper = JSON.stringify({
  transcription: [
    { offsets: { from: 0, to: 4000 }, text: " Merhaba arkadaşlar, bugün ağ katmanlarını ve aralarındaki ilişkileri ayrıntılı olarak anlatacağım, iyi dinleyin." },
    { offsets: { from: 4000, to: 8000 }, text: " Bu konu çok önemli, sınavda çıkar." },
  ],
});

const browser = await chromium.launch({
  channel: process.env.NITO_BROWSER ?? "msedge",
  args: [
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${clip()}`,
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const fail = async (msg) => {
  await page.screenshot({ path: "test-results/e2e-audio-fail.png" }).catch(() => {});
  console.error("FAIL:", msg, errors.join("\n"));
  process.exit(1);
};
await page.addInitScript((json) => {
  window.__NITO_FAKE_WHISPER__ = json;
  window.__gum = [];
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = (c) => (window.__gum.push(c), real(c));
}, whisper);

await page.goto(url);
const chooser = page.waitForEvent("filechooser");
await page.getByRole("button", { name: "PDF ekle" }).click();
await (await chooser).setFiles([resolve("tests/fixtures/notes/Hafta 5_Uzun Belge.pdf")]);
await page.getByRole("button", { name: /Uzun Belge/ }).click();
await page.getByRole("button", { name: "Aç" }).click();
await page.locator(".textLayer span").first().waitFor();
const pageInput = page.getByRole("textbox", { name: "Sayfa numarası" });

// 1) Record: page 1 for ~2.3 s, then page 2 with a pen stroke and a highlight.
await page.getByRole("button", { name: "Ses kaydı" }).click();
await page.getByRole("button", { name: "Duraklat" }).waitFor();
const gum = await page.evaluate(() => window.__gum[0]?.audio);
if (!gum?.noiseSuppression || !gum?.echoCancellation || !gum?.autoGainControl) await fail(`mic constraints: ${JSON.stringify(gum)}`);
await page.waitForTimeout(2300);
await pageInput.fill("2");
await pageInput.press("Enter");
const p2 = page.locator('[data-page="2"]');
await p2.locator(".textLayer span").first().waitFor();
await page.waitForTimeout(1200);
await penToggle(page);
const box = await p2.boundingBox();
await page.mouse.move(box.x + 100, box.y + 200);
await page.mouse.down();
await page.mouse.move(box.x + 200, box.y + 230, { steps: 8 });
await page.mouse.up();
await penToggle(page);
await page.waitForTimeout(800);
await page.evaluate(() => {
  const span = document.querySelector('[data-page="2"] .textLayer span');
  const range = document.createRange();
  range.selectNodeContents(span);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  span.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
});
await page.getByRole("toolbar", { name: "Vurgu etiketi" }).getByRole("button", { name: "Tanım" }).click();
await page.waitForTimeout(4000);
await page.getByRole("button", { name: "Kaydı durdur" }).click();

// 2) Page chips: page 2 plays from the moment it was first shown.
const chip2 = p2.getByRole("button", { name: "Bu sayfanın anlatıldığı yere git" });
await chip2.waitFor({ timeout: 10_000 }).catch(() => fail("no page chip on page 2"));
const chipText = (await chip2.textContent()).trim();
if (chipText !== "00:02") await fail(`page 2 chip should say 00:02, got "${chipText}"`);
await chip2.click();
const recs = page.getByRole("region", { name: "Kayıtlar" });
const seek = recs.getByRole("slider", { name: "Konum" });
await seek.waitFor({ timeout: 5000 }).catch(() => fail("player did not open from the chip"));
const startAt = Number(await seek.inputValue());
if (startAt < 2 || startAt > 3.2) await fail(`page 2 should play from ~2.3 s, got ${startAt}`);
await page.getByRole("button", { name: "Oynatmayı durdur" }).waitFor({ timeout: 5000 }).catch(() => fail("chip playback did not start"));
const timeline = recs.getByRole("group", { name: "Sayfa zaman çizelgesi" });
const segs = await timeline.getByRole("button").allTextContents();
if (segs.join("|") !== "s. 1|s. 2") await fail(`timeline should be s. 1|s. 2, got ${segs.join("|")}`);
console.log(`chip: page 2 from ${startAt.toFixed(1)} s | timeline ${segs.join(", ")}`);

// 3) Note replay: with the toggle on, page 2's stroke and highlight wait for their moment.
await page.getByRole("button", { name: "Oynatmayı durdur" }).click();
const setPos = (v) => seek.evaluate((el, x) => { el.value = String(x); el.dispatchEvent(new Event("input", { bubbles: true })); }, v);
const count = () => p2.evaluate((el) => ({ hl: el.querySelectorAll(".hl").length, ink: el.querySelectorAll("svg.ink:not(.under) path").length }));
const before = await count();
if (before.hl < 1 || before.ink < 1) await fail(`notes missing on page 2: ${JSON.stringify(before)}`);
await recs.getByRole("button", { name: "Notları sesle birlikte göster" }).click();
await setPos(1);
const early = await count();
if (early.hl !== before.hl - 1 || early.ink !== before.ink - 1) await fail(`replay should hide the new notes at 1 s: ${JSON.stringify({ before, early })}`);
await setPos(Number(await seek.getAttribute("max")) - 0.2);
const late = await count();
if (late.hl !== before.hl || late.ink !== before.ink) await fail(`replay should show the notes at the end: ${JSON.stringify(late)}`);
await recs.getByRole("button", { name: "Notları sesle birlikte göster" }).click();
await setPos(1);
if ((await count()).hl !== before.hl) await fail("notes hidden with the toggle off");
console.log("replay: notes hidden before their moment, shown after, toggle off shows all");

// 4) 2.5× and silence skip: the 3 s gap is jumped over.
await recs.getByRole("combobox", { name: "Oynatma hızı" }).selectOption("2.5");
if ((await page.evaluate(() => localStorage.getItem("nito.playbackRate"))) !== "2.5") await fail("2.5× not saved");
await recs.getByRole("button", { name: "Sessizliği atla" }).click();
await recs.getByText(/sessizlik atlanır/).waitFor({ timeout: 10_000 }).catch(async () => fail(`no silence found: ${await recs.locator(".player").textContent()}`));
await setPos(0);
await recs.getByRole("button", { name: "Kaydı oynat" }).click();
const samples = await seek.evaluate(async (el) => {
  const out = [];
  const t0 = performance.now();
  while (performance.now() - t0 < 2600) {
    out.push([performance.now() - t0, Number(el.value)]);
    await new Promise((r) => setTimeout(r, 50));
  }
  return out;
});
let jump = 0;
let normal = 0;
for (let i = 1; i < samples.length; i++) {
  const d = samples[i][1] - samples[i - 1][1];
  if (d > 1.5) jump = Math.max(jump, d);
  else if (d > 0) normal += d;
}
const elapsed = (samples.at(-1)[0] - samples[0][0]) / 1000;
if (!jump) await fail(`no silence jump: ${JSON.stringify(samples.map((s) => s[1].toFixed(1)))}`);
if (normal / elapsed < 1.6) await fail(`speed should be ~2.5×, measured ${(normal / elapsed).toFixed(2)}×`);
await recs.getByRole("button", { name: "Sessizliği atla" }).click();
await page.getByRole("button", { name: "Oynatmayı durdur" }).click().catch(() => {});
console.log(`silence: jumped ${jump.toFixed(1)} s | speed ${(normal / elapsed).toFixed(2)}×`);

// 5) Spoken cue from the transcript: badge on page 2, listed in the panel, paragraph shows its page.
await recs.getByRole("button", { name: "Yazıya dök" }).click();
await recs.getByRole("button", { name: "Dökümü gizle" }).waitFor({ timeout: 15_000 }).catch(() => fail("no transcript"));
const badge = p2.getByRole("button", { name: /Sınav ipucu: \d/ });
await badge.waitFor({ timeout: 5000 }).catch(() => fail("no cue badge on page 2"));
if ((await page.locator('[data-page="1"]').getByRole("button", { name: /Sınav ipucu/ }).count()) !== 0) await fail("cue badge on page 1");
const listed = await recs.getByRole("group", { name: "Sınav ipuçları" }).getByRole("button").allTextContents();
if (!listed.some((t) => /s\. 2 · .*“çok önemli”/.test(t))) await fail(`cue list: ${listed.join(" | ")}`);
const paraText = await recs.locator(".transcript p").first().textContent();
if (!/s\. 1, 2/.test(paraText)) await fail(`paragraph should show s. 1, 2: ${paraText}`);
await badge.click();
// The page's transcript (beside the page here, under it on phones) replaced the old popover.
const pop = page.getByRole("region", { name: "Sayfa 2 dökümü" });
await pop.waitFor().catch(() => fail("page 2 transcript did not open"));
await pop.scrollIntoViewIfNeeded();
await page.screenshot({ path: "docs/screenshots/reader-audio-light.png" });
await pop.getByRole("button", { name: /anından dinle/ }).first().click();
await page.getByRole("button", { name: "Oynatmayı durdur" }).waitFor({ timeout: 5000 }).catch(() => fail("cue playback did not start"));
console.log(`cues: badge on page 2 | list ${listed.length} | paragraph pages ok`);

// 6) Mic setting off: the next recording asks for raw audio.
await recs.getByRole("checkbox", { name: "Kayıtta gürültü ve yankı engelleme" }).uncheck();
await page.getByRole("button", { name: "Oynatmayı durdur" }).click().catch(() => {});
await page.getByRole("button", { name: "Ses kaydı" }).click();
await page.getByRole("button", { name: "Duraklat" }).waitFor();
const raw = await page.evaluate(() => window.__gum.at(-1)?.audio);
if (raw?.noiseSuppression !== false || raw?.autoGainControl !== false) await fail(`mic setting off ignored: ${JSON.stringify(raw)}`);
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Kaydı durdur" }).click();
console.log("mic: constraints on by default, off when the setting is off");

if (errors.length) await fail("console errors");
await browser.close();
