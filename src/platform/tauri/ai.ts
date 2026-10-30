// Built-in AI engine through Rust commands (src-tauri/src/ai.rs).
import { Channel, invoke } from "@tauri-apps/api/core";
import type { Endpoint, Fetch } from "../../core/ai/engine";
import type { AiHost, AiStatus } from "../ai";
import type { SetupProgress } from "../transcriber";

/** The http plugin is scoped to 127.0.0.1 / localhost, so neither CORS nor other hosts get in. */
const fetch: Fetch = async (url, init) => (await import("@tauri-apps/plugin-http")).fetch(url, init);

export const tauriAi: AiHost = {
  fetch,
  builtin: {
    status: () => invoke<AiStatus>("ai_status"),
    setup(model, onProgress) {
      const ch = new Channel<SetupProgress>();
      ch.onmessage = onProgress;
      return invoke<AiStatus>("ai_setup", { model, onProgress: ch });
    },
    cancelSetup: () => invoke("ai_cancel_setup"),
    start: (model) => invoke<Endpoint>("ai_start", { model }),
    stop: () => invoke("ai_stop"),
    remove: (model) => invoke<AiStatus>("ai_delete", { model }),
  },
};
