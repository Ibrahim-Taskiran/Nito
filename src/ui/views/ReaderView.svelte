<script lang="ts">
  import { onMount, tick } from "svelte";
  import { LABELS } from "../../core/labels";
  import { normaliseRects, pagesToRender, zoomIn, zoomOut, clampZoom } from "../../core/reader";
  import type { Document, LabelKey, Rect } from "../../core/types";
  import Button from "../components/Button.svelte";
  import IconButton from "../components/IconButton.svelte";
  import type { Library } from "../library.svelte";
  import { Reader } from "../reader.svelte";
  import AnnotationPanel from "./AnnotationPanel.svelte";
  import PdfPage from "./PdfPage.svelte";
  import RecordBar from "./RecordBar.svelte";

  let { lib, doc }: { lib: Library; doc: Document } = $props();

  // The view is keyed by document id, so the first lib and doc are the only ones.
  // svelte-ignore state_referenced_locally
  const reader = new Reader(lib, doc);
  let scroller: HTMLDivElement;
  let sizes = $state<{ w: number; h: number }[]>([]);
  let scale = $state(1);
  let visible = $state(new Set<number>([1]));
  let current = $state(1);
  /** Pending selection waiting for a label. */
  let pick = $state<{ page: number; rects: Rect[]; text: string; x: number; y: number } | null>(null);

  const active = $derived(pagesToRender(visible, sizes.length));

  onMount(() => {
    reader.load().then(async () => {
      const pdf = reader.pdf;
      if (!pdf) return;
      // Page 1 size stands in for all pages until each real size is known.
      const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
      sizes = Array.from({ length: pdf.numPages }, () => ({ w: first.width, h: first.height }));
      scale = clampZoom((scroller.clientWidth - 48) / first.width);
      for (let n = 2; n <= pdf.numPages; n++) {
        const vp = (await pdf.getPage(n)).getViewport({ scale: 1 });
        if (vp.width !== first.width || vp.height !== first.height) sizes[n - 1] = { w: vp.width, h: vp.height };
      }
      const f = lib.pendingFocus;
      if (f?.documentId === doc.id) {
        lib.pendingFocus = null;
        reader.focusedId = f.annotationId;
        await tick();
        goTo(f.page);
      }
    });
    return () => void reader.close();
  });

  // Track which pages intersect the viewport.
  $effect(() => {
    if (!sizes.length) return;
    const seen = new Set<number>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const n = Number((e.target as HTMLElement).dataset.page);
        if (e.isIntersecting) seen.add(n);
        else seen.delete(n);
      }
      if (seen.size) {
        visible = new Set(seen);
        current = Math.min(...seen);
      }
    }, { root: scroller });
    for (const el of scroller.querySelectorAll("[data-page]")) io.observe(el);
    return () => io.disconnect();
  });

  function onPointerUp() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    const pageEl = start?.closest<HTMLElement>("[data-page]");
    if (!pageEl || !scroller.contains(pageEl)) return;
    const rects = normaliseRects(range.getClientRects(), pageEl.getBoundingClientRect());
    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (!rects.length || !text) return;
    const last = range.getBoundingClientRect();
    pick = { page: Number(pageEl.dataset.page), rects, text, x: last.left + last.width / 2, y: last.bottom + 8 };
  }

  async function choose(label: LabelKey) {
    if (!pick) return;
    const id = await reader.addHighlight(pick.page, pick.rects, label, pick.text);
    reader.focusedId = id;
    pick = null;
    getSelection()?.removeAllRanges();
  }

  function goTo(page: number) {
    scroller.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ block: "start" });
  }

  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    scale = e.deltaY < 0 ? zoomIn(scale) : zoomOut(scale);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (pick) pick = null;
      else lib.close();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="reader">
  <header class="toolbar">
    <Button variant="ghost" onclick={() => lib.close()}>← Kütüphane</Button>
    <h1 title={doc.title}>{doc.title}</h1>
    <RecordBar recorder={reader.recorder} />
    <span class="pages">{current} / {sizes.length || "–"}</span>
    <IconButton label="Uzaklaştır" onclick={() => (scale = zoomOut(scale))}>−</IconButton>
    <span class="zoom">{Math.round(scale * 100)}%</span>
    <IconButton label="Yakınlaştır" onclick={() => (scale = zoomIn(scale))}>+</IconButton>
  </header>
  <div class="body">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="scroller" bind:this={scroller} onpointerup={onPointerUp} onwheel={onWheel} onscroll={() => (pick = null)}>
      {#if reader.error}
        <p class="msg">PDF açılamadı: {reader.error}</p>
      {:else if !reader.pdf || !sizes.length}
        <p class="msg">Yükleniyor…</p>
      {:else}
        {#each sizes as size, i (i)}
          <PdfPage pdf={reader.pdf} num={i + 1} width={size.w} height={size.h} {scale} active={active.has(i + 1)}
            annotations={reader.annotations.filter((a) => a.page === i + 1)} focusedId={reader.focusedId} />
        {/each}
      {/if}
    </div>
    <AnnotationPanel {reader} onjump={goTo} />
  </div>
</div>

{#if pick}
  <div class="picker" role="toolbar" aria-label="Vurgu etiketi" style:left="{pick.x}px" style:top="{pick.y}px">
    {#each LABELS as l (l.key)}
      <button onclick={() => choose(l.key)} title={l.name}><span class="chip" style:background={l.color}></span>{l.name}</button>
    {/each}
  </div>
{/if}

<style>
  .reader { display: flex; flex-direction: column; height: 100%; }
  .toolbar { display: flex; align-items: center; gap: 4px; padding: 6px 12px; border-bottom: 1px solid var(--border); background: var(--surface); }
  h1 { flex: 1; min-width: 0; margin: 0 8px; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pages, .zoom { color: var(--text-2); font-variant-numeric: tabular-nums; min-width: 52px; text-align: center; }
  .body { flex: 1; display: flex; min-height: 0; }
  .scroller { flex: 1; overflow: auto; padding: 24px; background: var(--surface-2); touch-action: pan-x pan-y; }
  .msg { color: var(--text-2); text-align: center; margin-top: 40px; }
  .picker {
    position: fixed; transform: translateX(-50%); z-index: 20; display: flex; gap: 2px; padding: 4px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 8px 28px rgb(0 0 0 / 0.16);
  }
  .picker button {
    min-height: var(--hit); padding: 0 10px; border: 0; border-radius: var(--radius-sm); background: transparent; cursor: pointer;
    display: flex; align-items: center; gap: 6px;
  }
  .picker button:hover { background: var(--surface-2); }
  .chip { width: 12px; height: 12px; border-radius: 50%; }
</style>
