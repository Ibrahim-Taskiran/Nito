// Course pack: one zip with the course's PDFs, a notes file per document and a colour digest.
import { strToU8, zipSync, type Zippable } from "fflate";
import type { Annotation, Document } from "../types";
import { courseDigest, documentNotes } from "./markdown";

export interface PackDocument {
  doc: Pick<Document, "title">;
  anns: Annotation[];
  /** Original PDF bytes; null when the file is missing from storage. */
  pdf: Uint8Array | null;
}

/** File-system-safe name (Windows rules), never empty. */
export function safeName(s: string): string {
  const out = s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").replace(/^[\s.]+|[\s.]+$/g, "");
  return out.slice(0, 120) || "adsiz";
}

const TR: Record<string, string> = { ğ: "g", Ğ: "G", ü: "u", Ü: "U", ş: "s", Ş: "S", ı: "i", İ: "I", ö: "o", Ö: "O", ç: "c", Ç: "C" };

/** ASCII-only file name (Tauri passes the storage path in an HTTP header). */
export function asciiName(s: string): string {
  const out = safeName(s)
    .replace(/[ğĞüÜşŞıİöÖçÇ]/g, (c) => TR[c])
    .normalize("NFD").replace(/[^\x20-\x7e]/g, "")
    .replace(/\s+/g, " ").trim();
  return out || "paket";
}

function uniqueNamer() {
  const used = new Set<string>();
  return (base: string) => {
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i})`;
    used.add(name.toLowerCase());
    return name;
  };
}

/** Zip layout: <ders>/pdf/*.pdf, <ders>/notlar/*.md, <ders>/<ders> - renk özeti.md. */
export function buildCoursePack(courseName: string, docs: PackDocument[]): { zip: Uint8Array; missing: string[] } {
  const root = safeName(courseName);
  const name = uniqueNamer();
  const pdf: Zippable = {};
  const notes: Zippable = {};
  const missing: string[] = [];
  for (const d of docs) {
    const base = name(safeName(d.doc.title));
    notes[`${base}.md`] = strToU8(documentNotes(d.doc, d.anns));
    if (d.pdf) pdf[`${base}.pdf`] = [d.pdf, { level: 0 }]; // PDFs are already compressed
    else missing.push(d.doc.title);
  }
  const tree: Zippable = {
    [root]: {
      pdf,
      notlar: notes,
      [`${root} - renk özeti.md`]: strToU8(courseDigest(courseName, docs)),
    },
  };
  return { zip: zipSync(tree, { level: 6 }), missing };
}
