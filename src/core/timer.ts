// Study stopwatch and countdown alarm. Pure: the caller passes the current time in ms.

/** "mm:ss", or "h:mm:ss" from one hour. Negative values count as zero. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Elapsed time kept as stored time plus the running span, so pausing never drifts. */
export interface Stopwatch {
  storedMs: number;
  startedAt: number | null;
}

export const newStopwatch = (): Stopwatch => ({ storedMs: 0, startedAt: null });

export const elapsed = (w: Stopwatch, now: number): number => w.storedMs + (w.startedAt === null ? 0 : now - w.startedAt);

export const startWatch = (w: Stopwatch, now: number): Stopwatch => (w.startedAt === null ? { ...w, startedAt: now } : w);

export const pauseWatch = (w: Stopwatch, now: number): Stopwatch =>
  w.startedAt === null ? w : { storedMs: elapsed(w, now), startedAt: null };

/** Countdown: ends at a fixed moment; paused keeps the time left. */
export interface Countdown {
  durationMs: number;
  endsAt: number | null;
  leftMs: number;
}

export const newCountdown = (minutes: number): Countdown => {
  const ms = Math.round(minutes * 60_000);
  return { durationMs: ms, endsAt: null, leftMs: ms };
};

export const remaining = (c: Countdown, now: number): number => Math.max(0, c.endsAt === null ? c.leftMs : c.endsAt - now);

export const startCountdown = (c: Countdown, now: number): Countdown =>
  c.endsAt === null && c.leftMs > 0 ? { ...c, endsAt: now + c.leftMs } : c;

export const pauseCountdown = (c: Countdown, now: number): Countdown =>
  c.endsAt === null ? c : { ...c, endsAt: null, leftMs: remaining(c, now) };

export const isDone = (c: Countdown, now: number): boolean => c.endsAt !== null && now >= c.endsAt;

/** Minutes typed by the user: 1–600, whole or decimal with a comma or a dot; null when invalid. */
export function parseMinutes(input: string): number | null {
  const n = Number(input.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 && n <= 600 ? n : null;
}
