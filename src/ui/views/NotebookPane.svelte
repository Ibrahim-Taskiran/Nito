<script lang="ts">
  import { onMount, tick } from "svelte";
  import { ArrowDown, ArrowUp, FilePlus, Trash2, X } from "@lucide/svelte";
  import { NOTEBOOK_SIZE, PAPER_KINDS, paperBackground, type PaperKind } from "../../core/notebook";
  import Button from "../components/Button.svelte";
  import Dialog from "../components/Dialog.svelte";
  import IconButton from "../components/IconButton.svelte";
  import MenuButton from "../components/MenuButton.svelte";
  import { Notebook } from "../notebook.svelte";
  import type { Reader } from "../reader.svelte";
  import InkLayer from "./InkLayer.svelte";
  import NoteLayer from "./NoteLayer.svelte";
  import SelectionLayer from "./SelectionLayer.svelte";

  /** Notebook beside the PDF: a resizable column on wide screens, the whole reader body on phones. Same pen tools. */
  let { reader, onclose }: { reader: Reader; onclose: () => void } = $props();

  const WIDTH_KEY = "nito.notebookWidth";
  const MIN_W = 280;
  // svelte-ignore state_referenced_locally
  const nb = new Notebook(reader);
  let scroller: HTMLDivElement;
  let innerW = $state(0);
  let width = $state(readWidth());
  let confirmRemove = $state<number | null>(null);
  let error = $state<string | null>(null);

  /** Pages fill the column width (minus the padding). */
  const pageW = $derived(Math.max(120, innerW - 32));
  const pageH = $derived((pageW * NOTEBOOK_SIZE.h) / NOTEBOOK_SIZE.w);
  const nameOf = (k: PaperKind) => PAPER_KINDS.find((p) => p.key === k)?.name ?? "";

  function readWidth(): number {
    try {
      const v = Number(localStorage.getItem(WIDTH_KEY));
      if (v >= MIN_W) return v;
    } catch { /* storage off */ }
    return Math.round(Math.max(MIN_W, window.innerWidth * 0.42));
  }

  onMount(() => {
    nb.load().catch((e) => (error = e instanceof Error ? e.message : String(e)));
  });

  async function add(kind: PaperKind) {
    const key = await nb.add(kind);
    await tick();
    scroller.querySelector(`[data-nb-page="${key}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  async function remove() {
    const key = confirmRemove;
    confirmRemove = null;
    if (key != null) await nb.remove(key);
  }

  // Drag the left edge to resize; the width is remembered on this device.
  let drag: { x: number; w: number } | null = null;
  function dragStart(e: PointerEvent) {
    drag = { x: e.clientX, w: width };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function dragMove(e: PointerEvent) {
    if (!drag) return;
    width = Math.round(Math.min(window.innerWidth - MIN_W, Math.max(MIN_W, drag.w - (e.clientX - drag.x))));
  }
  function dragEnd() {
    if (!drag) return;
    drag = null;
    try { localStorage.setItem(WIDTH_KEY, String(width)); } catch { /* storage off */ }
  }
  function onHandleKey(e: KeyboardEvent) {
    const d = e.key === "ArrowLeft" ? 24 : e.key === "ArrowRight" ? -24 : 0;
    if (!d) return;
    e.preventDefault();
    width = Math.min(window.innerWidth - MIN_W, Math.max(MIN_W, width + d));
    dragEnd();
  }
</script>

<aside class="notebook" style:width="{width}px" aria-label="Defter">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="handle" role="separator" aria-orientation="vertical" aria-label="Defter genişliği" aria-valuenow={width} tabindex="0"
    onpointerdown={dragStart} onpointermove={dragMove} onpointerup={dragEnd} onpointercancel={dragEnd} onkeydown={onHandleKey}></div>
  <header class="bar">
    <span class="title">Defter</span>
    <span class="count">{nb.pages.length} sayfa</span>
    <MenuButton label="Sayfa ekle" title="Deftere sayfa ekle">
      {#snippet icon()}<FilePlus size={18} />{/snippet}
      {#snippet children(close)}
        {#each PAPER_KINDS as p (p.key)}
          <button class="item" onclick={() => { close(); void add(p.key); }}>
            <span class="swatch" style:background-image={paperBackground(p.key, 160).image} style:background-size={paperBackground(p.key, 160).size}></span>{p.name}
          </button>
        {/each}
      {/snippet}
    </MenuButton>
    <IconButton label="Defteri kapat" onclick={onclose}><X size={18} /></IconButton>
  </header>
  <div class="scroller" bind:this={scroller} bind:clientWidth={innerW}>
    {#if error}
      <p class="msg">Defter açılamadı: {error}</p>
    {/if}
    {#each nb.pages as p, i (p.key)}
      {@const bg = paperBackground(p.kind, pageW)}
      <div class="page" data-nb-page={p.key} data-kind={p.kind} style:width="{pageW}px" style:height="{pageH}px"
        style:background-image={bg.image} style:background-size={bg.size}>
        <InkLayer {reader} page={p.key} />
        <SelectionLayer {reader} page={p.key} />
        <NoteLayer {reader} page={p.key} />
      </div>
      <div class="foot" style:width="{pageW}px">
        <span>{i + 1} · {nameOf(p.kind)}</span>
        <button class="mini" aria-label="Yukarı taşı" title="Yukarı taşı" disabled={i === 0} onclick={() => nb.move(p.key, -1)}><ArrowUp size={16} /></button>
        <button class="mini" aria-label="Aşağı taşı" title="Aşağı taşı" disabled={i === nb.pages.length - 1} onclick={() => nb.move(p.key, 1)}>
          <ArrowDown size={16} /></button>
        <button class="mini danger" aria-label="Sayfayı sil" title="Sayfayı sil" disabled={nb.pages.length < 2} onclick={() => (confirmRemove = p.key)}>
          <Trash2 size={16} /></button>
      </div>
    {/each}
  </div>
</aside>

{#if confirmRemove != null}
  <Dialog title="Defter sayfasını sil">
    <p>Bu sayfa üzerindeki yazı ve notlarla birlikte silinsin mi? Bu geri alınamaz.</p>
    {#snippet actions()}
      <Button variant="ghost" onclick={() => (confirmRemove = null)}>Vazgeç</Button>
      <Button variant="danger" onclick={remove}>Sil</Button>
    {/snippet}
  </Dialog>
{/if}

<style>
  .notebook {
    position: relative; flex: 0 0 auto; max-width: calc(100% - 200px); display: flex; flex-direction: column; min-height: 0;
    border-left: 1px solid var(--border); background: var(--bg);
  }
  .handle { position: absolute; left: -5px; top: 0; bottom: 0; width: 10px; cursor: col-resize; touch-action: none; z-index: 4; }
  .handle:hover, .handle:focus-visible { background: color-mix(in srgb, var(--accent) 30%, transparent); outline: 0; }
  .bar { display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 16px; border-bottom: 1px solid var(--border); background: var(--surface); }
  .title { font-weight: 700; font-size: 16px; letter-spacing: -0.01em; }
  .count { flex: 1; color: var(--text-2); font: 600 12px/1 var(--font-label); }
  .item { display: flex; align-items: center; gap: 10px; }
  .swatch { width: 28px; height: 28px; flex: none; border-radius: 4px; background-color: #fff; box-shadow: 0 0 0 1px var(--border); }
  .scroller { flex: 1; overflow: auto; padding: 16px; touch-action: pan-x pan-y; }
  .msg { color: var(--danger); text-align: center; }
  .page { position: relative; margin: 0 auto; background-color: #fff; box-shadow: var(--shadow-2); border-radius: 4px; }
  .foot { display: flex; align-items: center; gap: 2px; margin: 6px auto 18px; color: var(--text-2); font: 600 12px/1 var(--font-label); }
  .foot span { flex: 1; }
  .mini {
    width: var(--hit); height: var(--hit); display: grid; place-items: center; border: 0; border-radius: var(--radius-sm); padding: 0;
    background: transparent; color: var(--text-2); cursor: pointer; touch-action: manipulation;
  }
  .mini:hover:not(:disabled) { background: var(--surface); color: var(--text); }
  .mini:disabled { opacity: 0.35; cursor: default; }
  .mini.danger { color: var(--danger); }
  /* Phones and narrow panes: the notebook takes the whole reader body; closing it shows the PDF again. */
  @media (max-width: 760px) {
    .notebook { position: absolute; inset: 0; width: auto !important; max-width: none; border-left: 0; z-index: 5; }
    .handle { display: none; }
  }
</style>
