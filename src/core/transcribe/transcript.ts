// whisper.cpp JSON (-oj) -> segments -> Markdown note with "## mm:ss" headings. Pure.
import { formatTimestamp } from "../recording";

export interface Segment {
  /** Seconds from the start of the recording. */
  start: number;
  end: number;
  text: string;
}

/** "00:01:02,500" -> 62.5 */
export function parseClock(t: string): number {
  const m = /^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/.exec(t.trim());
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, "0")) / 1000 : NaN;
}

// Non-speech markers whisper writes on silence or music.
const MARKER = /^[[(].*[\])]$|^\*.*\*$/;

/** Reads whisper's `transcription` array. Skips empty text and markers like "[BLANK_AUDIO]". */
export function parseWhisperJson(json: string | unknown): Segment[] {
  const v = typeof json === "string" ? JSON.parse(json) : json;
  const list: unknown[] = Array.isArray(v?.transcription) ? v.transcription : [];
  const out: Segment[] = [];
  for (const raw of list) {
    const r = raw as { offsets?: { from?: number; to?: number }; timestamps?: { from?: string; to?: string }; text?: unknown };
    const text = typeof r.text === "string" ? r.text.trim() : "";
    if (!text || MARKER.test(text)) continue;
    const start = typeof r.offsets?.from === "number" ? r.offsets.from / 1000 : parseClock(r.timestamps?.from ?? "");
    const end = typeof r.offsets?.to === "number" ? r.offsets.to / 1000 : parseClock(r.timestamps?.to ?? "");
    if (!Number.isFinite(start)) continue;
    out.push({ start, end: Number.isFinite(end) ? end : start, text });
  }
  return out;
}

// Short lines whisper invents on silence or music, learnt from subtitled videos (matched in lower case).
const HALLUCINATIONS = [
  /altyaz[ıi]/iu,
  /izledi[ğg]iniz i[çc]in te[şs]ekk[üu]r/iu,
  /abone ol/iu,
  /bir sonraki videoda/iu,
  /videoyu be[ğg]en/iu,
  /amara\.org/iu,
  /^(?:www\.|https?:\/\/)\S+$/iu,
];

const plain = (t: string) => t.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The same phrase said 4+ times in a row (a decoding loop) is kept once. */
export function collapseRepeats(text: string): string {
  return text.replace(/(\S.{1,58}?)(?:[\s,]+\1){3,}/gu, "$1");
}

/**
 * Removes whisper's invented lines: known subtitle credits, the prompt read back, and a segment that repeats
 * the one before it; collapses repetition loops inside a segment.
 */
export function dropHallucinations(segments: readonly Segment[], prompt = ""): Segment[] {
  const out: Segment[] = [];
  const promptText = plain(prompt);
  let last = "";
  for (const s of segments) {
    const text = collapseRepeats(s.text).trim();
    const key = plain(text);
    if (!key || key === last || (text.length <= 80 && HALLUCINATIONS.some((re) => re.test(text.toLocaleLowerCase("tr"))))) continue;
    if (promptText && key.length > 12 && promptText.includes(key)) continue;
    last = key;
    out.push({ ...s, text });
  }
  return out;
}

export interface Paragraph {
  start: number;
  text: string;
}

/**
 * Groups segments into paragraphs of about `minSeconds`..`maxSeconds`:
 * after `minSeconds` a paragraph ends at the next sentence end; it never grows past `maxSeconds`.
 */
export function groupParagraphs(segments: readonly Segment[], minSeconds = 30, maxSeconds = 60): Paragraph[] {
  const out: Paragraph[] = [];
  let cur: { start: number; parts: string[] } | null = null;
  for (const s of segments) {
    if (cur && s.end - cur.start > maxSeconds) {
      out.push({ start: cur.start, text: cur.parts.join(" ") });
      cur = null;
    }
    cur ??= { start: s.start, parts: [] };
    cur.parts.push(s.text);
    if (s.end - cur.start >= minSeconds && /[.!?…]["')»]?$/.test(s.text)) {
      out.push({ start: cur.start, text: cur.parts.join(" ") });
      cur = null;
    }
  }
  if (cur) out.push({ start: cur.start, text: cur.parts.join(" ") });
  return out;
}

/** Note body: one "## mm:ss" heading per paragraph. */
export function transcriptMarkdown(segments: readonly Segment[]): string {
  const paras = groupParagraphs(segments);
  if (!paras.length) return "_Kayıtta konuşma bulunamadı._\n";
  return paras.map((p) => `## ${formatTimestamp(p.start)}\n\n${p.text}\n`).join("\n");
}

/** "01:15" -> 75, "1:02:05" -> 3725; NaN when not a timestamp. */
export function parseTimestamp(t: string): number {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(t.trim());
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
}

/** Reads a transcript note body back into paragraphs (for the in-reader preview). */
export function transcriptParagraphs(md: string): Paragraph[] {
  const out: Paragraph[] = [];
  for (const block of md.split(/^## /m).slice(1)) {
    const nl = block.indexOf("\n");
    const start = parseTimestamp(nl < 0 ? block : block.slice(0, nl));
    const text = nl < 0 ? "" : block.slice(nl + 1).trim();
    if (Number.isFinite(start) && text) out.push({ start, text });
  }
  return out;
}

/** "Ders kaydı 29.10.2026 14:05 — yazıya döküm" */
export function transcriptTitle(startedAt: string): string {
  const d = new Date(startedAt);
  const when = Number.isNaN(d.getTime())
    ? startedAt
    : `${d.toLocaleDateString("tr-TR")} ${d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
  return `Ders kaydı ${when} — yazıya döküm`;
}
