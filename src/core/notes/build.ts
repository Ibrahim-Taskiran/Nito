// Builds the generated notes (live note per document, colour digest per course) as Markdown.
import { LABELS, labelInfo } from "../labels";
import type { Annotation, Document } from "../types";
import { groupByWeek } from "../week";
import { annotationLink, escapeMd } from "./markdown";

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** One highlight as a quote: text, then label/page link, then the comment. */
function quote(a: Annotation, withLabel: boolean): string {
  const ref = `[s. ${a.page}](${annotationLink(a.id)})`;
  const lines = [`> ${escapeMd(oneLine(a.text)) || "*(metinsiz vurgu)*"}`];
  lines.push(withLabel ? `> — **${labelInfo(a.label).name}** · ${ref}` : `> — ${ref}`);
  const c = oneLine(a.comment);
  if (c) lines.push(`> *Yorum:* ${escapeMd(c)}`);
  return lines.join("\n");
}

export const liveNoteTitle = (doc: Pick<Document, "title">): string => `Canlı not: ${doc.title}`;

export const digestTitle = (courseName: string): string => `Renk özeti: ${courseName}`;

/** Live note: the document's highlights grouped by page. */
export function liveNoteBody(doc: Pick<Document, "title">, annotations: Annotation[]): string {
  const parts = [`# ${escapeMd(doc.title)}`];
  if (!annotations.length) {
    parts.push("Bu belgede henüz vurgu yok. Okurken metin seçip bir etiket verince burada görünür.");
    return parts.join("\n\n") + "\n";
  }
  const byPage = new Map<number, Annotation[]>();
  for (const a of [...annotations].sort((x, y) => x.page - y.page || x.createdAt.localeCompare(y.createdAt))) {
    byPage.set(a.page, [...(byPage.get(a.page) ?? []), a]);
  }
  for (const [page, list] of byPage) {
    parts.push(`## Sayfa ${page}`);
    for (const a of list) parts.push(quote(a, true));
  }
  return parts.join("\n\n") + "\n";
}

export interface DigestDoc {
  doc: Pick<Document, "id" | "title" | "week">;
  annotations: Annotation[];
}

/** Colour digest: highlights of a course by label (fixed order), then week, then document. */
export function digestBody(courseName: string, docs: DigestDoc[]): string {
  const parts = [`# ${escapeMd(digestTitle(courseName))}`];
  let any = false;
  for (const l of LABELS) {
    const withLabel = docs
      .map((d) => ({ ...d.doc, items: d.annotations.filter((a) => a.label === l.key) }))
      .filter((d) => d.items.length);
    if (!withLabel.length) continue;
    any = true;
    const total = withLabel.reduce((s, d) => s + d.items.length, 0);
    parts.push(`## ${l.name} (${total})`);
    for (const g of groupByWeek(withLabel)) {
      parts.push(`### ${g.label}`);
      for (const d of g.items) {
        parts.push(`#### ${escapeMd(d.title)}`);
        for (const a of [...d.items].sort((x, y) => x.page - y.page)) parts.push(quote(a, false));
      }
    }
  }
  if (!any) parts.push("Bu dersin belgelerinde henüz vurgu yok.");
  return parts.join("\n\n") + "\n";
}

/** Safe file name for an exported note: "Canlı not: Hafta 2" -> "Canli-not-Hafta-2". */
export function exportFileName(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "not"}.md`;
}
