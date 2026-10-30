// Pictures placed on PDF pages. The rect is normalised to the page (0..1) so zoom does not matter.

export interface ImageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageImage extends ImageRect {
  id: number;
  documentId: number;
  page: number;
  /** Relative to app storage, e.g. images/<sha256>.png */
  filePath: string;
}

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"] as const;

/** Lower-case extension of a picked file, or null when it is not a supported picture. */
export function imageExt(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext) ? ext : null;
}

export function imageMime(path: string): string {
  const ext = imageExt(path) ?? "png";
  return `image/${ext === "jpg" ? "jpeg" : ext}`;
}

const MIN_W = 0.04;

/** Centred rect that keeps the picture's aspect and fits inside `maxFrac` of the page each way. */
export function centeredRect(imgW: number, imgH: number, pageW: number, pageH: number, maxFrac = 0.5): ImageRect {
  const ratio = imgW > 0 && imgH > 0 ? imgH / imgW : 1;
  let w = maxFrac;
  let h = (w * pageW * ratio) / pageH;
  if (h > maxFrac) {
    h = maxFrac;
    w = (h * pageH) / (ratio * pageW);
  }
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Moves by (dx, dy) page fractions and keeps the picture on the page. */
export function moveRect(r: ImageRect, dx: number, dy: number): ImageRect {
  return { ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) };
}

/** Bottom-right corner drag by dx (page fraction); height follows so the aspect stays the same. */
export function resizeRect(r: ImageRect, dx: number): ImageRect {
  const maxW = Math.min(1 - r.x, ((1 - r.y) * r.w) / r.h);
  const w = clamp(r.w + dx, Math.min(MIN_W, maxW), maxW);
  return { ...r, w, h: (r.h * w) / r.w };
}
