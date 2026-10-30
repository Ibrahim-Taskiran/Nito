<script lang="ts">
  import { Check, Minimize2, Pencil, StickyNote, Trash2 } from "@lucide/svelte";
  import { tick } from "svelte";
  import { moveWithin, resizeWithin, type PageNote, type PageRect } from "../../core/pageTools";
  import RichText from "../components/RichText.svelte";
  import { longPress } from "../longpress";
  import { isInkTool, type Reader } from "../reader.svelte";

  /** Text boxes and sticky notes on a page. The "Metin" and "Not" tools place a new one where you tap. */
  let { reader, page }: { reader: Reader; page: number } = $props();

  let layer: HTMLDivElement;
  let drag = $state<{ id: number; mode: "move" | "resize"; x0: number; y0: number; from: PageRect; rect: PageRect } | null>(null);
  let draft = $state("");
  let editor = $state<HTMLTextAreaElement>();

  const tools = $derived(reader.tools);
  const notes = $derived(tools.layers.notes ? tools.notes.filter((n) => n.page === page) : []);
  const b = $derived(tools.bounds(page));
  const placing = $derived(reader.inkTool === "text" || reader.inkTool === "note");
  const inert = $derived(isInkTool(reader.inkTool) || reader.inkTool === "tape");
  const rectOf = (n: PageNote): PageRect => (drag?.id === n.id ? drag.rect : n);
  const pos = (r: PageRect) =>
    `left:${(r.x / b.w) * 100}%;top:${(r.y / b.h) * 100}%;width:${(r.w / b.w) * 100}%;height:${(r.h / b.h) * 100}%`;

  async function place(e: MouseEvent) {
    if (!placing) return;
    const r = layer.getBoundingClientRect();
    const at = { x: ((e.clientX - r.left) / r.width) * b.w, y: ((e.clientY - r.top) / r.height) * b.h };
    const kind = reader.inkTool === "note" ? "sticky" : "text";
    reader.inkTool = "none";
    await tools.addNote(page, kind, at);
    await startEdit(tools.editingNoteId!);
  }

  async function startEdit(id: number) {
    const n = tools.notes.find((x) => x.id === id);
    if (!n) return;
    if (tools.editingNoteId !== id) await finishEdit();
    tools.selectedNoteId = id;
    tools.editingNoteId = id;
    draft = n.body;
    await tick();
    editor?.focus();
  }

  async function finishEdit() {
    const id = tools.editingNoteId;
    if (id == null) return;
    tools.editingNoteId = null;
    const n = tools.notes.find((x) => x.id === id);
    if (n && n.body !== draft) await tools.updateNote(id, { body: draft });
  }

  function start(e: PointerEvent, n: PageNote, mode: "move" | "resize") {
    if (e.button > 0 || tools.editingNoteId === n.id) return;
    if ((e.target as HTMLElement).closest("button, textarea")) return;
    e.stopPropagation();
    if (tools.editingNoteId != null) void finishEdit();
    tools.selectedNoteId = n.id;
    reader.selectedImageId = null;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const from = { x: n.x, y: n.y, w: n.w, h: n.h };
    drag = { id: n.id, mode, x0: e.clientX, y0: e.clientY, from, rect: from };
  }

  function move(e: PointerEvent) {
    if (!drag) return;
    const r = layer.getBoundingClientRect();
    const dx = ((e.clientX - drag.x0) / r.width) * b.w;
    const dy = ((e.clientY - drag.y0) / r.height) * b.h;
    drag.rect = drag.mode === "move" ? moveWithin(drag.from, dx, dy, b) : resizeWithin(drag.from, dx, dy, b);
  }

  function end() {
    const d = drag;
    drag = null;
    if (!d) return;
    const r = d.rect;
    if (r.x !== d.from.x || r.y !== d.from.y || r.w !== d.from.w || r.h !== d.from.h) {
      void tools.updateNote(d.id, { x: r.x, y: r.y, w: r.w, h: r.h });
    }
  }

  function onEditorKey(e: KeyboardEvent) {
    if (e.key === "Escape" || ((e.ctrlKey || e.metaKey) && e.key === "Enter")) {
      e.preventDefault(); // the reader must not close
      void finishEdit();
    }
  }

  function onKey(e: KeyboardEvent) {
    const id = tools.selectedNoteId;
    if (id == null || tools.editingNoteId != null || !notes.some((n) => n.id === id)) return;
    if ((e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable]")) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      void tools.removeNote(id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      tools.selectedNoteId = null;
    } else if (e.key === "Enter") {
      e.preventDefault();
      void startEdit(id);
    }
  }

  function onDocDown(e: PointerEvent) {
    const inside = (e.target as HTMLElement).closest?.(".pnote");
    if (inside && layer.contains(inside)) return;
    if (!notes.some((n) => n.id === tools.selectedNoteId || n.id === tools.editingNoteId)) return;
    void finishEdit();
    tools.selectedNoteId = null;
  }
</script>

