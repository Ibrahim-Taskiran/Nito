// Saves stopwatch time to the document open in the reader; accounting rules are in core/study/studyTime.
import { untrack } from "svelte";
import { isoDay } from "../core/study/cards";
import { StudyRepo } from "../core/study/studyRepo";
import { advance, idleClock, type Credit } from "../core/study/studyTime";
import type { Id } from "../core/types";
import type { Library } from "./library.svelte";
import { studyTimer } from "./timer.svelte";

/** A crash loses at most this much study time. */
const FLUSH_MS = 30_000;

/** Starts tracking for the app lifetime; returns a stop function that saves the last span. */
export function trackStudyTime(lib: Library): () => void {
  const repo = new StudyRepo(lib.platform.db);
  let clock = idleClock();
  let writes = Promise.resolve();
  const save = (c: Credit) => {
    writes = writes.then(() => repo.addStudyTime(c.docId, c.ms, isoDay(new Date()))).catch((e) => console.error(e));
  };
  const step = (docId: Id | null, running: boolean) => {
    const r = advance(clock, docId, running, Date.now());
    clock = r.clock;
    if (r.credit) save(r.credit);
  };
  const flush = () => step(clock.docId, studyTimer.watchRunning);
  const onHide = () => document.visibilityState === "hidden" && flush();

  const stopEffect = $effect.root(() => {
    $effect(() => {
      const docId = lib.split ? null : (lib.opened?.id ?? null);
      const running = studyTimer.watchRunning;
      untrack(() => step(docId, running));
    });
  });
  const timer = setInterval(flush, FLUSH_MS);
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", flush);
  return () => {
    step(null, false);
    stopEffect();
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", flush);
  };
}
