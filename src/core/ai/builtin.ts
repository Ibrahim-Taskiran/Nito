// The built-in engine's model choices (files and checksums live in src-tauri/src/ai.rs). Pure.
export type BuiltinModel = "fast" | "quality";

export interface BuiltinModelInfo {
  id: BuiltinModel;
  name: string;
  detail: string;
  /** RAM the model runs well with. */
  ramGb: number;
}

/** Both Apache-2.0, so they may ship with a paid app. */
export const BUILTIN_MODELS: readonly BuiltinModelInfo[] = [
  { id: "fast", name: "Hızlı", detail: "Qwen3 4B Instruct · daha az bellek, daha hızlı yanıt", ramGb: 8 },
  { id: "quality", name: "Kaliteli", detail: "Qwen3 8B · daha iyi özet, daha yavaş", ramGb: 16 },
];

const GB = 1024 ** 3;

/** "Kaliteli" from 16 GB RAM up (and when RAM is unknown, the safe "Hızlı"). */
export const suggestModel = (ramBytes: number): BuiltinModel => (ramBytes >= 15 * GB ? "quality" : "fast");

/** 2497281120 -> "2,3 GB" */
export const formatGb = (bytes: number): string =>
  `${(bytes / GB).toLocaleString("tr-TR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} GB`;

export const modelName = (id: BuiltinModel): string => BUILTIN_MODELS.find((m) => m.id === id)?.name ?? id;
