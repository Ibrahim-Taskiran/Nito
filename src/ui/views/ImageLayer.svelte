<script lang="ts">
  import { Trash2 } from "@lucide/svelte";
  import { moveRect, resizeRect, type ImageRect } from "../../core/pageImage";
  import type { Reader } from "../reader.svelte";

  let { reader, page }: { reader: Reader; page: number } = $props();

  let layer: HTMLDivElement;
  /** Rect while dragging; written to the database on release. */
  let drag = $state<{ id: number; mode: "move" | "resize"; x0: number; y0: number; from: ImageRect; rect: ImageRect } | null>(null);

  const images = $derived(reader.images.filter((i) => i.page === page));
  const rectOf = (i: { id: number } & ImageRect): ImageRect => (drag?.id === i.id ? drag.rect : i);

  function start(e: PointerEvent, img: { id: number } & ImageRect, mode: "move" | "resize") {
    if (e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    reader.selectedImageId = img.id;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const from = { x: img.x, y: img.y, w: img.w, h: img.h };
    drag = { id: img.id, mode, x0: e.clientX, y0: e.clientY, from, rect: from };
  }

  function move(e: PointerEvent) {
    if (!drag) return;
    const r = layer.getBoundingClientRect();
    const dx = (e.clientX - drag.x0) / r.width;
    const dy = (e.clientY - drag.y0) / r.height;
    drag.rect = drag.mode === "move" ? moveRect(drag.from, dx, dy) : resizeRect(drag.from, dx);
  }

  function end() {
    const d = drag;
    drag = null;
    if (!d) return;
    const moved = ["x", "y", "w", "h"].some((k) => d.rect[k as keyof ImageRect] !== d.from[k as keyof ImageRect]);
    if (moved) void reader.moveImage(d.id, d.rect);
  }

  function onKey(e: KeyboardEvent) {
    const id = reader.selectedImageId;
    if (id == null || !images.some((i) => i.id === id)) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest("input, textarea, [contenteditable]")) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      void reader.removeImage(id);
    } else if (e.key === "Escape") {
      e.preventDefault(); // the reader must not also close
      reader.selectedImageId = null;
    }
  }

  function onDocDown(e: PointerEvent) {
    // A click anywhere else drops the selection.
    if (reader.selectedImageId != null && !(e.target as HTMLElement).closest?.(".pimg")) reader.selectedImageId = null;
  }
</script>

<svelte:window onkeydown={onKey} onpointerdown={onDocDown} />

<div class="images" bind:this={layer}>
  {#each images as img (img.id)}
    {@const r = rectOf(img)}
    {@const selected = reader.selectedImageId === img.id}
    <div class="pimg" class:selected role="img" aria-label="Eklenen resim"
      style:left="{r.x * 100}%" style:top="{r.y * 100}%" style:width="{r.w * 100}%" style:height="{r.h * 100}%"
      onpointerdown={(e) => start(e, img, "move")} onpointermove={move} onpointerup={end} onpointercancel={end}>
      {#if reader.imageUrls.get(img.filePath)}
        <img src={reader.imageUrls.get(img.filePath)} alt="" draggable="false" />
      {/if}
      {#if selected}
        <button class="del" aria-label="Resmi sil" title="Resmi sil (Delete)"
          onpointerdown={(e) => e.stopPropagation()} onclick={() => reader.removeImage(img.id)}><Trash2 size={16} /></button>
        <span class="handle" aria-label="Boyutlandır" role="slider" aria-valuenow={Math.round(r.w * 100)} tabindex="-1"
          onpointerdown={(e) => start(e, img, "resize")} onpointermove={move} onpointerup={end} onpointercancel={end}></span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .images { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
  .pimg { position: absolute; pointer-events: auto; cursor: grab; touch-action: none; user-select: none; }
  .pimg:active { cursor: grabbing; }
  .pimg img { width: 100%; height: 100%; display: block; object-fit: contain; pointer-events: none; }
  .pimg.selected { outline: 2px solid var(--accent); outline-offset: 1px; }
  .handle {
    position: absolute; right: -9px; bottom: -9px; width: 18px; height: 18px; border-radius: 50%;
    background: var(--surface); border: 2px solid var(--accent); cursor: nwse-resize; touch-action: none;
  }
  .handle::after { content: ""; position: absolute; inset: -10px; } /* bigger touch target */
  .del {
    position: absolute; top: -40px; right: 0; width: 34px; height: 34px; display: grid; place-items: center;
    border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--danger);
    cursor: pointer; box-shadow: 0 2px 8px rgb(0 0 0 / 0.14);
  }
  .del:hover { background: var(--surface-2); }
</style>
