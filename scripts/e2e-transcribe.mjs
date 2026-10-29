// E2E: record, then "Yazıya dök". Without whisper the web build says "Whisper kurulu değil" (no setup button);
// with window.__NITO_FAKE_WHISPER__ (canned whisper JSON) the real WAV conversion runs and a transcript note appears.
import { chromium } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env.NITO_URL ?? "http://localhost:1420";
const fixtures = readdirSync("tests/fixtures").filter((f) => f.endsWith(".pdf")).map((f) => resolve("tests/fixtures", f));
const canned = readFileSync("tests/fixtures/whisper-sample.json", "utf8");
const browser = await chromium.launch({
  channel: process.env.NITO_BROWSER ?? "msedge",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const errors = [];
const fail = (msg) => {
  console.error("FAIL:", msg, errors.join("\n"));
  process.exit(1);
};

async function openWithRecording({ fake, colorScheme }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  if (fake) await page.addInitScript((json) => (window.__NITO_FAKE_WHISPER__ = json), canned);
  await page.goto(url);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "PDF ekle" }).click();
  await (await chooser).setFiles(fixtures);
  await page.getByRole("button", { name: /Hafta 2/ }).click();
  await page.getByRole("button", { name: "Aç" }).click();
  await page.locator(".textLayer span").first().waitFor().catch(async () => {
    await page.screenshot({ path: "test-results/e2e-transcribe-fail.png" });
    fail("pdf did not render");
  });
  await page.getByRole("button", { name: "Kaydet" }).click();
  await page.getByRole("button", { name: "Duraklat" }).waitFor();
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: "Kaydı durdur" }).click();
  await page.getByRole("button", { name: "Yazıya dök" }).waitFor({ timeout: 10_000 }).catch(() => fail("no Yazıya dök button"));
  return page;
}

// 1) Web without whisper.
{
  const page = await openWithRecording({ fake: false, colorScheme: "light" });
  await page.getByRole("button", { name: "Yazıya dök" }).click();
  await page.getByText("Whisper kurulu değil").waitFor({ timeout: 5000 }).catch(() => fail("no 'Whisper kurulu değil'"));
  if (await page.getByRole("button", { name: "Whisper kur" }).count()) fail("setup must be hidden on web");
  await page.locator(".recs").screenshot({ path: "docs/screenshots/transcribe-missing-light.png" });
  await page.close();
}

// 2) Fake whisper: real webm -> 16 kHz WAV conversion, canned JSON, transcript note.
for (const colorScheme of ["light", "dark"]) {
  const page = await openWithRecording({ fake: true, colorScheme });
  await page.getByRole("button", { name: "Yazıya dök" }).click();
  await page.getByText(/Yazıya dökülüyor… %\d+/).waitFor({ timeout: 10_000 }).catch(() => fail("no whisper progress (WAV conversion failed?)"));
  await page.getByRole("button", { name: "Dökümü gizle" }).waitFor({ timeout: 10_000 }).catch(() => fail("no transcript after run"));
  const t = page.locator(".transcript");
  if ((await t.getAttribute("data-note")) == null) fail("transcript not linked to a note");
  const text = await t.textContent();
  if (!/^\s*00:00/.test(text) || !text.includes("Normalization removes repeated data.")) fail(`unexpected transcript: ${text.slice(0, 120)}`);
  const stamps = await t.locator(".ts").count();
  if (stamps < 2) fail(`expected >= 2 paragraphs, got ${stamps}`);
  await page.screenshot({ path: `docs/screenshots/transcribe-done-${colorScheme}.png` });
  await t.locator(".ts").first().click(); // the 3 s fake recording only covers the first paragraph
  await page.getByRole("button", { name: "Oynatmayı durdur" }).waitFor({ timeout: 5000 }).catch(() => fail("paragraph playback did not start"));
  console.log(`${colorScheme}: transcript ok, ${stamps} paragraphs, playback from paragraph ok`);
  await page.close();
}

if (errors.length) fail("console errors");
console.log("e2e-transcribe: ok");
await browser.close();
