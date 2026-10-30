<script lang="ts">
  import { onMount } from "svelte";
  import { flattenOutline, type OutlineRow } from "../../core/reader";
  import type { PDFDocumentProxy } from "../pdf";

  /** Left panel: page thumbnails and the PDF's table of contents. */
  let { pdf, sizes, current, onjump }: {
    pdf: PDFDocumentProxy;
    sizes: { w: number; h: number }[];
    current: number;
    onjump: (page: number) => void;
  } = $props();

  const THUMB_W = 112;
  let tab = $state<"pages" | "outline">("pages");
  let outline = $state.raw<OutlineRow<unknown>[] | null>(null);
  let list = $state<HTMLDivElement>();

  onMount(() => {
    pdf.getOutline().then((o) => (outline = flattenOutline(o as never)), () => (outline = []));
  });

  /** pdf.js destination (name or explicit array) to a 1-based page. */
  async function destPage(dest: unknown): Promise<number | null> {
    const explicit = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || explicit[0] == null) return null;
    const ref = explicit[0];
    return typeof ref === "number" ? ref + 1 : (await pdf.getPageIndex(ref)) + 1;
  }

  async function openRow(row: OutlineRow<unknown>) {
    const n = await destPage(row.dest).catch(() => null);
    if (n) onjump(n);
  }

  /** Renders a small page image the first time the thumbnail scrolls into view. */
  function thumb(canvas: HTMLCanvasElement, num: number) {
    let done = false;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting || done) return;
      done = true;
      io.disconnect();
      const page = await pdf.getPage(num);
      const vp = page.getViewport({ scale: (THUMB_W * (window.devicePixelRatio || 1)) / page.getViewport({ scale: 1 }).width });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      await page.render({ canvas, viewport: vp }).promise.catch(() => {});
    }, { root: list, rootMargin: "200px" });
    io.observe(canvas);
    return { destroy: () => io.disconnect() };
  }

  // Keep the current page's thumbnail in sight.
  $effect(() => {
    if (tab !== "pages") return;
    list?.querySelector(`[data-thumb="${current}"]`)?.scrollIntoView({ block: "nearest" });
  });
</script>

<aside class="nav" aria-label="Sayfalar ve içindekiler">
  <div class="tabs" role="tablist">
    <button role="tab" aria-selected={tab === "pages"} onclick={() => (tab = "pages")}>Sayfalar</button>
    <button role="tab" aria-selected={tab === "outline"} onclick={() => (tab = "outline")}>İçindekiler</button>
  </div>
  <div class="list" bind:this={list}>
    {#if tab === "pages"}
      {#each sizes as s, i (i)}
        <button class="thumb" data-thumb={i + 1} class:current={current === i + 1} aria-label="Sayfa {i + 1}"
          aria-current={current === i + 1 ? "page" : undefined} onclick={() => onjump(i + 1)}>
          <canvas use:thumb={i + 1} style:aspect-ratio="{s.w} / {s.h}"></canvas>
          <span>{i + 1}</span>
        </button>
      {/each}
    {:else if outline === null}
      <p class="hint">Yükleniyor…</p>
    {:else if !outline.length}
      <p class="hint">Bu PDF'te içindekiler yok.</p>
    {:else}
      {#each outline as row, i (i)}
        <button class="row" style:padding-left="{8 + row.depth * 14}px" onclick={() => openRow(row)}>{row.title}</button>
      {/each}
    {/if}
  </div>
</aside>

<style>
  .nav { width: 172px; flex: none; display: flex; flex-direction: column; border-right: 1px solid var(--border); background: var(--surface); min-height: 0; }
  .tabs { display: flex; gap: 2px; padding: 6px; border-bottom: 1px solid var(--border); }
  .tabs button {
    flex: 1; min-height: var(--hit); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text-2);
    cursor: pointer; font-size: 12px; font-weight: 600;
  }
  .tabs button[aria-selected="true"] { background: var(--accent-soft); color: var(--accent); }
  .list { flex: 1; overflow-y: auto; padding: 8px; }
  .thumb {
    display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; padding: 6px; margin-bottom: 4px;
    border: 0; border-radius: var(--radius-sm); background: transparent; cursor: pointer; color: var(--text-2); font-size: 12px;
  }
  .thumb:hover { background: var(--surface-2); }
  .thumb canvas { width: 112px; background: #fff; box-shadow: 0 0 0 1px var(--border); border-radius: 2px; }
  .thumb.current canvas { box-shadow: 0 0 0 2px var(--accent); }
  .thumb.current span { color: var(--accent); font-weight: 600; }
  .row {
    display: block; width: 100%; text-align: left; border: 0; background: transparent; cursor: pointer; color: var(--text);
    min-height: var(--hit); padding: 6px 8px; border-radius: var(--radius-sm); font-size: 13px; line-height: 1.3;
  }
  .row:hover { background: var(--surface-2); }
  .hint { color: var(--text-2); font-size: 13px; padding: 4px; }
</style>
