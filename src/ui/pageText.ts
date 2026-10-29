// PDF page text via pdf.js, cached per file hash so a course is extracted once per session.
import type { Document } from "../core/types";
import type { Platform } from "../platform/types";
import { openPdf } from "./pdf";

const cache = new Map<string, Promise<string[]>>();

async function extract(platform: Platform, doc: Document): Promise<string[]> {
  const pdf = await openPdf(await platform.storage.read(doc.filePath));
  try {
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      pages.push(content.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : "") : "")).join(" "));
    }
    return pages;
  } finally {
    await pdf.loadingTask.destroy();
  }
}

export function pageTexts(platform: Platform, doc: Document): Promise<string[]> {
  let p = cache.get(doc.fileHash);
  if (!p) {
    p = extract(platform, doc);
    // A failed read should be retried next time, not cached.
    p.catch(() => cache.delete(doc.fileHash));
    cache.set(doc.fileHash, p);
  }
  return p;
}
