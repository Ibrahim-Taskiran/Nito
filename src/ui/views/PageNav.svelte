<script lang="ts">
  import { onMount } from "svelte";
  import { flattenOutline, type OutlineRow } from "../../core/reader";
  import { flagInfo } from "../../core/exam/flags";
  import type { InsertWhere, PageSlot } from "../../core/pages";
  import type { Id } from "../../core/types";
  import type { Library } from "../library.svelte";
  import { longPress } from "../longpress";
  import { PageFlags } from "../pageFlags.svelte";
  import type { PDFDocumentProxy } from "../pdf";

  /**
   * Left panel: page thumbnails (PDF pages and inserted blank pages, in reading order) and the PDF's table
   * of contents. Long press or right click on a thumbnail: add a blank page before / after it, delete a blank one.
   */
  let { pdf, slots, sizeOf, current, onjump, flags, oninsert, onremove }: {
    pdf: PDFDocumentProxy;
    slots: PageSlot[];
    sizeOf: (key: number) => { w: number; h: number };
    current: number;
    onjump: (page: number) => void;
    /** Shows page flags on the thumbnails. */
    flags?: { lib: Library; documentId: Id };
    oninsert?: (ref: number, where: InsertWhere) => void;
    onremove?: (key: number) => void;
  } = $props();
  let menu = $state<{ key: number; label: string; x: number; y: number } | null>(null);
  const openMenu = (s: PageSlot, x: number, y: number) => {
    if (oninsert) menu = { key: s.key, label: s.label, x: Math.min(x, window.innerWidth - 240), y: Math.min(y, window.innerHeight - 200) };
  };
  function pick(fn: () => void) {
    menu = null;
    fn();
  }
  const pageFlags = $derived(flags ? PageFlags.for(flags.lib, flags.documentId) : null);

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

  /**
   * Draws a small page image while the thumbnail is near the view and frees it when it scrolls away,
   * so a 500-page PDF keeps only a screenful of thumbnail bitmaps. A thumbnail that only flies past is
   * never drawn, and a draw still running when it leaves is cancelled.
   */
  function thumb(canvas: HTMLCanvasElement, num: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let task: { cancel(): void } | null = null;
    let near = false;
    const free = () => {
      clearTimeout(timer);
      task?.cancel();
      task = null;
      canvas.width = canvas.height = 0;
      delete canvas.dataset.drawn;
    };
    const draw = async () => {
      const page = await pdf.getPage(num);
      if (!near) return;
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: (THUMB_W * Math.min(2, window.devicePixelRatio || 1)) / base.width });
      const off = document.createElement("canvas");
      off.width = Math.floor(vp.width);
      off.height = Math.floor(vp.height);
      const t = page.render({ canvas: off, viewport: vp });
      task = t;
      try {
        await t.promise;
      } catch {
        return; // cancelled
      } finally {
        if (task === t) task = null;
      }
      if (!near) return;
      canvas.width = off.width;
      canvas.height = off.height;
      canvas.getContext("2d")!.drawImage(off, 0, 0);
      off.width = off.height = 0;
      canvas.dataset.drawn = "";
    };
    const io = new IntersectionObserver(([e]) => {
      near = e.isIntersecting;
      if (!near) return free();
      if (canvas.dataset.drawn === undefined && !task) {
        clearTimeout(timer);
        timer = setTimeout(() => void draw().catch(() => {}), 80);
      }
    }, { root: list, rootMargin: "300px" });
    canvas.width = canvas.height = 0;
    io.observe(canvas);
    return { destroy: () => { io.disconnect(); near = false; free(); } };
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
      {#each slots as s (s.key)}
        {@const size = sizeOf(s.key)}
        <button class="thumb" data-thumb={s.key} class:current={current === s.key} aria-label={s.pdf ? `Sayfa ${s.label}` : `Boş sayfa ${s.label}`}
          aria-current={current === s.key ? "page" : undefined} onclick={() => onjump(s.key)}
          oncontextmenu={(e) => { if (oninsert) { e.preventDefault(); openMenu(s, e.clientX, e.clientY); } }}
          {@attach longPress((x, y) => openMenu(s, x, y))}>
          {#if s.pdf}
            <canvas use:thumb={s.pdf} style:aspect-ratio="{size.w} / {size.h}"></canvas>
          {:else}
            <div class="blank" style:aspect-ratio="{size.w} / {size.h}"></div>
          {/if}
          <span>{s.label}</span>
          {#if pageFlags?.on(s.key).length}
            <span class="flags" aria-label="İşaretler: {pageFlags.on(s.key).map((k) => flagInfo(k).name).join(', ')}">
              {#each pageFlags.on(s.key) as k (k)}<i style:background={flagInfo(k).color} title={flagInfo(k).name}></i>{/each}
            </span>
          {/if}
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

<svelte:window onpointerdown={(e) => menu && !(e.target as Element).closest?.(".thumb-menu") && (menu = null)}
  onkeydown={(e) => { if (menu && e.key === "Escape") { e.preventDefault(); menu = null; } }} />

{#if menu && oninsert}
  {@const m = menu}
  <div class="thumb-menu" role="menu" aria-label="Sayfa {m.label}" style:left="{m.x}px" style:top="{m.y}px">
    <button role="menuitem" onclick={() => pick(() => oninsert(m.key, "before"))}>Önüne boş sayfa ekle</button>
    <button role="menuitem" onclick={() => pick(() => oninsert(m.key, "after"))}>Arkasına boş sayfa ekle</button>
    {#if m.key < 0 && onremove}
      <button role="menuitem" class="danger" onclick={() => pick(() => onremove(m.key))}>Bu boş sayfayı sil</button>
    {/if}
  </div>
{/if}

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
  .thumb { position: relative; }
  .flags { position: absolute; top: 10px; right: 14px; display: flex; flex-direction: column; gap: 3px; }
  .flags i { width: 10px; height: 10px; border-radius: 50%; box-shadow: 0 0 0 2px #fff; }
  .thumb canvas { width: 112px; background: #fff; box-shadow: 0 0 0 1px var(--border); border-radius: 2px; }
  .thumb.current canvas, .thumb.current .blank { box-shadow: 0 0 0 2px var(--accent); }
  .blank { width: 112px; background: #fff; box-shadow: 0 0 0 1px var(--border); border-radius: 2px; }
  .thumb-menu {
    position: fixed; z-index: 40; min-width: 220px; padding: 4px; display: flex; flex-direction: column; background: var(--surface);
    border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 8px 28px rgb(0 0 0 / 0.16);
  }
  .thumb-menu button {
    min-height: var(--hit); padding: 0 12px; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--text);
    font: inherit; font-size: 13px; text-align: left; cursor: pointer;
  }
  .thumb-menu button:hover { background: var(--surface-2); }
  .thumb-menu .danger { color: var(--danger); }
  .thumb.current span { color: var(--accent); font-weight: 600; }
  .row {
    display: block; width: 100%; text-align: left; border: 0; background: transparent; cursor: pointer; color: var(--text);
    min-height: var(--hit); padding: 6px 8px; border-radius: var(--radius-sm); font-size: 13px; line-height: 1.3;
  }
  .row:hover { background: var(--surface-2); }
  .hint { color: var(--text-2); font-size: 13px; padding: 4px; }
</style>
