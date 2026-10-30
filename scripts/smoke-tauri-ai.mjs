// Smoke test of the built-in AI in the real Tauri app: Rust starts llama-server, the webview streams a Turkish
// answer through the http plugin (scope 127.0.0.1:*), and killing the app also kills the server (job object).
// Needs a dev server for the build's devUrl and an installed model (<app data>/ai). It does not touch the library.
// NITO_EXE picks the build; NITO_AI_MODEL picks "fast" or "quality" (default: the first installed one).
import { chromium } from "@playwright/test";
import { execSync, spawn } from "node:child_process";

const exe = process.env.NITO_EXE ?? "src-tauri/target/debug/nito.exe";
const servers = () => execSync('tasklist /FI "IMAGENAME eq llama-server.exe" /NH').toString().split("\n").filter((l) => /llama-server/i.test(l)).length;
const before = servers();
const app = spawn(exe, [], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9334" },
  stdio: "ignore",
});
const fail = (msg) => {
  console.error("FAIL:", msg);
  app.kill();
  process.exit(1);
};
let browser;
for (let i = 0; i < 60 && !browser; i++) {
  browser = await chromium.connectOverCDP("http://127.0.0.1:9334").catch(() => null);
  if (!browser) await new Promise((r) => setTimeout(r, 500));
}
if (!browser) fail("no DevTools connection");
const page = browser.contexts()[0].pages()[0];
await page.waitForSelector("main, nav", { timeout: 30_000 }).catch(() => fail("app did not render"));

const result = await page.evaluate(async (want) => {
  const { tauriAi } = await import("/src/platform/tauri/ai.ts");
  const { openAiChat } = await import("/src/core/ai/engine.ts");
  const st = await tauriAi.builtin.status();
  const model = want ?? st.models.find((m) => m.installed)?.id;
  if (!model) return { error: "no model installed", st };
  const t0 = performance.now();
  const ep = await tauriAi.builtin.start(model);
  const startMs = performance.now() - t0;
  let tokens = 0;
  const t1 = performance.now();
  const answer = await openAiChat(tauriAi.fetch, ep, {
    messages: [{ role: "user", content: "Bir öğrenciye fotosentezi üç kısa cümleyle Türkçe anlat." }],
    onToken: () => tokens++,
  });
  // Another host must be refused by the http plugin scope.
  const blocked = await tauriAi.fetch("https://example.com/").then(() => false, () => true);
  return { model, st, url: ep.url, startMs, chatMs: performance.now() - t1, tokens, answer, blocked };
}, process.env.NITO_AI_MODEL ?? null);
if (result.error) fail(`${result.error} ${JSON.stringify(result.st)}`);
const running = servers();
console.log(`status: ram ${(result.st.ramBytes / 2 ** 30).toFixed(1)} GB, free ${(result.st.freeBytes / 2 ** 30).toFixed(1)} GB, installed ${result.st.models.filter((m) => m.installed).map((m) => m.id)}`);
console.log(`start ${result.model} at ${result.url} in ${(result.startMs / 1000).toFixed(1)} s; ${result.tokens} streamed pieces in ${(result.chatMs / 1000).toFixed(1)} s`);
console.log(`answer: ${result.answer.replace(/\s+/g, " ").slice(0, 400)}`);
if (!result.answer.trim() || result.tokens < 3) fail("no streamed answer");
if (!result.blocked) fail("http scope should refuse other hosts");
if (running <= before) fail("llama-server should run while the app runs");

// Hard kill (no clean exit event): the job object must take the server down too.
app.kill();
await new Promise((r) => setTimeout(r, 2500));
const after = servers();
console.log(`llama-server processes: before ${before}, running ${running}, after kill ${after}`);
if (after > before) fail("llama-server outlived the app");
console.log("smoke-tauri-ai ok");
process.exit(0);
