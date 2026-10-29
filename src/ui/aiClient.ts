// The one place that knows how to reach Ollama. Browser dev mode uses fetch; the Tauri webview
// goes through the http plugin (scoped to localhost:11434) so Ollama's CORS check does not block it.
import { chat, listModels, type Fetch } from "../core/ai/ollama";
import type { ChatMessage } from "../core/ai/prompts";
import { isTauri } from "../platform";

let cached: Promise<Fetch> | null = null;

function http(): Promise<Fetch> {
  cached ??= isTauri()
    ? import("@tauri-apps/plugin-http").then((m) => m.fetch as Fetch)
    : Promise.resolve(((url, init) => globalThis.fetch(url, init)) as Fetch);
  return cached;
}

export const aiClient = {
  models: async (): Promise<string[]> => listModels(await http()),
  chat: async (opts: { model: string; messages: ChatMessage[]; onToken?: (t: string) => void; signal?: AbortSignal }) =>
    chat(await http(), opts),
};
