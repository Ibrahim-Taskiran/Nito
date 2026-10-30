// Chat engines. Pure: the caller passes the fetch to use (browser fetch or Tauri's http plugin).
// Two kinds: the built-in llama.cpp server (OpenAI-compatible API) and an Ollama the user runs.
import type { ChatMessage } from "./prompts";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface ChatOptions {
  messages: ChatMessage[];
  onToken?: (t: string) => void;
  signal?: AbortSignal;
}

export interface Engine {
  kind: "builtin" | "ollama";
  chat(opts: ChatOptions): Promise<string>;
}

/** The engine cannot be reached (not running, crashed, port closed). */
export class EngineDown extends Error {
  constructor(cause?: unknown) {
    super("Yapay zekâ motoru yanıt vermiyor");
    this.cause = cause;
  }
}

/** Fetch that turns network failures into EngineDown (aborts pass through). */
export async function reach(fetch: Fetch, url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    if (init?.signal?.aborted) throw e;
    throw new EngineDown(e);
  }
}

/** Yields non-empty lines of a newline-delimited byte stream. */
export async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
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

/** Payloads of a server-sent event stream (`data: …` lines) until `[DONE]`. */
export async function* sse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  for await (const line of lines(body)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data === "[DONE]") return;
    if (data) yield data;
  }
}

export interface Endpoint {
  url: string;
  key: string;
}

/** Streams a chat answer from an OpenAI-compatible server (llama-server). */
export async function openAiChat(fetch: Fetch, ep: Endpoint, opts: ChatOptions): Promise<string> {
  const res = await reach(fetch, `${ep.url}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ep.key}` },
    body: JSON.stringify({ messages: opts.messages, stream: true, temperature: 0.2 }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(`Yapay zekâ hatası (${res.status}): ${await res.text().catch(() => "")}`);
  let full = "";
  for await (const data of sse(res.body)) {
    const msg = JSON.parse(data) as { choices?: { delta?: { content?: string | null } }[]; error?: { message?: string } | string };
    if (msg.error) throw new Error(typeof msg.error === "string" ? msg.error : msg.error.message ?? "Yapay zekâ hatası");
    const t = msg.choices?.[0]?.delta?.content ?? "";
    if (t) {
      full += t;
      opts.onToken?.(t);
    }
  }
  return full;
}

export const openAiEngine = (fetch: Fetch, ep: Endpoint): Engine => ({
  kind: "builtin",
  chat: (opts) => openAiChat(fetch, ep, opts),
});
