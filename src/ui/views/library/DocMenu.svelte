<script lang="ts" module>
  export type DocAction = "rename" | "move" | "week" | "delete";
</script>

<script lang="ts">
  import { BookOpen, CalendarDays, CircleCheck, Circle, FolderInput, Pencil, Star, Trash2 } from "@lucide/svelte";
  import { onMount, tick } from "svelte";
  import type { Document } from "../../../core/types";
  import type { Library } from "../../library.svelte";

  /** Per-document action menu (⋮ button or right click), placed at x/y and kept on screen. */
  let { lib, doc, x, y, onaction, onclose }: {
    lib: Library; doc: Document; x: number; y: number;
    onaction: (a: DocAction, d: Document) => void; onclose: () => void;
  } = $props();
  let el: HTMLDivElement;
  let pos = $state({ left: 0, top: 0 });

  const run = (f: () => unknown) => () => { onclose(); void f(); };
  const items = $derived([
    { label: "Aç", Icon: BookOpen, act: run(() => lib.resume(doc)) },
    { label: "Yeniden adlandır", Icon: Pencil, act: run(() => onaction("rename", doc)) },
    { label: "Derse taşı", Icon: FolderInput, act: run(() => onaction("move", doc)) },
    { label: "Hafta değiştir", Icon: CalendarDays, act: run(() => onaction("week", doc)) },
    doc.readStatus === "read"
      ? { label: "Okunmadı olarak işaretle", Icon: Circle, act: run(() => lib.setReadStatus(doc, "unread")) }
      : { label: "Okundu olarak işaretle", Icon: CircleCheck, act: run(() => lib.setReadStatus(doc, "read")) },
    { label: doc.favorite ? "Favorilerden çıkar" : "Favorilere ekle", Icon: Star, act: run(() => lib.toggleFavorite(doc)) },
    { label: "Sil", Icon: Trash2, act: run(() => onaction("delete", doc)), danger: true },
  ]);

  onMount(async () => {
    await tick();
    const r = el.getBoundingClientRect();
    // Prefer opening below-left of the anchor (⋮ is on the right edge of a card).
    let left = x - r.width;
    if (left < 8) left = Math.min(x, innerWidth - r.width - 8);
    let top = y;
    if (top + r.height > innerHeight - 8) top = Math.max(8, y - r.height - 8);
    pos = { left: Math.max(8, left), top };
    el.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") return onclose();
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const all = [...el.querySelectorAll<HTMLElement>("[role=menuitem]")];
    const i = all.indexOf(document.activeElement as HTMLElement);
    all[(i + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]?.focus();
  }
</script>

<svelte:window onkeydown={onkeydown} onresize={onclose} />
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="catch" onclick={onclose} oncontextmenu={(e) => { e.preventDefault(); onclose(); }}></div>
<div class="menu" role="menu" aria-label="Belge işlemleri" bind:this={el} style:left="{pos.left}px" style:top="{pos.top}px">
  {#each items as it, i (it.label)}
    {#if it.danger}<div class="sep" role="separator"></div>{/if}
    <button role="menuitem" class:danger={it.danger} class:first={i === 0} onclick={it.act}>
      <it.Icon size={16} strokeWidth={1.8} aria-hidden="true" /><span>{it.label}</span>
    </button>
  {/each}
</div>

<style>
  .catch { position: fixed; inset: 0; z-index: 8; }
  .menu {
    position: fixed; z-index: 9; min-width: 220px; padding: 6px; background: var(--surface);
    border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 10px 32px rgb(0 0 0 / 0.16);
  }
  button {
    display: flex; align-items: center; gap: 10px; width: 100%; min-height: 36px; padding: 0 10px;
    border: 0; background: transparent; border-radius: 6px; cursor: pointer; text-align: left; color: var(--text);
  }
  button :global(svg) { color: var(--text-2); flex: none; }
  button:hover, button:focus-visible { background: var(--surface-2); outline: none; }
  .first { font-weight: 600; }
  .danger, .danger :global(svg) { color: var(--danger); }
  .sep { height: 1px; background: var(--border); margin: 6px 4px; }
</style>
