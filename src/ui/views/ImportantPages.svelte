<script lang="ts">
  import { FileDown, X } from "@lucide/svelte";
  import { buildPdf, pdfFileName, type ExportImage, type ExportPage } from "../../core/exportPdf";
  import { labelInfo } from "../../core/labels";
  import { keysToRender, type PageSlot } from "../../core/pages";
  import IconButton from "../components/IconButton.svelte";
  import { PageFlags } from "../pageFlags.svelte";
  import type { Reader } from "../reader.svelte";
  import InkLayer from "./InkLayer.svelte";
  import PdfPage from "./PdfPage.svelte";

  /**
   * "Önemli sayfalar": a second, small reader with only the pages flagged "Önemli", in reading order.
   * A side pane on tablets and desktop, a bottom sheet on phones. Tapping a page scrolls the main reader there.
   */
  let { reader, sizeOf, onjump, onclose }: {
    reader: Reader;
    sizeOf: (key: number) => { w: number; h: number };
    onjump: (key: number) => void;
    onclose: () => void;
  } = $props();

  const flags = $derived(PageFlags.for(reader.lib, reader.doc.id));
  const pages = $derived(reader.pages.slots.filter((s) => flags.on(s.key).includes("important")));
  let list = $state<HTMLDivElement>();
  let listW = $state(260);
  let visible = $state(new Set<number>());
  const active = $derived(keysToRender(pages, visible));
  let busy = $state(false);
  let notice = $state<string | null>(null);

  const scaleOf = (s: PageSlot) => Math.max(0.1, Math.min(listW - 24, 420) / sizeOf(s.key).w);

  $effect(() => {
    void pages;
    if (!list) return;
    const seen = new Set<number>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const k = Number((e.target as HTMLElement).dataset.mini);
        if (e.isIntersecting) seen.add(k);
        else seen.delete(k);
      }
      visible = new Set(seen);
    }, { root: list, rootMargin: "200px" });
    for (const el of list.querySelectorAll("[data-mini]")) io.observe(el);
    return () => io.disconnect();
  });

  function onKey(e: KeyboardEvent, key: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onjump(key);
    }
  }

  async function imagesOf(key: number): Promise<ExportImage[]> {
    const out: ExportImage[] = [];
    for (const img of reader.images.filter((i) => i.page === key)) {
      const ext = img.filePath.split(".").pop()?.toLowerCase();
      const type = ext === "png" ? "png" : ext === "jpg" || ext === "jpeg" ? "jpg" : null;
      if (!type) continue;
      try {
        out.push({ type, bytes: await reader.lib.platform.storage.read(img.filePath), rect: { x: img.x, y: img.y, w: img.w, h: img.h } });
      } catch { /* missing file: left out */ }
    }
    return out;
  }

  /** "PDF olarak kaydet": the important pages as a real PDF, with highlights, pen and pictures burned in. */
  async function save() {
    busy = true;
    notice = null;
    try {
      const L = reader.tools.layers;
      const list: ExportPage[] = [];
      for (const s of pages) {
        const size = sizeOf(s.key);
        list.push({
          pdf: s.pdf, w: size.w, h: size.h, margin: reader.tools.margins.get(s.key),
          highlights: L.highlights ? reader.annotations.filter((a) => a.page === s.key).map((a) => ({ rects: a.rects, color: labelInfo(a.label).color })) : [],
          ink: L.ink ? reader.ink.filter((st) => st.page === s.key) : [],
          images: L.images ? await imagesOf(s.key) : [],
        });
      }
      const source = pages.some((s) => s.pdf != null) ? await reader.lib.platform.storage.read(reader.doc.filePath) : null;
      const bytes = await buildPdf(source, list, `${reader.doc.title} · Önemli`);
      const path = await reader.lib.platform.saveExport(pdfFileName(reader.doc.title, "onemli"), bytes);
      notice = path ? `Kaydedildi: ${path}` : "PDF indirildi.";
    } catch (e) {
      notice = `PDF kaydedilemedi: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      busy = false;
    }
  }
</script>

<aside class="important" aria-label="Önemli sayfalar">
  <header>
    <h2>Önemli sayfalar <span class="n">({pages.length})</span></h2>
    <button class="save" disabled={busy || !pages.length} onclick={save}><FileDown size={16} />{busy ? "Hazırlanıyor…" : "PDF olarak kaydet"}</button>
    <IconButton label="Önemli sayfaları kapat" onclick={onclose}><X size={18} /></IconButton>
  </header>
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  <div class="list" bind:this={list} bind:clientWidth={listW}>
    {#if !pages.length}
      <p class="hint">Henüz önemli sayfa yok. Bir sayfayı “İşaretle › Önemli” ile ekleyin.</p>
    {/if}
    {#each pages as s (s.key)}
      {@const size = sizeOf(s.key)}
      <div class="item" role="button" tabindex="0" data-mini={s.key} aria-label="Sayfa {s.label}'ye git"
        onclick={() => onjump(s.key)} onkeydown={(e) => onKey(e, s.key)}>
        <div class="sheet">
          {#if reader.pdf}
            <PdfPage pdf={reader.pdf} num={s.key} blank={s.pdf == null} width={size.w} height={size.h} scale={scaleOf(s)}
              active={active.has(s.key)} margin={reader.tools.margins.get(s.key)} focusedId={null}
              annotations={reader.tools.layers.highlights ? reader.annotations.filter((a) => a.page === s.key) : []}>
              <InkLayer {reader} page={s.key} />
            </PdfPage>
          {/if}
        </div>
        <span class="label">s. {s.label}</span>
      </div>
    {/each}
  </div>
</aside>

<style>
  .important {
    width: 300px; flex: none; display: flex; flex-direction: column; min-height: 0; background: var(--surface);
    border-left: 1px solid var(--border);
  }
  header { display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  h2 { flex: 1; margin: 0 4px; font-size: 13px; font-weight: 600; white-space: nowrap; }
  .n { color: var(--text-2); font-weight: 400; }
  .save {
    min-height: var(--hit); display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: var(--bg); color: var(--text); font: inherit; font-size: 13px; cursor: pointer;
    touch-action: manipulation;
  }
  .save:disabled { opacity: 0.5; cursor: default; }
  .notice { margin: 6px 10px 0; font-size: 12px; color: var(--text-2); word-break: break-all; }
  .list { flex: 1; overflow-y: auto; padding: 12px; background: var(--surface-2); }
  .hint { color: var(--text-2); font-size: 13px; }
  .item { display: grid; justify-items: center; gap: 4px; margin-bottom: 12px; cursor: pointer; border-radius: var(--radius-sm); touch-action: manipulation; }
  .item:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  /* Read only: the small pages never take the pen, a tap means "go there". */
  .sheet, .sheet :global(*) { pointer-events: none !important; }
  .sheet :global(.page) { margin: 0; }
  .label { font-size: 12px; color: var(--text-2); font-variant-numeric: tabular-nums; }
  /* Phones: a bottom sheet over the reader with its own scroll. */
  @media (max-width: 699px) {
    .important {
      position: fixed; left: 0; right: 0; bottom: 0; width: auto; height: 55vh; z-index: 25; border-left: 0;
      border-top: 1px solid var(--border); border-radius: 12px 12px 0 0; box-shadow: 0 -8px 28px rgb(0 0 0 / 0.16);
    }
  }
</style>
