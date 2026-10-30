// AI port: where the chat engines live. Desktop only; undefined on Android and iOS (no AI there).
import type { BuiltinModel } from "../core/ai/builtin";
import type { Endpoint, Fetch } from "../core/ai/engine";
import type { SetupProgress } from "./transcriber";

export interface AiModelState {
  id: BuiltinModel;
  sizeBytes: number;
  installed: boolean;
}

export interface AiStatus {
  /** False where no engine build exists for this OS. */
  supported: boolean;
  hasBinary: boolean;
  models: AiModelState[];
  running: BuiltinModel | null;
  /** 0 when unknown. */
  ramBytes: number;
  freeBytes: number;
}

/** llama.cpp's llama-server, downloaded and started by the app (src-tauri/src/ai.rs). */
export interface BuiltinEngine {
  status(): Promise<AiStatus>;
  setup(model: BuiltinModel, onProgress: (p: SetupProgress) => void): Promise<AiStatus>;
  cancelSetup(): Promise<void>;
  /** Starts (or reuses) the server for `model`. */
  start(model: BuiltinModel): Promise<Endpoint>;
  stop(): Promise<void>;
  remove(model: BuiltinModel): Promise<AiStatus>;
}

export interface AiHost {
  /** Fetch that may reach 127.0.0.1 / localhost (Tauri: http plugin). */
  fetch: Fetch;
  /** Absent where it cannot run (browser dev without the e2e fake). Ollama is then the only engine. */
  builtin?: BuiltinEngine;
}
