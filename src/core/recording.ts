// Recording timing: pure logic, independent of MediaRecorder.

/** 75 -> "01:15", 3725 -> "1:02:05" */
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Tracks recorded time, excluding pauses, because a paused MediaRecorder
 * writes nothing: an annotation made 10 s after resuming from a 1-minute
 * pause sits at (recorded-before-pause + 10 s) in the audio file.
 */
export class RecordingClock {
  private accumulatedMs = 0;
  private runningSince: number | null = null;
  private started = false;

  start(nowMs: number): void {
    this.accumulatedMs = 0;
    this.runningSince = nowMs;
    this.started = true;
  }

  pause(nowMs: number): void {
    if (this.runningSince === null) return;
    this.accumulatedMs += Math.max(0, nowMs - this.runningSince);
    this.runningSince = null;
  }

  resume(nowMs: number): void {
    if (!this.started || this.runningSince !== null) return;
    this.runningSince = nowMs;
  }

  get paused(): boolean {
    return this.started && this.runningSince === null;
  }

  elapsedMs(nowMs: number): number {
    const running = this.runningSince === null ? 0 : Math.max(0, nowMs - this.runningSince);
    return this.accumulatedMs + running;
  }

  /** Offset for a recording mark, rounded down so playback starts just before. */
  offsetSeconds(nowMs: number): number {
    return Math.floor(this.elapsedMs(nowMs) / 1000);
  }
}

/** Candidate containers: Opus/WebM (Chromium, WebView2, Android), AAC/MP4 (WKWebView). */
export const RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

export function pickRecordingMime(isTypeSupported: (t: string) => boolean): string {
  return RECORDING_MIME_CANDIDATES.find((t) => isTypeSupported(t)) ?? "";
}

export function extensionForMime(mime: string): string {
  if (mime.startsWith("audio/mp4")) return "m4a";
  if (mime.startsWith("audio/ogg")) return "ogg";
  return "webm";
}

/** 0..1 loudness from analyser time-domain bytes (128 = silence). */
export function levelFromSamples(samples: ArrayLike<number>): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = (samples[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 3);
}
