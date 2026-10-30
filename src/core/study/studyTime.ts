// Study time per document: stopwatch time is credited to the document open in the reader at that moment. Pure.
import type { Id } from "../types";

/** `since` marks the start of the span not credited yet; null while nothing counts. */
export interface StudyClock {
  docId: Id | null;
  since: number | null;
}

export interface Credit {
  docId: Id;
  ms: number;
}

export const idleClock = (): StudyClock => ({ docId: null, since: null });

/**
 * Closes the running span at `now` (credited to the document that was open) and starts a new one
 * when the stopwatch runs with a document open. Call it on every change and periodically to flush.
 */
export function advance(c: StudyClock, docId: Id | null, running: boolean, now: number): { clock: StudyClock; credit: Credit | null } {
  const ms = c.since === null || c.docId === null ? 0 : Math.max(0, now - c.since);
  return {
    clock: running && docId !== null ? { docId, since: now } : { docId, since: null },
    credit: ms > 0 && c.docId !== null ? { docId: c.docId, ms } : null,
  };
}

/** "1 sa 25 dk", "40 dk", "2 sa"; under a minute "1 dk'dan az", nothing "0 dk". */
export function formatStudyTime(ms: number): string {
  if (ms <= 0) return "0 dk";
  const min = Math.floor(ms / 60_000);
  if (min === 0) return "1 dk'dan az";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m} dk` : m === 0 ? `${h} sa` : `${h} sa ${m} dk`;
}
