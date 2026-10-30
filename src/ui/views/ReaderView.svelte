<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    Bandage, ChevronDown, ChevronUp, Columns2, Eraser, Eye, EyeOff, Highlighter, ImagePlus, Layers, MessageSquareText,
    MoveHorizontal, PanelLeft, Pen, Pencil, Search, SquareDashed, StickyNote, Type, WandSparkles, X, ZoomIn, ZoomOut,
  } from "@lucide/svelte";
  import { LABELS } from "../../core/labels";
  import { INK_KINDS } from "../../core/ink";
  import { LAYERS, MARGIN_MAX, type MarginSide } from "../../core/pageTools";
  import { hitOnPage, normaliseRects, pagesToRender, parsePageInput, zoomIn, zoomOut, clampZoom } from "../../core/reader";
  import type { Document, LabelKey, Rect } from "../../core/types";
  import Button from "../components/Button.svelte";
  import IconButton from "../components/IconButton.svelte";
  import MenuButton from "../components/MenuButton.svelte";
  import ToolButton from "../components/ToolButton.svelte";
  import type { Library } from "../library.svelte";
  import { Reader, type InkSize } from "../reader.svelte";
  import AnnotationPanel from "./AnnotationPanel.svelte";
  import ImageLayer from "./ImageLayer.svelte";
  import InkLayer from "./InkLayer.svelte";
  import NoteLayer from "./NoteLayer.svelte";
  import PageNav from "./PageNav.svelte";
  import PdfPage from "./PdfPage.svelte";
  import RecordBar from "./RecordBar.svelte";
  import SplitPicker from "./SplitPicker.svelte";
  import TapeLayer from "./TapeLayer.svelte";

  /** `compact`: one half of the split view; `onclose` replaces "back to library". */
  let { lib, doc, compact = false, onclose }: { lib: Library; doc: Document; compact?: boolean; onclose?: () => void } = $props();

  // The view is keyed by document id, so the first lib and doc are the only ones.
  // svelte-ignore state_referenced_locally
  const reader = new Reader(lib, doc);
  let root: HTMLDivElement;
  let scroller: HTMLDivElement;
  let sizes = $state<{ w: number; h: number }[]>([]);
  let scale = $state(1);
  let visible = $state(new Set<number>([1]));
  let current = $state(1);
  /** Pending selection waiting for a label. */
  let pick = $state<{ page: number; rects: Rect[]; text: string; x: number; y: number } | null>(null);
  // svelte-ignore state_referenced_locally
  let showPanel = $state(!compact);
  // svelte-ignore state_referenced_locally
  let showNav = $state(!compact && window.innerWidth >= 1200);
  let picking = $state(false);
  /** Search bar (Ctrl+F or the toolbar button). */
  let searchOpen = $state(false);
  let searchInput = $state<HTMLInputElement>();
  let searchText = $state("");
  /** Bumped on each hit change so the page scrolls the current mark into view once. */
  let seek = $state(0);
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  /** Short message, e.g. a failed image insert. */
  let notice = $state<string | null>(null);

  const active = $derived(pagesToRender(visible, sizes.length));
  const penOn = $derived(reader.inkTool === "pen" || reader.inkTool === "pencil" || reader.inkTool === "highlighter");
  const kindInfo = $derived(INK_KINDS[reader.inkKind]);
  const hit = $derived(reader.hits[reader.hitIndex]);
  const currentMark = $derived(hit ? hitOnPage(reader.hits, reader.hitIndex) : -1);

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
      clearTimeout(searchTimer);
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

  // Remember the reading position (debounced in Library) for progress and "continue".
  $effect(() => {
    if (sizes.length) lib.savePosition(doc.id, current, sizes.length);
  });

  function onPointerUp() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    const pageEl = start?.closest<HTMLElement>("[data-page]");
    if (!pageEl || !scroller.contains(pageEl)) return;
    // Highlights are normalised to the PDF area (.sheet), not to a page grown by an added margin.
    const rects = normaliseRects(range.getClientRects(), (pageEl.querySelector(".sheet") ?? pageEl).getBoundingClientRect());
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
    if (w) scale = clampZoom((scroller.clientWidth - 48) / (w * (1 + reader.tools.margin(current).right)));
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

  function jumpBox(e: Event & { currentTarget: HTMLInputElement }) {
    const n = parsePageInput(e.currentTarget.value, sizes.length);
    e.currentTarget.value = String(n ?? current);
    if (n) goTo(n);
  }

  async function openSearch() {
    searchOpen = true;
    await tick();
    searchInput?.focus();
    searchInput?.select();
  }

  function closeSearch() {
    clearTimeout(searchTimer);
    searchOpen = false;
    searchText = "";
    reader.clearSearch();
  }

  async function runSearch() {
    clearTimeout(searchTimer);
    const q = searchText;
    await reader.search(q, current);
    if (reader.searchQuery !== q || !reader.hits.length) return;
    goTo(reader.hits[reader.hitIndex].page);
    seek++;
  }

  function onSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 250);
  }

  function step(dir: 1 | -1) {
    const page = reader.stepHit(dir);
    if (page == null) return;
    goTo(page);
    seek++;
  }

  function onSearchKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (reader.searchQuery === searchText && reader.hits.length) step(e.shiftKey ? -1 : 1);
      else void runSearch();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeSearch();
    }
  }

  async function addImage() {
    notice = null;
    const size = sizes[current - 1];
    if (!size) return;
    try {
      await reader.insertImage(current, size);
    } catch (e) {
      notice = e instanceof Error ? e.message : String(e);
    }
  }

  const marginNow = $derived(reader.tools.margin(current));

  async function growMargin(side: MarginSide) {
    await reader.tools.growMargin(current, side);
  }

  async function clearMargin(side: MarginSide) {
    notice = null;
    const all = await reader.tools.clearMargin(current, side, reader.ink, reader.images);
    if (!all) notice = "Kenar boşluğunda yazı ya da not var; o kısım kaldı. Önce onları silin ya da taşıyın.";
  }

  /** Something on the page that Escape should close first (note, menu, picture). */
  const escapeTaken = () =>
    reader.selectedImageId != null || reader.tools.selectedNoteId != null || !!root.querySelector(".menu .panel");

  function onKey(e: KeyboardEvent) {
    // In the split view only the pane holding the focus opens its search.
    const mine = !compact || root.contains(document.activeElement);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && mine) {
      e.preventDefault();
      void openSearch();
    } else if (e.key === "Escape" && !e.defaultPrevented && !escapeTaken()) {
      if (pick) pick = null;
      else if (searchOpen && mine) closeSearch();
      else if (!compact && !picking) lib.close();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="reader" bind:this={root}>
  <header class="toolbar">
    <div class="row">
      {#if onclose}
        <IconButton label="Bu belgeyi kapat" onclick={onclose}><X size={20} /></IconButton>
      {:else}
        <Button variant="ghost" onclick={() => lib.close()}>← Kütüphane</Button>
      {/if}
      <h1 title={doc.title}>{doc.title}</h1>
      {#if !compact}<RecordBar recorder={reader.recorder} />{/if}
      <ToolButton label="Ara" title="PDF'te ara (Ctrl+F)" pressed={searchOpen} onclick={() => (searchOpen ? closeSearch() : openSearch())}>
        <Search size={18} />
      </ToolButton>
      <div class="page-box" title="Sayfaya git">
        <!-- Plain "N / M" text for tests and tools; the input below is what people see. -->
        <span class="pages sr" aria-hidden="true">{current} / {sizes.length || "–"}</span>
        <input class="page-input" type="text" inputmode="numeric" enterkeyhint="go" aria-label="Sayfa numarası" value={current}
          onchange={jumpBox} onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()} onfocus={(e) => e.currentTarget.select()} />
        <span class="total">/ {sizes.length || "–"}</span>
      </div>
      <div class="group">
        <IconButton label="Uzaklaştır" onclick={() => (scale = zoomOut(scale))}><ZoomOut size={18} /></IconButton>
        <span class="zoom">{Math.round(scale * 100)}%</span>
        <IconButton label="Yakınlaştır" onclick={() => (scale = zoomIn(scale))}><ZoomIn size={18} /></IconButton>
        <IconButton label="Genişliğe sığdır" onclick={fitWidth}><MoveHorizontal size={18} /></IconButton>
      </div>
      <ToolButton label="Sayfalar" title="Sayfalar ve içindekiler" pressed={showNav} onclick={() => (showNav = !showNav)}>
        <PanelLeft size={18} />
      </ToolButton>
      <ToolButton label="Vurgular" title="Vurgular paneli" pressed={showPanel} onclick={() => (showPanel = !showPanel)}>
        <MessageSquareText size={18} />
      </ToolButton>
      {#if !compact}
        <ToolButton label="Yan yana" onclick={() => (picking = true)}><Columns2 size={18} /></ToolButton>
      {/if}
    </div>
    <div class="row tools" role="toolbar" aria-label="Kalem araçları">
      <ToolButton label="Tükenmez" pressed={reader.inkTool === "pen"} onclick={() => reader.setTool("pen")}><Pen size={18} /></ToolButton>
      <ToolButton label="Kurşun kalem" pressed={reader.inkTool === "pencil"} onclick={() => reader.setTool("pencil")}><Pencil size={18} /></ToolButton>
      <ToolButton label="Fosforlu" pressed={reader.inkTool === "highlighter"} onclick={() => reader.setTool("highlighter")}><Highlighter size={18} /></ToolButton>
      <ToolButton label="Lazer" title="Lazer (kaydedilmez, 1-2 saniyede söner)" pressed={reader.inkTool === "laser"} onclick={() => reader.setTool("laser")}>
        <WandSparkles size={18} />
      </ToolButton>
      <ToolButton label="Silgi" pressed={reader.inkTool === "eraser"} onclick={() => reader.setTool("eraser")}><Eraser size={18} /></ToolButton>
      <ToolButton label="Bant" title="Bant: bir alanı kapat, dokununca açılır" pressed={reader.inkTool === "tape"} onclick={() => reader.setTool("tape")}>
        <Bandage size={18} />
      </ToolButton>
      <ToolButton label="Metin" title="Metin kutusu ekle (LaTeX ve kod olur)" pressed={reader.inkTool === "text"} onclick={() => reader.setTool("text")}>
        <Type size={18} />
      </ToolButton>
      <ToolButton label="Not" title="Yapışkan not ekle" pressed={reader.inkTool === "note"} onclick={() => reader.setTool("note")}>
        <StickyNote size={18} />
      </ToolButton>
      <ToolButton label="Resim ekle" title="Bu sayfaya resim ekle" onclick={addImage}><ImagePlus size={18} /></ToolButton>
      <MenuButton label="Katmanlar" title="Katmanları göster / gizle">
        {#snippet icon()}<Layers size={18} />{/snippet}
        {#snippet children()}
          {#each LAYERS as l (l.key)}
            <label class="item"><input type="checkbox" checked={reader.tools.layers[l.key]}
              onchange={(e) => reader.tools.setLayer(l.key, e.currentTarget.checked)} />{l.name}</label>
          {/each}
        {/snippet}
      </MenuButton>
      <MenuButton label="Kenar boşluğu" title="Bu sayfaya yazı alanı ekle">
        {#snippet icon()}<SquareDashed size={18} />{/snippet}
        {#snippet children()}
          <p class="hint">Sayfa {current}: PDF aynı kalır, yanına ve altına yazabilirsiniz.</p>
          <button class="item" disabled={marginNow.right >= MARGIN_MAX} onclick={() => growMargin("right")}>Sağa boşluk ekle</button>
          <button class="item" disabled={marginNow.bottom >= MARGIN_MAX} onclick={() => growMargin("bottom")}>Alta boşluk ekle</button>
          <button class="item" disabled={!marginNow.right} onclick={() => clearMargin("right")}>Sağ boşluğu kaldır</button>
          <button class="item" disabled={!marginNow.bottom} onclick={() => clearMargin("bottom")}>Alt boşluğu kaldır</button>
        {/snippet}
      </MenuButton>
      {#if reader.inkTool === "tape"}
        <span class="sep" aria-hidden="true"></span>
        <ToolButton label="Tümünü aç" title="Bu belgedeki bütün bantları aç" onclick={() => reader.tools.revealAll(true)}><Eye size={18} /></ToolButton>
        <ToolButton label="Tümünü kapat" title="Bu belgedeki bütün bantları kapat" onclick={() => reader.tools.revealAll(false)}><EyeOff size={18} /></ToolButton>
      {/if}
      {#if penOn}
        <span class="sep" aria-hidden="true"></span>
        <div class="swatches" role="group" aria-label="{kindInfo.name} rengi">
          {#each kindInfo.colors as c (c.color)}
            <button class="swatch" aria-label="Renk: {c.name}" title={c.name} aria-pressed={reader.inkColor === c.color}
              onclick={() => reader.setInkColor(c.color)}><span style:background={c.color}></span></button>
          {/each}
          <label class="swatch custom" title="Özel renk">
            <span></span>
            <input type="color" aria-label="Özel renk" value={reader.inkColor} oninput={(e) => reader.setInkColor(e.currentTarget.value)} />
          </label>
        </div>
        <label class="width">
          <span>Kalınlık</span>
          <input type="range" min="0" max="2" step="1" aria-label="Kalınlık" value={reader.inkSizes[reader.inkKind]}
            oninput={(e) => reader.setInkSize(Number(e.currentTarget.value) as InkSize)} />
        </label>
      {/if}
    </div>
    {#if searchOpen}
      <div class="row search" role="search">
        <input bind:this={searchInput} bind:value={searchText} type="search" enterkeyhint="search" placeholder="PDF'te ara…"
          aria-label="PDF'te ara" oninput={onSearchInput} onkeydown={onSearchKey} />
        <span class="count" aria-live="polite">
          {#if reader.searchQuery && reader.searchQuery === searchText}
            {reader.hits.length ? `${reader.hitIndex + 1} / ${reader.hits.length}` : "Bulunamadı"}
          {/if}
        </span>
        <IconButton label="Önceki sonuç" onclick={() => step(-1)}><ChevronUp size={18} /></IconButton>
        <IconButton label="Sonraki sonuç" onclick={() => step(1)}><ChevronDown size={18} /></IconButton>
        <IconButton label="Aramayı kapat" onclick={closeSearch}><X size={18} /></IconButton>
      </div>
    {/if}
    {#if notice}
      <div class="row notice" role="alert">
        <span>{notice}</span><IconButton label="Uyarıyı kapat" onclick={() => (notice = null)}><X size={16} /></IconButton>
      </div>
    {/if}
  </header>
  <div class="body">
    {#if showNav && reader.pdf && sizes.length}<PageNav pdf={reader.pdf} {sizes} {current} onjump={goTo} />{/if}
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
            annotations={reader.tools.layers.highlights ? reader.annotations.filter((a) => a.page === i + 1) : []}
            focusedId={reader.focusedId} margin={reader.tools.margins.get(i + 1)}
            search={reader.searchQuery} currentMark={hit?.page === i + 1 ? currentMark : -1} {seek}>
            <ImageLayer {reader} page={i + 1} />
            <InkLayer {reader} page={i + 1} />
            <NoteLayer {reader} page={i + 1} />
            <TapeLayer {reader} page={i + 1} />
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
  .toolbar { display: flex; flex-direction: column; border-bottom: 1px solid var(--border); background: var(--surface); }
  .row { display: flex; align-items: center; flex-wrap: wrap; gap: 2px 4px; padding: 4px 12px; }
  .row + .row { border-top: 1px solid var(--border); }
  h1 { flex: 1 1 120px; min-width: 80px; margin: 0 8px; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .group { display: flex; align-items: center; }
  .zoom { color: var(--text-2); font-variant-numeric: tabular-nums; min-width: 48px; text-align: center; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .page-box { display: flex; align-items: center; gap: 4px; color: var(--text-2); font-variant-numeric: tabular-nums; margin: 0 4px; }
  .page-input {
    width: 52px; height: var(--hit); text-align: center; font: inherit; color: var(--text); background: var(--bg);
    border: 1px solid var(--border); border-radius: var(--radius-sm);
  }
  .sep { width: 1px; height: 24px; background: var(--border); margin: 0 6px; }
  .swatches { display: flex; flex-wrap: wrap; align-items: center; }
  .swatch {
    width: var(--hit); height: var(--hit); display: grid; place-items: center; border: 0; border-radius: 50%;
    background: transparent; cursor: pointer; position: relative; padding: 0; touch-action: manipulation;
  }
  .swatch span { width: 24px; height: 24px; border-radius: 50%; box-shadow: 0 0 0 1px var(--border); }
  .swatch[aria-pressed="true"] span { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent); }
  .swatch.custom span { background: conic-gradient(#e74c3c, #f1c40f, #2ecc71, #1abc9c, #3498db, #9b59b6, #e74c3c); }
  .swatch.custom input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
  .width { display: flex; align-items: center; gap: 8px; color: var(--text-2); font-size: 13px; min-height: var(--hit); margin-left: 6px; }
  .width input { width: 110px; height: var(--hit); accent-color: var(--accent); }
  .search input {
    flex: 1 1 200px; max-width: 420px; height: var(--hit); padding: 0 10px; font: inherit; color: var(--text); background: var(--bg);
    border: 1px solid var(--border); border-radius: var(--radius-sm);
  }
  .count { min-width: 80px; color: var(--text-2); font-size: 13px; font-variant-numeric: tabular-nums; }
  .notice { color: var(--danger); font-size: 13px; }
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
  @media (max-width: 1023px) { .row { padding: 4px 8px; } }
  /* Tablet portrait: tool labels are read out but not shown, so the tool row stays on one or two lines. */
  @media (max-width: 900px) {
    .tools :global(.tool > span) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .tools :global(.tool) { padding: 0 8px; }
  }
</style>
