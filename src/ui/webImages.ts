// Pictures from outside the app: dropped from a web browser, pasted from the clipboard, or fetched from a link.
// The checks (type from bytes, size limit, which link) are in core/webImage.
import type { Attachment } from "svelte/attachments";
import { checkImageBytes, decodeDataUrl, droppedImageSource } from "../core/webImage";
import type { Reader } from "./reader.svelte";

type Size = { w: number; h: number };

/** Bytes of the first picture in a drop or paste: a file, a data URL, or a web link (downloaded). Null: none. */
export async function imageFrom(dt: DataTransfer, reader: Reader): Promise<Uint8Array | null> {
  const file = [...dt.files].find((f) => f.type.startsWith("image/")) ??
    [...dt.items].find((i) => i.kind === "file" && i.type.startsWith("image/"))?.getAsFile();
  if (file) return new Uint8Array(await file.arrayBuffer());
  const src = droppedImageSource(dt.getData("text/html"), dt.getData("text/uri-list"));
  if (!src) return null;
  return decodeDataUrl(src) ?? reader.lib.platform.fetchImage(src);
}

/** Checks the bytes and puts the picture on `page` (at `at`, page fractions, when given). */
export async function placeBytes(reader: Reader, page: number, size: Size, bytes: Uint8Array, at?: { x: number; y: number }): Promise<void> {
  const ext = checkImageBytes(bytes);
  await reader.addImageBytes(page, bytes, ext, size, at);
}

/** Clipboard picture through the async Clipboard API (touch "Yapıştır", the menu item). Null when there is none. */
export async function clipboardImage(): Promise<Uint8Array | null> {
  if (!navigator.clipboard?.read) return null;
  for (const item of await navigator.clipboard.read()) {
    const type = item.types.find((t) => t.startsWith("image/"));
    if (type) return new Uint8Array(await (await item.getType(type)).arrayBuffer());
  }
  return null;
}

const wanted = (dt: DataTransfer | null) =>
  !!dt && [...dt.types].some((t) => t === "Files" || t === "text/uri-list" || t === "text/html");

/**
 * Drop target for pictures on the pages: `{@attach imageDrop(reader, sizeOf, onerror)}` on the scroller.
 * PDF files dropped here still go to the library (they are not pictures, so the event passes on).
 */
export function imageDrop(reader: Reader, sizeOf: (page: number) => Size | undefined, onerror: (msg: string) => void): Attachment<HTMLElement> {
  return (el) => {
    const over = (e: DragEvent) => {
      if (!wanted(e.dataTransfer) || !(e.target as HTMLElement).closest?.("[data-page]")) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const drop = async (e: DragEvent) => {
      const pageEl = (e.target as HTMLElement).closest?.("[data-page]") as HTMLElement | null;
      const dt = e.dataTransfer;
      if (!pageEl || !dt || !wanted(dt)) return;
      const hasPdf = [...dt.files].some((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
      if (hasPdf) return;
      e.preventDefault();
      e.stopPropagation();
      const page = Number(pageEl.dataset.page);
      const size = sizeOf(page);
      if (!size) return;
      // The ink layer covers the page and its margin, like the bounds.
      const r = (pageEl.querySelector("svg.ink:not(.under)") ?? pageEl).getBoundingClientRect();
      const b = reader.tools.bounds(page);
      const at = { x: ((e.clientX - r.left) / r.width) * b.w, y: ((e.clientY - r.top) / r.height) * b.h };
      try {
        const bytes = await imageFrom(dt, reader);
        if (!bytes) throw new Error("Bırakılan şeyde resim bulunamadı.");
        await placeBytes(reader, page, size, bytes, at);
      } catch (err) {
        onerror(err instanceof Error ? err.message : String(err));
      }
    };
    el.addEventListener("dragover", over);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragover", over);
      el.removeEventListener("drop", drop);
    };
  };
}
