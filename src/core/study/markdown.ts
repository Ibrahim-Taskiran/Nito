// Markdown builders for study notes: Cornell template, per-document notes, course colour digest.
import { LABELS } from "../labels";
import type { Annotation, Document } from "../types";
import { cardFace, definitionTerm } from "./cards";

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const cell = (s: string) => oneLine(s).replace(/\|/g, "\\|");

const byPage = (a: Annotation, b: Annotation) => a.page - b.page || a.createdAt.localeCompare(b.createdAt);

function groupPages(anns: Annotation[]): Map<number, Annotation[]> {
  const out = new Map<number, Annotation[]>();
  for (const a of [...anns].sort(byPage)) out.set(a.page, [...(out.get(a.page) ?? []), a]);
  return out;
}

/** Cue for the left column: questions and definition terms. */
function cue(a: Annotation): string | null {
  if (a.label === "question") return `Soru: ${oneLine(a.text)}`;
  if (a.label === "definition") return definitionTerm(a.text) ?? cardFace(a)?.front ?? null;
  return null;
}

export const SUMMARY_PLACEHOLDER = "_Bu sayfaların ana fikrini 3-5 cümleyle kendi sözlerinle yaz._";

export function cornellTitle(doc: Pick<Document, "title">): string {
  return `Cornell: ${doc.title}`;
}

/** Cornell layout as a Markdown table (cues | notes by page) plus a summary section. */
export function cornellNote(doc: Pick<Document, "title">, anns: Annotation[]): string {
  const lines = [`# ${cornellTitle(doc)}`, "", "| İpuçları | Notlar |", "| --- | --- |"];
  const pages = groupPages(anns);
  if (!pages.size) lines.push("| _Soru ve tanım ekle_ | _Bu belgede henüz vurgu yok._ |");
  for (const [page, list] of pages) {
    const cues = list.map(cue).filter((c): c is string => !!c).map(cell);
    const notes = list.map((a) => {
      const label = LABELS.find((l) => l.key === a.label)?.name ?? a.label;
      const comment = a.comment.trim() ? ` _(${cell(a.comment)})_` : "";
      return `**${label}:** ${cell(a.text)}${comment}`;
    });
    lines.push(`| ${cues.join("<br>")} | **s. ${page}**<br>${notes.join("<br>")} |`);
  }
  lines.push("", "## Özet", "", SUMMARY_PLACEHOLDER, "");
  return lines.join("\n");
}

function bullet(a: Annotation, prefix = ""): string {
  const comment = a.comment.trim() ? `\n  - _${oneLine(a.comment)}_` : "";
  return `- ${prefix}s. ${a.page}: ${oneLine(a.text) || "(metinsiz vurgu)"}${comment}`;
}

/** Highlights of one document grouped by colour label, with page numbers and comments. */
export function documentNotes(doc: Pick<Document, "title">, anns: Annotation[]): string {
  const lines = [`# ${doc.title}`, ""];
  if (!anns.length) lines.push("_Vurgu yok._", "");
  for (const l of LABELS) {
    const list = anns.filter((a) => a.label === l.key).sort(byPage);
    if (!list.length) continue;
    lines.push(`## ${l.name}`, "", ...list.map((a) => bullet(a)), "");
  }
  return lines.join("\n");
}

/** One course, all documents: highlights per colour label. */
export function courseDigest(courseName: string, docs: { doc: Pick<Document, "title">; anns: Annotation[] }[]): string {
  const lines = [`# ${courseName} — renk özeti`, ""];
  let any = false;
  for (const l of LABELS) {
    const rows = docs.flatMap(({ doc, anns }) => anns.filter((a) => a.label === l.key).sort(byPage).map((a) => bullet(a, `${doc.title}, `)));
    if (!rows.length) continue;
    any = true;
    lines.push(`## ${l.name} (${rows.length})`, "", ...rows, "");
  }
  if (!any) lines.push("_Bu derste henüz vurgu yok._", "");
  return lines.join("\n");
}
