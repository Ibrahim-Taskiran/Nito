// Cover thumbnails: page 1 rendered small with pdf.js, cached as PNG in storage (thumbs/<hash>.png).
import type { Document } from "../core/types";
import type { Storage } from "../platform/types";
import { thumbPath } from "./library.svelte";
import { openPdf } from "./pdf";

const WIDTH = 360; // px; sharp enough for cards and the detail panel on 2x screens
const urls = new Map<string, Promise<string | null>>();
let running = 0;
const queue: (() => void)[] = [];

/** At most two renders at once, so a big library does not freeze the screen. */
async function slot<T>(job: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>((r) => queue.push(r));
  running++;
  try {
    return await job();
  } finally {
    running--;
    queue.shift()?.();
  }
}

async function render(storage: Storage, d: Document): Promise<Uint8Array> {
  const pdf = await openPdf(await storage.read(d.filePath));
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: WIDTH / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, viewport: vp }).promise;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) throw new Error("Kapak oluşturulamadı");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    void pdf.destroy();
  }
}

/** Object URL of the cover, or null when the PDF cannot be read. Cached per file hash. */
export function thumbnail(storage: Storage, d: Document): Promise<string | null> {
  let p = urls.get(d.fileHash);
  if (!p) {
    p = (async () => {
      let bytes: Uint8Array;
      try {
        bytes = await storage.read(thumbPath(d));
      } catch {
        bytes = await slot(() => render(storage, d));
        await storage.write(thumbPath(d), bytes).catch(() => {});
      }
      return URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/png" }));
    })().catch(() => null);
    urls.set(d.fileHash, p);
  }
  return p;
}
