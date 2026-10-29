// whisper.cpp through Rust commands (src-tauri/src/transcribe.rs).
import { Channel, invoke } from "@tauri-apps/api/core";
import type { SetupProgress, Transcriber, WhisperStatus } from "../transcriber";

export const tauriTranscriber: Transcriber = {
  status: () => invoke<WhisperStatus>("whisper_status"),
  setup(model, onProgress) {
    const ch = new Channel<SetupProgress>();
    ch.onmessage = onProgress;
    return invoke<WhisperStatus>("whisper_setup", { model, onProgress: ch });
  },
  transcribe(wavRel, model, onProgress) {
    const ch = new Channel<number>();
    ch.onmessage = onProgress;
    return invoke<string>("whisper_transcribe", { wavRel, model, onProgress: ch });
  },
};
