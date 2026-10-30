// Ollama HTTP client, used only when the user runs Ollama and picks it. Pure: fetch is passed in.
import { EngineDown, lines, reach, type ChatOptions, type Engine, type Fetch } from "./engine";

export const OLLAMA_URL = "http://localhost:11434";
/** Preferred default: permissive (Apache-2.0) and good at Turkish. */
export const DEFAULT_MODEL = "qwen2.5:7b";

/** Families whose licence allows commercial use (Apache-2.0 or MIT). */
const PERMISSIVE = [/^qwen3/, /^qwen2\.5:/, /^qwen2:/, /^mistral(-nemo)?:/, /^phi[34]/, /^granite/, /^olmo/, /^smollm/, /^gpt-oss/];
/** Sizes of those families under a research-only or custom licence. */
const RESTRICTED = [/^qwen2\.5:3b/, /^qwen2\.5-coder:3b/, /^qwen2\.5:72b/, /^qwen2:72b/];

export const isResearchOnly = (model: string): boolean => RESTRICTED.some((r) => r.test(model));
/** Code, embedding and vision-only models are poor at course summaries. */
export const isCoder = (model: string): boolean => /coder|code|embed|llava|vision/i.test(model);
export const isPermissive = (model: string): boolean =>
  !isResearchOnly(model) && !isCoder(model) && PERMISSIVE.some((r) => r.test(model));

/** Saved choice if still installed, else the preferred default, else the first permissive chat model. */
export function pickModel(installed: string[], saved: string | null): string | null {
  if (saved && installed.includes(saved)) return saved;
  if (installed.includes(DEFAULT_MODEL)) return DEFAULT_MODEL;
  return installed.find(isPermissive) ?? null;
}

export async function listModels(fetch: Fetch, base = OLLAMA_URL): Promise<string[]> {
  const res = await reach(fetch, `${base}/api/tags`);
  if (!res.ok) throw new EngineDown(res.status);
  const body = (await res.json()) as { models?: { name: string }[] };
  return (body.models ?? []).map((m) => m.name).sort();
}

/** Streams a chat answer; calls onToken for each piece and returns the full text. */
export async function chat(
  fetch: Fetch,
  opts: ChatOptions & { model: string; numCtx?: number },
  base = OLLAMA_URL,
): Promise<string> {
  const res = await reach(fetch, `${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: opts.model, messages: opts.messages, stream: true, options: { num_ctx: opts.numCtx ?? 8192, temperature: 0.2 } }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(`Ollama hatası (${res.status}): ${await res.text().catch(() => "")}`);
  let full = "";
  for await (const line of lines(res.body)) {
    const msg = JSON.parse(line) as { message?: { content?: string }; error?: string; done?: boolean };
    if (msg.error) throw new Error(msg.error);
    const t = msg.message?.content ?? "";
    if (t) {
      full += t;
      opts.onToken?.(t);
    }
    if (msg.done) break;
  }
  return full;
}

export const ollamaEngine = (fetch: Fetch, model: string, base = OLLAMA_URL): Engine => ({
  kind: "ollama",
  chat: (opts) => chat(fetch, { ...opts, model }, base),
});
