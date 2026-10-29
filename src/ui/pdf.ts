// pdf.js loader. Imported lazily so the library screen does not pay for it.
import type { PDFDocumentProxy } from "pdfjs-dist";

export type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

let lib: Promise<typeof import("pdfjs-dist")> | null = null;

export function pdfjs(): Promise<typeof import("pdfjs-dist")> {
  lib ??= Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]).then(([m, worker]) => {
    m.GlobalWorkerOptions.workerSrc = worker.default;
    return m;
  });
  return lib;
}

export async function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  return (await pdfjs()).getDocument({ data }).promise;
}
