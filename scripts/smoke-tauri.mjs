// Smoke test of the real Tauri app through WebView2's DevTools port. Read-only: it only looks at screens.
// Needs `npm run dev` (port 1420) and a debug build (`cargo build` in src-tauri).
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";

const exe = process.env.NITO_EXE ?? "src-tauri/target/debug/nito.exe";
const app = spawn(exe, [], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9333" },
  stdio: "ignore",
});
const fail = (msg) => {
  console.error("FAIL:", msg);
  app.kill();
  process.exit(1);
};
let browser;
for (let i = 0; i < 40 && !browser; i++) {
  browser = await chromium.connectOverCDP("http://127.0.0.1:9333").catch(() => null);
  if (!browser) await new Promise((r) => setTimeout(r, 500));
}
if (!browser) fail("no DevTools connection");
const page = browser.contexts()[0].pages()[0];
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.reload();
await page.waitForSelector("main, nav", { timeout: 20_000 }).catch(() => fail("app did not render"));
const isTauri = await page.evaluate(() => "__TAURI_INTERNALS__" in window);
const version = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("db_all", { sql: "PRAGMA user_version", params: [] }));
const empty = await page.getByRole("heading", { name: "Kütüphanen boş" }).count();
let checks = [`tauri=${isTauri}`, `schema=v${version[0].user_version}`, empty ? "empty library" : "library has documents"];
if (!empty) {
  if (!(await page.getByRole("button", { name: "Yedekle" }).count())) fail("backup buttons missing");
  checks.push("backup buttons");
  await page.getByRole("button", { name: "Yapay zekâ" }).click();
  await page.waitForTimeout(3000);
  checks.push((await page.getByText("Ollama çalışmıyor").count()) ? "AI: Ollama not reachable" : "AI: Ollama reachable");
  await page.getByRole("button", { name: "Tümü" }).click();
}
await page.screenshot({ path: "test-results/tauri-smoke.png" /* real user data: never commit */ });
console.log(checks.join(" | "));
app.kill();
if (errors.length) fail(`console errors:\n${errors.join("\n")}`);
process.exit(0);
