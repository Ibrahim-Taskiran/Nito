<script lang="ts">
  import type { Snippet } from "svelte";
  import { labelInfo } from "../../core/labels";
  import type { Annotation, Id } from "../../core/types";
  import { pdfjs, type PDFDocumentProxy } from "../pdf";
  import "../textLayer.css";

  let { pdf, num, width, height, scale, active, annotations, focusedId, children }: {
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
    /** Overlays drawn above the text layer (handwriting). */
    children?: Snippet;
  } = $props();

  let canvas: HTMLCanvasElement;
  let textLayer: HTMLDivElement;

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
    }, canvas.width ? 120 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancel();
    };
  });
</script>

<div class="page" data-page={num} style:width="{width * scale}px" style:height="{height * scale}px"
  style:--scale-factor={scale} style:--total-scale-factor={scale}>
  <canvas bind:this={canvas}></canvas>
  {#each annotations as a (a.id)}
    {#each a.rects as r, i (i)}
      <div class="hl" class:focused={a.id === focusedId} style:background={labelInfo(a.label).color}
        style:left="{r.x * 100}%" style:top="{r.y * 100}%" style:width="{r.w * 100}%" style:height="{r.h * 100}%"></div>
    {/each}
  {/each}
  <div class="textLayer" bind:this={textLayer}></div>
  {@render children?.()}
</div>

<style>
  .page { position: relative; margin: 0 auto 16px; background: #fff; box-shadow: 0 1px 4px rgb(0 0 0 / 0.14); border-radius: 2px; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
  .hl { position: absolute; opacity: 0.35; mix-blend-mode: multiply; border-radius: 2px; pointer-events: none; }
  .hl.focused { opacity: 0.55; outline: 2px solid var(--accent); }
</style>
