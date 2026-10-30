// Lecture audio tools, pure: page timeline of a recording, note replay, silence spans, transcript ↔ page, spoken cues.
import { fold } from "./search";
import type { Paragraph } from "./transcribe/transcript";

/** A page that came into view at `offsetSeconds` of a recording. */
export interface PageVisit {
  page: number;
  offsetSeconds: number;
}

export interface PageSegment {
  page: number;
  start: number;
  end: number;
}

export interface Span {
  start: number;
  end: number;
}

/** Visits sorted by time, with repeats of the same page merged. */
export function normaliseVisits(visits: readonly PageVisit[]): PageVisit[] {
  const out: PageVisit[] = [];
  for (const v of [...visits].sort((a, b) => a.offsetSeconds - b.offsetSeconds)) {
    if (out.at(-1)?.page !== v.page) out.push(v);
  }
  return out;
}

/**
 * Timeline segments from the visits. A page shown for less than `minSeconds` (scrolling past it) is dropped
 * and the time goes to the page before; neighbours that end up equal are merged.
 */
export function pageSegments(visits: readonly PageVisit[], duration: number, minSeconds = 1.5): PageSegment[] {
  const v = normaliseVisits(visits);
  if (!v.length) return [];
  const raw = v.map((x, i) => ({ page: x.page, start: x.offsetSeconds, end: i + 1 < v.length ? v[i + 1].offsetSeconds : Math.max(duration, x.offsetSeconds) }));
  const long = raw.filter((s) => s.end - s.start >= minSeconds);
  const kept = long.length ? long : raw;
  kept[0].start = raw[0].start;
  kept.forEach((s, i) => (s.end = i + 1 < kept.length ? kept[i + 1].start : raw[raw.length - 1].end));
  const out: PageSegment[] = [];
  for (const s of kept) {
    const last = out.at(-1);
    if (last?.page === s.page) last.end = s.end;
    else out.push({ ...s });
  }
  return out;
}

/** When `page` was first explained: the start of its first segment, or null. */
export function firstOffsetForPage(segments: readonly PageSegment[], page: number): number | null {
  return segments.find((s) => s.page === page)?.start ?? null;
}

/** The page on screen at `t` seconds, or null before the first visit. */
export function pageAt(segments: readonly PageSegment[], t: number): number | null {
  let page: number | null = null;
  for (const s of segments) {
    if (s.start <= t) page = s.page;
    else break;
  }
  return page;
}

/** Pages shown during [start, end), in order. */
export function pagesBetween(segments: readonly PageSegment[], start: number, end: number): number[] {
  const out: number[] = [];
  for (const s of segments) {
    if (s.end > start && s.start < end && !out.includes(s.page)) out.push(s.page);
  }
  const first = pageAt(segments, start);
  if (!out.length && first !== null) out.push(first);
  return out;
}

/**
 * Note replay: a note made during the playing recording stays hidden until playback passes its offset.
 * Notes from other recordings, or made without one, are always shown.
 */
export function hiddenDuringReplay(mark: { recordingId: number; offsetSeconds: number } | undefined, playingRecordingId: number | null, position: number): boolean {
  return !!mark && playingRecordingId !== null && mark.recordingId === playingRecordingId && mark.offsetSeconds > position;
}

/** RMS loudness per `stepSeconds` frame of mono samples. */
export function rmsFrames(samples: ArrayLike<number>, sampleRate: number, stepSeconds = 0.1): number[] {
  const size = Math.max(1, Math.round(sampleRate * stepSeconds));
  const out: number[] = [];
  for (let at = 0; at < samples.length; at += size) {
    const end = Math.min(samples.length, at + size);
    let sum = 0;
    for (let i = at; i < end; i++) sum += samples[i] * samples[i];
    out.push(Math.sqrt(sum / (end - at)));
  }
  return out;
}

function percentile(values: readonly number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
}

/**
 * Silent spans longer than `minSeconds`. The threshold adapts to the recording: a little above the
 * noise floor (10th percentile) relative to speech (90th percentile), never below `floor`.
 */
