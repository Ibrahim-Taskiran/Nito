<script lang="ts">
  import type { Snippet } from "svelte";
  import { labelInfo } from "../../core/labels";
  import { normaliseRects } from "../../core/reader";
  import { foldQuery, matchesIn } from "../../core/search";
  import type { Annotation, Id, Rect } from "../../core/types";
  import { pdfjs, type PDFDocumentProxy } from "../pdf";
  import "../textLayer.css";

  let { pdf, num, width, height, scale, active, annotations, focusedId, search = "", currentMark = -1, seek = 0, margin, children }: {
    pdf: PDFDocumentProxy;
    num: number;
    /** Page size in PDF points at scale 1. */
    width: number;
    height: number;
    scale: number;
    /** Render only when on screen or next to it; otherwise free the canvas. */
    active: boolean;
    annotations: Annotation[];
    focusedId: Id | null;
    /** Search text to mark on this page. */
    search?: string;
    /** Which search mark on this page is the current hit (-1: none). */
    currentMark?: number;
    /** Bumped on each hit step; the current mark is scrolled into view once per value. */
    seek?: number;
    /** Extra writable area (fractions of the page) right and below; the PDF itself stays the same size. */
    margin?: { right: number; bottom: number };
    /** Overlays drawn above the text layer (handwriting). */
    children?: Snippet;
  } = $props();

  let canvas: HTMLCanvasElement;
  let textLayer: HTMLDivElement;
  let pageEl: HTMLDivElement;
  let sheet: HTMLDivElement;
  /** Bumped when the text layer is replaced, so search marks are recomputed. */
  let textVersion = $state(0);
  let marks = $state<Rect[]>([]);

  // Search marks: ranges inside text-layer spans, normalised to the page like highlights.
  $effect(() => {
    void textVersion;
    void scale;
    const q = search;
    const len = foldQuery(q).length;
    if (!len || !active) {
      marks = [];
      return;
    }
    const box = sheet.getBoundingClientRect();
    const out: Rect[] = [];
    for (const span of textLayer.querySelectorAll("span")) {
      const node = span.firstChild;
      if (!(node instanceof Text)) continue;
      for (const at of matchesIn(node.data, q)) {
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, Math.min(node.data.length, at + len));
        out.push(...normaliseRects(range.getClientRects(), box));
      }
    }
    marks = out;
  });

  let seeked = -1;
  $effect(() => {
    if (currentMark < 0 || seek === seeked || currentMark >= marks.length) return;
    seeked = seek;
    pageEl.querySelector(".found.current")?.scrollIntoView({ block: "center", inline: "nearest" });
  });

  $effect(() => {
    if (!active) {
      canvas.width = canvas.height = 0;
      textLayer.replaceChildren();
      return;
    }
    const s = scale;
    let cancelled = false;
    let cancel = () => {};
    // Wait for zoom to settle; until then CSS stretches the old bitmap.
    const timer = setTimeout(async () => {
      const [lib, page] = await Promise.all([pdfjs(), pdf.getPage(num)]);
      if (cancelled) return;
      const vp = page.getViewport({ scale: s });
      const dpr = window.devicePixelRatio || 1;
      const off = document.createElement("canvas");
      off.width = Math.floor(vp.width * dpr);
      off.height = Math.floor(vp.height * dpr);
      const task = page.render({ canvas: off, viewport: vp, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] });
      const textBox = document.createElement("div");
      const text = new lib.TextLayer({ textContentSource: page.streamTextContent(), container: textBox, viewport: vp });
      cancel = () => {
        task.cancel();
        text.cancel();
      };
      try {
        await Promise.all([task.promise, text.render()]);
      } catch {
        return; // cancelled
      }
      if (cancelled) return;
      // Swap in only when both are ready, so the page never flashes blank.
      canvas.width = off.width;
      canvas.height = off.height;
      canvas.getContext("2d")!.drawImage(off, 0, 0);
      textLayer.replaceChildren(...textBox.childNodes);
      textVersion++;
    }, canvas.width ? 120 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancel();
    };
  });
</script>

<div class="page" class:grown={margin && (margin.right > 0 || margin.bottom > 0)} bind:this={pageEl} data-page={num}
  style:width="{width * scale * (1 + (margin?.right ?? 0))}px" style:height="{height * scale * (1 + (margin?.bottom ?? 0))}px"
  style:--scale-factor={scale} style:--total-scale-factor={scale}>
  <!-- The PDF area; highlights and search marks are normalised to it, overlays to it but may go past it. -->
  <div class="sheet" bind:this={sheet} style:width="{width * scale}px" style:height="{height * scale}px">
  <canvas bind:this={canvas}></canvas>
  {#each annotations as a (a.id)}
    {#each a.rects as r, i (i)}
      <div class="hl" class:focused={a.id === focusedId} style:background={labelInfo(a.label).color}
        style:left="{r.x * 100}%" style:top="{r.y * 100}%" style:width="{r.w * 100}%" style:height="{r.h * 100}%"></div>
    {/each}
  {/each}
  {#each marks as r, i (i)}
    <div class="found" class:current={i === currentMark} style:left="{r.x * 100}%" style:top="{r.y * 100}%" style:width="{r.w * 100}%" style:height="{r.h * 100}%"></div>
  {/each}
  <div class="textLayer" bind:this={textLayer}></div>
  </div>
  {@render children?.()}
</div>

<style>
  .page { position: relative; margin: 0 auto 16px; background: #fff; box-shadow: 0 1px 4px rgb(0 0 0 / 0.14); border-radius: 2px; }
  .sheet { position: absolute; left: 0; top: 0; }
  .grown .sheet { box-shadow: 1px 1px 0 var(--border); }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .hl { position: absolute; opacity: 0.35; mix-blend-mode: multiply; border-radius: 2px; pointer-events: none; }
  .found { position: absolute; background: #ffb000; opacity: 0.45; mix-blend-mode: multiply; border-radius: 2px; pointer-events: none; outline: 1px solid #e08a00; }
  .found.current { background: #ff6a00; opacity: 0.55; outline: 2px solid #c24e00; }
  .hl.focused { opacity: 0.55; outline: 2px solid var(--accent); }
</style>