<svelte:window onkeydown={onKey} onpointerdown={onDocDown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="notes" class:placing class:inert bind:this={layer} onclick={place}>
  {#each notes as n (n.id)}
    {@const r = rectOf(n)}
    {@const selected = tools.selectedNoteId === n.id}
    {@const editing = tools.editingNoteId === n.id}
    {#if n.kind === "sticky" && n.collapsed && !editing}
      <button class="pnote icon" style:left="{(r.x / b.w) * 100}%" style:top="{(r.y / b.h) * 100}%" aria-label="Notu aç" title="Notu aç"
        onclick={(e) => { e.stopPropagation(); void tools.updateNote(n.id, { collapsed: false }); }}><StickyNote size={20} /></button>
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="pnote {n.kind}" class:selected class:editing class:empty={!n.body.trim()} style={pos(r)} data-note={n.id}
        aria-label={n.kind === "sticky" ? "Yapışkan not" : "Metin kutusu"} role="group"
        onpointerdown={(e) => start(e, n, "move")} onpointermove={move} onpointerup={end} onpointercancel={end}
        ondblclick={() => startEdit(n.id)} {@attach longPress(() => void startEdit(n.id))}>
        {#if editing}
          <textarea bind:this={editor} bind:value={draft} aria-label="Not metni" onkeydown={onEditorKey}
            placeholder={"Metin, $x^2$ gibi LaTeX ya da ``` kod bloğu"}></textarea>
        {:else}
          <div class="body"><RichText src={n.body} /></div>
        {/if}
        {#if selected}
          <div class="bar" role="toolbar" aria-label="Not araçları">
            {#if editing}
              <button aria-label="Bitti" title="Bitti (Ctrl+Enter)" onclick={() => finishEdit()}><Check size={16} /></button>
            {:else}
              <button aria-label="Düzenle" title="Düzenle (çift tıkla)" onclick={() => startEdit(n.id)}><Pencil size={16} /></button>
            {/if}
            {#if n.kind === "sticky"}
              <button aria-label="Notu küçült" title="Simgeye küçült"
                onclick={async () => { await finishEdit(); await tools.updateNote(n.id, { collapsed: true }); tools.selectedNoteId = null; }}>
                <Minimize2 size={16} /></button>
            {/if}
            <button class="danger" aria-label="Notu sil" title="Sil (Delete)" onclick={() => tools.removeNote(n.id)}><Trash2 size={16} /></button>
          </div>
          {#if !editing}
            <span class="handle" aria-label="Boyutlandır" role="slider" aria-valuenow={Math.round(r.w * 100)} tabindex="-1"
              onpointerdown={(e) => { e.stopPropagation(); start(e, n, "resize"); }} onpointermove={move} onpointerup={end} onpointercancel={end}></span>
          {/if}
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .notes { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
  .notes.placing { pointer-events: auto; cursor: text; }
  .notes.inert .pnote { pointer-events: none; }
  .pnote { position: absolute; pointer-events: auto; touch-action: none; user-select: none; color: #1f2429; }
  .pnote.text { padding: 4px 6px; border-radius: 4px; cursor: grab; }
  .pnote.text.empty, .pnote.text.selected { outline: 1px dashed #9aa3ad; }
  .pnote.sticky {
    padding: 8px 10px; border-radius: 4px; cursor: grab; background: #fff3a8; box-shadow: 0 2px 8px rgb(0 0 0 / 0.16);
  }
  .pnote.selected { outline: 2px solid var(--accent); outline-offset: 1px; }
  .pnote.editing { cursor: auto; }
  .body { width: 100%; height: 100%; overflow: auto; }
  textarea {
    width: 100%; height: 100%; min-height: 48px; resize: none; border: 0; outline: 0; padding: 0; background: transparent;
    font: 13px/1.45 ui-monospace, "Cascadia Mono", Consolas, monospace; color: inherit; user-select: text; touch-action: auto;
  }
  .icon {
    width: var(--hit); height: var(--hit); display: grid; place-items: center; border: 0; border-radius: 50%; padding: 0;
    background: #fff3a8; color: #6b5a10; box-shadow: 0 2px 8px rgb(0 0 0 / 0.2); cursor: pointer; touch-action: manipulation;
  }
  .bar {
    position: absolute; right: 0; bottom: 100%; margin-bottom: 6px; display: flex; gap: 2px; padding: 2px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: 0 2px 8px rgb(0 0 0 / 0.14);
  }
  .bar button {
    width: var(--hit); height: var(--hit); display: grid; place-items: center; border: 0; border-radius: 6px; padding: 0;
    background: transparent; color: var(--text-2); cursor: pointer; touch-action: manipulation;
  }
  .bar button:hover { background: var(--surface-2); color: var(--text); }
  .bar .danger { color: var(--danger); }
  .handle {
    position: absolute; right: -9px; bottom: -9px; width: 18px; height: 18px; border-radius: 50%;
    background: var(--surface); border: 2px solid var(--accent); cursor: nwse-resize; touch-action: none;
  }
  .handle::after { content: ""; position: absolute; inset: -11px; }
</style>
