// E2E: record while reading, highlight mid-recording, stop, play from the mark. Needs `npm run dev`.
import { chromium } from "@playwright/test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env.NITO_URL ?? "http://localhost:1420";
const fixtures = readdirSync("tests/fixtures").filter((f) => f.endsWith(".pdf")).map((f) => resolve("tests/fixtures", f));
const browser = await chromium.launch({
  channel: process.env.NITO_BROWSER ?? "msedge",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
await (await chooser).setFiles(fixtures);
await page.getByRole("button", { name: /Hafta 2/ }).click();
await page.getByRole("button", { name: "Aç" }).click();
await page.locator(".textLayer span").first().waitFor();

await page.getByRole("button", { name: "Ses kaydı" }).click();
await page.getByRole("button", { name: "Duraklat" }).waitFor();
await page.waitForTimeout(3200);
await page.evaluate(() => {
  const span = document.querySelector(".textLayer span");
  const range = document.createRange();
  range.selectNodeContents(span);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  span.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
});
await page.getByRole("toolbar", { name: "Vurgu etiketi" }).getByRole("button", { name: "Tanım" }).click();
await page.getByRole("button", { name: "Duraklat" }).click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "Sürdür" }).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: "docs/screenshots/reader-recording-light.png" });
await page.getByRole("button", { name: "Kaydı durdur" }).click();

const play = page.getByRole("button", { name: /▶ 00:0\d/ });
await play.waitFor({ timeout: 10_000 }).catch(() => fail("no ▶ button after stop"));
const label = (await play.textContent()).trim();
if (!/00:0[3-4]/.test(label)) fail(`mark offset should be 3-4 s, got "${label}"`);
await play.click();
await page.getByRole("button", { name: /❚❚ 00:0/ }).waitFor({ timeout: 5000 }).catch(() => fail("playback did not start"));
console.log("mark:", label, "| recording elapsed ok | playback started");

// Recording list: play, speed, skip, delete with confirm.
const recs = page.getByRole("region", { name: "Kayıtlar" });
await recs.getByRole("button", { name: "Kaydı oynat" }).click();
const rate = recs.getByRole("combobox", { name: "Oynatma hızı" });
await rate.waitFor({ timeout: 5000 }).catch(() => fail("no player controls"));
await rate.selectOption("1.5");
const speed = await page.evaluate(() => [...document.querySelectorAll("audio")].map((a) => a.playbackRate));
const stored = await page.evaluate(() => localStorage.getItem("nito.playbackRate"));
if (stored !== "1.5") fail(`speed not saved: ${stored} ${speed}`);
await recs.getByRole("button", { name: "10 saniye ileri" }).click();
await recs.getByRole("button", { name: "Kaydı sil" }).click();
await page.getByRole("dialog", { name: "Kaydı sil" }).getByRole("button", { name: "Sil", exact: true }).click();
await recs.getByText("Kayıt yok.").waitFor({ timeout: 5000 }).catch(() => fail("recording not deleted"));
if ((await page.getByRole("button", { name: /▶ 00:0\d/ }).count()) !== 0) fail("mark still shown after delete");
console.log("list: speed 1.5× saved | skip ok | delete ok, mark gone");
if (errors.length) fail("console errors");
await browser.close();
