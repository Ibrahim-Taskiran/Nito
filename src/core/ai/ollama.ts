// Ollama HTTP client. Pure: the caller passes the fetch to use (browser fetch or Tauri's http plugin).
import type { ChatMessage } from "./prompts";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export const OLLAMA_URL = "http://localhost:11434";
/** Preferred default: permissive (Apache-2.0) and good at Turkish. */
export const DEFAULT_MODEL = "qwen2.5:7b";
/** Models whose licence allows research use only; allowed locally, never the default. */
const RESEARCH_ONLY = [/^qwen2\.5:3b/, /^qwen2\.5-coder:3b/];

export const isResearchOnly = (model: string): boolean => RESEARCH_ONLY.some((r) => r.test(model));

/** Saved choice if still installed, else the preferred default, else the first permissive model. */
export function pickModel(installed: string[], saved: string | null): string | null {
  if (saved && installed.includes(saved)) return saved;
  if (installed.includes(DEFAULT_MODEL)) return DEFAULT_MODEL;
  return installed.find((m) => !isResearchOnly(m)) ?? installed[0] ?? null;
}

export class OllamaDown extends Error {
  constructor(cause?: unknown) {
    super("Ollama çalışmıyor");
    this.cause = cause;
  }
}

export async function listModels(fetch: Fetch, base = OLLAMA_URL): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${base}/api/tags`);
  } catch (e) {
    throw new OllamaDown(e);
  }
  if (!res.ok) throw new OllamaDown(res.status);
  const body = (await res.json()) as { models?: { name: string }[] };
  return (body.models ?? []).map((m) => m.name).sort();
}

/** Streams a chat answer; calls onToken for each piece and returns the full text. */
export async function chat(
  fetch: Fetch,
  opts: { model: string; messages: ChatMessage[]; onToken?: (t: string) => void; signal?: AbortSignal; numCtx?: number },
  base = OLLAMA_URL,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: opts.model, messages: opts.messages, stream: true, options: { num_ctx: opts.numCtx ?? 8192, temperature: 0.2 } }),
      signal: opts.signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    throw new OllamaDown(e);
  }
  if (!res.ok || !res.body) throw new Error(`Ollama hatası (${res.status}): ${await res.text().catch(() => "")}`);
  let full = "";
  for await (const line of ndjson(res.body)) {
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

/** Yields non-empty lines of a newline-delimited byte stream. */
export async function* ndjson(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line) yield line;
      }
    }
    buf += dec.decode();
    if (buf.trim()) yield buf.trim();
  } finally {
    reader.releaseLock();
  }
}
