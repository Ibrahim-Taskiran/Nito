<script lang="ts">
  import { onMount, tick } from "svelte";
  import { LABELS } from "../../core/labels";
  import { INK_COLORS } from "../../core/ink";
  import { normaliseRects, pagesToRender, zoomIn, zoomOut, clampZoom } from "../../core/reader";
  import type { Document, LabelKey, Rect } from "../../core/types";
  import Button from "../components/Button.svelte";
  import IconButton from "../components/IconButton.svelte";
  import type { Library } from "../library.svelte";
  import { Reader } from "../reader.svelte";
  import AnnotationPanel from "./AnnotationPanel.svelte";
  import InkLayer from "./InkLayer.svelte";
  import PdfPage from "./PdfPage.svelte";
  import RecordBar from "./RecordBar.svelte";
  import SplitPicker from "./SplitPicker.svelte";

  /** `compact`: one half of the split view; `onclose` replaces "back to library". */
  let { lib, doc, compact = false, onclose }: { lib: Library; doc: Document; compact?: boolean; onclose?: () => void } = $props();

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
  // svelte-ignore state_referenced_locally
  let showPanel = $state(!compact);
  let picking = $state(false);

  const active = $derived(pagesToRender(visible, sizes.length));

  onMount(() => {
    let alive = true;
    reader.load().then(async () => {
      const pdf = reader.pdf;
      if (!pdf) return;
      // Page 1 size stands in for all pages until each real size is known.
      const first = (await pdf.getPage(1)).getViewport({ scale: 1 });
      if (!alive) return;
      sizes = Array.from({ length: pdf.numPages }, () => ({ w: first.width, h: first.height }));
      fitWidth();
      if (lib.openPage && !compact) {
        const page = lib.openPage;
        lib.openPage = null;
        await tick();
        goTo(page);
      }
      for (let n = 2; n <= pdf.numPages && alive; n++) {
        const vp = (await pdf.getPage(n)).getViewport({ scale: 1 });
        if (vp.width !== first.width || vp.height !== first.height) sizes[n - 1] = { w: vp.width, h: vp.height };
      }
      const f = lib.pendingFocus;
      if (alive && f?.documentId === doc.id) {
        lib.pendingFocus = null;
        reader.focusedId = f.annotationId;
        await tick();
        goTo(f.page);
      }
    }).catch((e) => alive && console.error(e));
    return () => {
      alive = false;
      void reader.close();
    };
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

  /** Zoom so the current page fills the width (minus the scroller padding). */
  function fitWidth() {
    const w = sizes[current - 1]?.w ?? sizes[0]?.w;
    if (w) scale = clampZoom((scroller.clientWidth - 48) / w);
  }

  function goTo(page: number) {
    scroller.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ block: "start" });
  }

  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    scale = e.deltaY < 0 ? zoomIn(scale) : zoomOut(scale);
  }

  // Touch: two-finger pinch zooms; a quick horizontal swipe turns the page when nothing scrolls sideways.
  let pinch: { dist: number; scale: number } | null = null;
  let swipe: { x: number; y: number; t: number } | null = null;
  const fingerDist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
      pinch = { dist: fingerDist(e.touches), scale };
      swipe = null;
    } else if (e.touches.length === 1 && reader.inkTool === "none") {
      swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: e.timeStamp };
    }
  }

  function onTouchMove(e: TouchEvent) {
    if (pinch && e.touches.length === 2) {
      scale = clampZoom((pinch.scale * fingerDist(e.touches)) / pinch.dist);
    }
  }

  function onTouchEnd(e: TouchEvent) {
    if (e.touches.length < 2) pinch = null;
    const s = swipe;
    swipe = null;
    if (!s || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    const sideways = scroller.scrollWidth > scroller.clientWidth + 1;
    if (!sideways && Math.abs(dx) > 80 && Math.abs(dx) > 2 * Math.abs(dy) && e.timeStamp - s.t < 500) {
      goTo(Math.min(sizes.length, Math.max(1, current + (dx < 0 ? 1 : -1))));
    }
  }

  const setTool = (t: "pen" | "eraser") => (reader.inkTool = reader.inkTool === t ? "none" : t);

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (pick) pick = null;
      else if (!compact && !picking) lib.close();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="reader">
  <header class="toolbar">
    {#if onclose}
      <IconButton label="Bu belgeyi kapat" onclick={onclose}>×</IconButton>
    {:else}
      <Button variant="ghost" onclick={() => lib.close()}>← Kütüphane</Button>
    {/if}
    <h1 title={doc.title}>{doc.title}</h1>
    {#if !compact}<RecordBar recorder={reader.recorder} />{/if}
    <div class="ink-tools" role="group" aria-label="Kalem">
      <IconButton label="Kalem" pressed={reader.inkTool === "pen"} onclick={() => setTool("pen")}>✎</IconButton>
      {#if reader.inkTool === "pen"}
        {#each INK_COLORS as c (c.color)}
          <button class="swatch" aria-label="Renk: {c.name}" aria-pressed={reader.inkColor === c.color}
            style:background={c.color} onclick={() => (reader.inkColor = c.color)}></button>
        {/each}
      {/if}
      <IconButton label="Silgi" pressed={reader.inkTool === "eraser"} onclick={() => setTool("eraser")}>⌫</IconButton>
    </div>
    <span class="pages">{current} / {sizes.length || "–"}</span>
    <IconButton label="Uzaklaştır" onclick={() => (scale = zoomOut(scale))}>−</IconButton>
    <span class="zoom">{Math.round(scale * 100)}%</span>
    <IconButton label="Yakınlaştır" onclick={() => (scale = zoomIn(scale))}>+</IconButton>
    <IconButton label="Genişliğe sığdır" onclick={fitWidth}>↔</IconButton>
    {#if compact}
      <IconButton label="Vurgular paneli" pressed={showPanel} onclick={() => (showPanel = !showPanel)}>☰</IconButton>
    {:else}
      <Button variant="ghost" onclick={() => (picking = true)}>Yan yana</Button>
    {/if}
  </header>
  <div class="body">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="scroller" bind:this={scroller} onpointerup={onPointerUp} onwheel={onWheel} onscroll={() => (pick = null)}
      ontouchstart={onTouchStart} ontouchmove={onTouchMove} ontouchend={onTouchEnd}>
      {#if reader.error}
        <p class="msg">PDF açılamadı: {reader.error}</p>
      {:else if !reader.pdf || !sizes.length}
        <p class="msg">Yükleniyor…</p>
      {:else}
        {#each sizes as size, i (i)}
          <PdfPage pdf={reader.pdf} num={i + 1} width={size.w} height={size.h} {scale} active={active.has(i + 1)}
            annotations={reader.annotations.filter((a) => a.page === i + 1)} focusedId={reader.focusedId}>
            <InkLayer {reader} page={i + 1} />
          </PdfPage>
        {/each}
      {/if}
    </div>
    {#if showPanel}<AnnotationPanel {reader} onjump={goTo} />{/if}
  </div>
</div>

{#if picking}
  <SplitPicker {lib} {doc} onclose={() => (picking = false)} />
{/if}

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
  .ink-tools { display: flex; align-items: center; gap: 2px; margin-right: 4px; }
  .ink-tools :global([aria-pressed="true"]) { background: var(--accent-soft); color: var(--accent); }
  .swatch { width: 24px; height: 24px; border-radius: 50%; border: 2px solid var(--surface); box-shadow: 0 0 0 1px var(--border); cursor: pointer; margin: 0 2px; }
  .swatch[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--accent); }
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
