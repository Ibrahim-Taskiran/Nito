// Builds a new PDF from chosen pages of a document (e.g. the "Önemli" pages) with pdf-lib (MIT).
// Highlights, handwriting and pictures are burned in; an added margin grows the page. Pure: bytes in, bytes out.
import { BlendMode, LineCapStyle, PDFDocument, rgb, type PDFPage } from "pdf-lib";
import { INK_KINDS, strokePath, strokeWidth, type InkStroke } from "./ink";
import type { Rect } from "./types";

export interface ExportImage {
  bytes: Uint8Array;
  /** "png" or "jpg"; other formats are left out (pdf-lib embeds only these). */
  type: "png" | "jpg";
  rect: Rect;
}

export interface ExportPage {
  /** 1-based page of the source PDF, or null for a blank page of size w x h (PDF points). */
  pdf: number | null;
  w: number;
  h: number;
  /** Added writable area as fractions of the page (right, bottom). */
  margin?: { right: number; bottom: number };
  highlights?: { rects: Rect[]; color: string }[];
  ink?: Pick<InkStroke, "points" | "color" | "width" | "kind">[];
  images?: ExportImage[];
}

const HIGHLIGHT_OPACITY = 0.35;

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? Number.parseInt(m[1], 16) : 0;
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

const color = (hex: string) => {
  const c = hexToRgb(hex);
  return rgb(c.r, c.g, c.b);
};

/** Draws the overlays of one page. (x0, top) is the top-left corner of the original page area, W x H its size. */
async function drawOverlays(out: PDFDocument, page: PDFPage, p: ExportPage, x0: number, top: number, W: number, H: number) {
  for (const img of p.images ?? []) {
    try {
      const embedded = img.type === "png" ? await out.embedPng(img.bytes) : await out.embedJpg(img.bytes);
      const r = img.rect;
      page.drawImage(embedded, { x: x0 + r.x * W, y: top - (r.y + r.h) * H, width: r.w * W, height: r.h * H });
    } catch {
      /* a broken picture is left out, the page is still exported */
    }
  }
  for (const h of p.highlights ?? []) {
    for (const r of h.rects) {
      page.drawRectangle({
        x: x0 + r.x * W, y: top - (r.y + r.h) * H, width: r.w * W, height: r.h * H,
        color: color(h.color), opacity: HIGHLIGHT_OPACITY, blendMode: BlendMode.Multiply,
      });
    }
  }
  for (const s of p.ink ?? []) {
    if (!s.points.length) continue;
    // strokePath is in page units with y down; drawSvgPath flips y around (x, y).
    page.drawSvgPath(strokePath(s.points, W, H), {
      x: x0, y: top, borderColor: color(s.color), borderWidth: strokeWidth(s, W), borderOpacity: INK_KINDS[s.kind].opacity,
      borderLineCap: s.kind === "highlighter" ? LineCapStyle.Butt : LineCapStyle.Round,
      blendMode: s.kind === "highlighter" ? BlendMode.Multiply : undefined,
    });
  }
}

/** A new PDF with `pages` in order. Source pages are copied as they are (text stays selectable). */
export async function buildPdf(source: Uint8Array | null, pages: readonly ExportPage[], title = ""): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  if (title) out.setTitle(title);
  out.setProducer("Nito");
  const src = source && pages.some((p) => p.pdf != null) ? await PDFDocument.load(source, { ignoreEncryption: true }) : null;
  const wanted = [...new Set(pages.flatMap((p) => (p.pdf != null ? [p.pdf - 1] : [])))].filter((i) => src && i >= 0 && i < src.getPageCount());
  const copied = new Map<number, PDFPage>();
  if (src && wanted.length) {
    const list = await out.copyPages(src, wanted);
    wanted.forEach((i, k) => copied.set(i, list[k]));
  }
  const used = new Set<number>();
  for (const p of pages) {
    const right = Math.max(0, p.margin?.right ?? 0);
    const bottom = Math.max(0, p.margin?.bottom ?? 0);
    if (p.pdf == null) {
      const W = p.w;
      const H = p.h;
      const page = out.addPage([W * (1 + right), H * (1 + bottom)]);
      await drawOverlays(out, page, p, 0, H * (1 + bottom), W, H);
      continue;
    }
    const idx = p.pdf - 1;
    let page = copied.get(idx);
    if (!page) continue; // page number past the end of the PDF
    if (used.has(idx)) page = (await out.copyPages(src!, [idx]))[0]; // the same page twice
    used.add(idx);
    out.addPage(page);
    const box = page.getCropBox();
    const rotated = page.getRotation().angle % 360 !== 0;
    if (rotated) continue; // overlays are placed on the unrotated box; keep the original page only
    if (right || bottom) {
      const nb = { x: box.x, y: box.y - box.height * bottom, width: box.width * (1 + right), height: box.height * (1 + bottom) };
      page.setMediaBox(nb.x, nb.y, nb.width, nb.height);
      page.setCropBox(nb.x, nb.y, nb.width, nb.height);
    }
    await drawOverlays(out, page, p, box.x, box.y + box.height, box.width, box.height);
  }
  return out.save();
}

/** File name for an export: "<title> - onemli.pdf" with plain ASCII. */
export function pdfFileName(title: string, suffix: string): string {
  const plain = (s: string) =>
    s.normalize("NFKD").replace(/ı/g, "i").replace(/İ/g, "I").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const base = plain(title).slice(0, 70) || "belge";
  return `${base}-${plain(suffix) || "sayfalar"}.pdf`;
}
