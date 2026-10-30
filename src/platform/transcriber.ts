// Speech-to-text port (whisper.cpp on desktop). The only place that decides where transcription exists.
import type { Platform } from "./types";

export type WhisperModel = "base" | "large-v3-turbo-q5_0" | "large-v3-turbo";

/** Setup choices; the list order is also the preference when several are installed (best last). */
export const WHISPER_MODELS: readonly { id: WhisperModel; name: string; size: string; ramGb: number }[] = [
  { id: "base", name: "Hızlı (daha çok hata)", size: "~150 MB", ramGb: 1 },
  { id: "large-v3-turbo-q5_0", name: "Doğru: büyük v3 turbo, sıkıştırılmış (önerilen)", size: "~550 MB", ramGb: 4 },
  { id: "large-v3-turbo", name: "En doğru: büyük v3 turbo, tam", size: "~1,6 GB", ramGb: 8 },
];

/** Best model this device runs comfortably; `ramGb` is unknown (null) on most browsers, then the recommended one. */
export function suggestWhisperModel(ramGb: number | null): WhisperModel {
  return ramGb != null && ramGb < 4 ? "base" : "large-v3-turbo-q5_0";
}

/** The best installed model, or null. */
export function bestWhisperModel(installed: readonly WhisperModel[]): WhisperModel | null {
  return [...WHISPER_MODELS].reverse().find((m) => installed.includes(m.id))?.id ?? null;
}

export interface WhisperStatus {
  installed: boolean;
  hasBinary: boolean;
  models: WhisperModel[];
}

export interface SetupProgress {
  stage: "binary" | "model";
  received: number;
  total: number;
}

export interface Transcriber {
  status(): Promise<WhisperStatus>;
  /** Downloads whisper.cpp and a model. Absent where setup is not possible (web). */
  setup?(model: WhisperModel, onProgress: (p: SetupProgress) => void): Promise<WhisperStatus>;
  /** Transcribes a 16 kHz mono WAV in app storage with an optional initial prompt; returns whisper's JSON (-oj). */
  transcribe(wavRel: string, model: WhisperModel, onProgress: (percent: number) => void, prompt?: string): Promise<string>;
}

/** Desktop Tauri only today; Phase 3 (mobile) turns this off here. */
export const canTranscribe = (p: Platform): boolean => !!p.transcriber;
export const canSetupWhisper = (p: Platform): boolean => p.name === "tauri" && !!p.transcriber?.setup;
