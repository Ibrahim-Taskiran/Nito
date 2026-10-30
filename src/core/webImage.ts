// Pictures that come from outside: pasted, dropped from a web browser, or fetched from a link.
// The bytes decide the type (not the name or the server's header), so only real PNG/JPEG/GIF/WEBP get in.

/** Largest picture we take (bytes). Bigger ones are almost always photos meant for printing. */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export type ImageType = "png" | "jpg" | "gif" | "webp";

/** Image type from the first bytes, or null when it is not a supported picture. */
export function sniffImage(b: Uint8Array): ImageType | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "gif";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "webp";
  return null;
}

/** True when a Content-Type header says picture (or says nothing useful); the bytes are checked anyway. */
export function isImageContentType(ct: string | null): boolean {
  if (!ct) return true;
  const t = ct.split(";")[0].trim().toLowerCase();
  return t.startsWith("image/") || t === "application/octet-stream" || t === "binary/octet-stream";
}

/** Checks bytes from outside; returns the type or throws a message for the user. */
export function checkImageBytes(b: Uint8Array): ImageType {
  if (b.length > MAX_IMAGE_BYTES) throw new Error(`Resim çok büyük (en çok ${MAX_IMAGE_BYTES / 1024 / 1024} MB).`);
  const t = sniffImage(b);
  if (!t) throw new Error("Bu bir resim değil ya da desteklenmiyor (PNG, JPG, WEBP, GIF).");
  return t;
}

/** A web link we may fetch: http(s) only, no user:password part. Null when the text is not one. */
export function parseImageUrl(text: string): string | null {
  const s = text.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Bytes of a base64 `data:image/...` URL, or null. */
export function decodeDataUrl(url: string): Uint8Array | null {
  const m = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i.exec(url.trim());
  if (!m) return null;
  const bin = atob(m[1].replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Where a picture dragged out of a web page points: the `<img src>` in the dropped HTML first, then the
 * first link of the uri-list. Relative or odd values are skipped.
 */
export function droppedImageSource(html: string, uriList: string): string | null {
  const m = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(html);
  const src = m ? (m[1] ?? m[2] ?? m[3]).replace(/&amp;/g, "&") : "";
  if (src.startsWith("data:image/")) return src;
  const fromHtml = parseImageUrl(src);
  if (fromHtml) return fromHtml;
  const line = uriList.split(/\r?\n/).find((l) => l.trim() && !l.startsWith("#")) ?? "";
  return line.startsWith("data:image/") ? line.trim() : parseImageUrl(line);
}
