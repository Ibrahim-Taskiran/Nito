// Web has no whisper. E2E tests set `window.__NITO_FAKE_WHISPER__` (a whisper -oj JSON string) before load.
import type { Transcriber } from "../transcriber";

declare global {
  interface Window {
    __NITO_FAKE_WHISPER__?: string;
    /** Last prompt the fake received, for E2E checks. */
    __NITO_WHISPER_PROMPT__?: string;
  }
}

export function webTranscriber(): Transcriber | undefined {
  const canned = globalThis.window?.__NITO_FAKE_WHISPER__;
  if (!canned) return undefined;
  return {
    status: async () => ({ installed: true, hasBinary: true, models: ["base"] }),
    async transcribe(_wav, _model, onProgress, prompt) {
      window.__NITO_WHISPER_PROMPT__ = prompt;
      for (const p of [25, 60, 100]) {
        await new Promise((r) => setTimeout(r, 150));
        onProgress(p);
      }
      return canned;
    },
  };
}
