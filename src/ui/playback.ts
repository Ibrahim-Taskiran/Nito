// Playback speed shared by recording players, remembered per device.
export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
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
