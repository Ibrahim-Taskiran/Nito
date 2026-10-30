// Browser dev: Ollama through plain fetch. E2E tests set `window.__NITO_FAKE_AI__` before load to get a
// fake built-in engine whose server lives at `url` (mocked by the test, or a real llama-server).
import type { BuiltinModel } from "../../core/ai/builtin";
import type { AiHost, AiStatus } from "../ai";

declare global {
  interface Window {
    __NITO_FAKE_AI__?: { url?: string; key?: string; installed?: BuiltinModel[]; ramGb?: number; freeGb?: number; failStart?: boolean };
  }
}

const SIZES: Record<BuiltinModel, number> = { fast: 2_497_281_120, quality: 5_027_783_488 };
const GB = 1024 ** 3;

export function webAi(): AiHost {
  const host: AiHost = { fetch: (url, init) => globalThis.fetch(url, init) };
  const cfg = globalThis.window?.__NITO_FAKE_AI__;
  if (!cfg) return host;
  const installed = new Set<BuiltinModel>(cfg.installed ?? []);
  let running: BuiltinModel | null = null;
  let cancelled = false;
  const status = async (): Promise<AiStatus> => ({
    supported: true,
    hasBinary: installed.size > 0,
    models: (["fast", "quality"] as const).map((id) => ({ id, sizeBytes: SIZES[id], installed: installed.has(id) })),
    running,
    ramBytes: (cfg.ramGb ?? 16) * GB,
    freeBytes: (cfg.freeGb ?? 100) * GB,
  });
  host.builtin = {
    status,
    async setup(model, onProgress) {
      cancelled = false;
      const total = SIZES[model];
      if ((cfg.freeGb ?? 100) * GB < total) throw new Error("Yeterli disk alanı yok.");
      for (let i = 0; i <= 10; i++) {
        if (cancelled) throw new Error("İndirme iptal edildi.");
        onProgress({ stage: i < 2 ? "binary" : "model", received: (total * i) / 10, total });
        await new Promise((r) => setTimeout(r, 120));
      }
      installed.add(model);
      return status();
    },
    cancelSetup: async () => void (cancelled = true),
    async start(model) {
      if (cfg.failStart) throw new Error("Yapay zekâ motoru başlatılamadı.");
      running = model;
      return { url: cfg.url ?? "http://127.0.0.1:18080", key: cfg.key ?? "test-key" };
    },
    stop: async () => void (running = null),
    async remove(model) {
      installed.delete(model);
      if (running === model) running = null;
      return status();
    },
  };
  return host;
}
