// Speech-to-text port (whisper.cpp on desktop). The only place that decides where transcription exists.
import type { Platform } from "./types";

export type WhisperModel = "base" | "large-v3-turbo";

export const WHISPER_MODELS: readonly { id: WhisperModel; name: string; size: string }[] = [
  { id: "base", name: "Temel (hızlı)", size: "~150 MB" },
  { id: "large-v3-turbo", name: "Büyük v3 turbo (Türkçede daha iyi)", size: "~1,6 GB" },
];

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
  /** Transcribes a 16 kHz mono WAV in app storage; returns whisper's JSON (-oj). */
  transcribe(wavRel: string, model: WhisperModel, onProgress: (percent: number) => void): Promise<string>;
}

/** Desktop Tauri only today; Phase 3 (mobile) turns this off here. */
export const canTranscribe = (p: Platform): boolean => !!p.transcriber;
export const canSetupWhisper = (p: Platform): boolean => p.name === "tauri" && !!p.transcriber?.setup;