export function findSilences(rms: readonly number[], stepSeconds = 0.1, minSeconds = 1.5, floor = 0.003): Span[] {
  if (!rms.length) return [];
  const quiet = percentile(rms, 0.1);
  const loud = percentile(rms, 0.9);
  if (loud <= floor) return [];
  const threshold = Math.max(floor, quiet + (loud - quiet) * 0.12);
  const out: Span[] = [];
  let from = -1;
  for (let i = 0; i <= rms.length; i++) {
    const silent = i < rms.length && rms[i] < threshold;
    if (silent && from < 0) from = i;
    else if (!silent && from >= 0) {
      if ((i - from) * stepSeconds >= minSeconds) out.push({ start: round1(from * stepSeconds), end: round1(i * stepSeconds) });
      from = -1;
    }
  }
  return out;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Where to jump when silence skip is on: inside a silent span (past a short lead-in) go to just before its end.
 * `pad` keeps a breath at both ends so speech is never clipped. Null when no jump is needed.
 */
export function skipTarget(silences: readonly Span[], t: number, pad = 0.3): number | null {
  for (const s of silences) {
    if (t >= s.start + pad && t < s.end - pad) return s.end - pad;
  }
  return null;
}

/** Seconds saved by skipping every span (with the same padding as skipTarget). */
export function skippedSeconds(silences: readonly Span[], pad = 0.3): number {
  return silences.reduce((sum, s) => sum + Math.max(0, s.end - s.start - 2 * pad), 0);
}

export interface PagedParagraph extends Paragraph {
  end: number;
  /** Pages shown while the paragraph was spoken; the first is where it starts. */
  pages: number[];
}

/** Links transcript paragraphs to the pages on screen while each was spoken. */
export function paragraphPages(paragraphs: readonly Paragraph[], segments: readonly PageSegment[], duration: number): PagedParagraph[] {
  return paragraphs.map((p, i) => {
    const end = i + 1 < paragraphs.length ? paragraphs[i + 1].start : Math.max(duration, p.start + 1);
    return { ...p, end, pages: pagesBetween(segments, p.start, end) };
  });
}

/** Turkish cue phrases a lecturer uses for exam material. Written plain; matching is Turkish-folded. */
export const CUE_PHRASES = [
  "sınavda çıkar", "sınavda çıkabilir", "sınavda sorarım", "sınavda soracağım", "sınavda sorulur", "sınava girer", "sınavda gelir",
  "çok önemli", "önemli", "dikkat edin", "dikkat", "unutmayın", "bunu bilin", "bunu bilmeniz", "bilmeniz gerek",
  "altını çizin", "not alın", "mutlaka", "kesin çıkar",
] as const;

export interface Cue {
  /** The phrase as found in the transcript. */
  phrase: string;
  /** Seconds in the recording (estimated within the paragraph). */
  at: number;
  /** Text around the phrase. */
  snippet: string;
}

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

/**
 * Finds cue phrases in transcript paragraphs. The moment is estimated from the phrase's position in the
 * paragraph. Longer phrases win over the shorter ones they contain ("çok önemli" over "önemli").
 */
export function findCues(paragraphs: readonly PagedParagraph[] | readonly (Paragraph & { end?: number })[], phrases: readonly string[] = CUE_PHRASES): Cue[] {
  const keys = [...new Set(phrases.map((p) => fold(p)))].sort((a, b) => b.length - a.length);
  const out: (Cue & { order: number })[] = [];
  paragraphs.forEach((p, i) => {
    const text = p.text;
    const folded = fold(text);
    const end = p.end ?? (i + 1 < paragraphs.length ? paragraphs[i + 1].start : p.start + 30);
    const taken: Span[] = [];
    for (const k of keys) {
      for (let at = folded.indexOf(k); at >= 0; at = folded.indexOf(k, at + k.length)) {
        // Suffixes are fine ("önemlidir"), a word before is not, and neither is a negation ("dikkatsiz").
        if (isWordChar(folded[at - 1]) || /^s[iu]z/.test(folded.slice(at + k.length))) continue;
        if (taken.some((s) => at < s.end && at + k.length > s.start)) continue;
        taken.push({ start: at, end: at + k.length });
        const t = p.start + ((end - p.start) * at) / Math.max(1, text.length);
        out.push({ phrase: text.slice(at, at + k.length), at: Math.floor(t), snippet: snippetAround(text, at, k.length), order: i * 1e6 + at });
      }
    }
  });
  return out.sort((a, b) => a.order - b.order).map(({ order: _, ...c }) => c);
}

function snippetAround(text: string, at: number, len: number, radius = 60): string {
  // Cut at word edges so the snippet never starts or ends mid-word.
  let from = Math.max(0, at - radius);
  if (from > 0) from = Math.min(at, text.indexOf(" ", from) + 1 || at);
  let to = Math.min(text.length, at + len + radius);
  if (to < text.length) to = Math.max(at + len, text.lastIndexOf(" ", to));
  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`;
}
