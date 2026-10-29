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

/** "Ders kaydı 29.10.2026 14:05 — yazıya döküm" */
export function transcriptTitle(startedAt: string): string {
  const d = new Date(startedAt);
  const when = Number.isNaN(d.getTime())
    ? startedAt
    : `${d.toLocaleDateString("tr-TR")} ${d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
  return `Ders kaydı ${when} — yazıya döküm`;
}
