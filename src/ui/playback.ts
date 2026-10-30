// Playback speed and audio switches shared by recording players, remembered per device.
export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5] as const;
const KEY = "nito.playbackRate";

export function loadRate(): number {
  try {
    const r = Number(localStorage.getItem(KEY));
    return (RATES as readonly number[]).includes(r) ? r : 1;
  } catch {
    return 1;
  }
}

export function saveRate(r: number): void {
  try {
    localStorage.setItem(KEY, String(r));
  } catch {
    /* storage blocked: keep the speed for this session only */
  }
}

/** On/off audio switches. `mic` (noise and echo cancelling while recording) is on unless turned off. */
export type AudioPref = "mic" | "skipSilence" | "replayNotes" | "denoise";
const DEFAULTS: Record<AudioPref, boolean> = { mic: true, skipSilence: false, replayNotes: false, denoise: false };

export function loadPref(p: AudioPref): boolean {
  try {
    const v = localStorage.getItem(`nito.audio.${p}`);
    return v === null ? DEFAULTS[p] : v === "1";
  } catch {
    return DEFAULTS[p];
  }
}

export function savePref(p: AudioPref, on: boolean): void {
  try {
    localStorage.setItem(`nito.audio.${p}`, on ? "1" : "0");
  } catch {
    /* storage blocked */
  }
}
