<script lang="ts">
  import { IDENTITY, applyBox, scaleFromCorner, type Box, type Transform } from "../../core/selection";
  import type { Reader } from "../reader.svelte";

  /** Box around the lasso selection on one page: drag inside to move, corner handles to scale. */
  let { reader, page }: { reader: Reader; page: number } = $props();

  let layer: HTMLDivElement;
  let w = $state(0);
  let h = $state(0);
  const edit = $derived(reader.edit);
  const b = $derived(reader.tools.bounds(page));
  const on = $derived(reader.inkTool === "select" && edit.selection?.page === page);
  const base = $derived.by(() => {
    void reader.ink;
    void reader.images;
    void reader.tools.notes;
    return on ? edit.box() : null;
  });
  const box = $derived(base ? applyBox(edit.preview, base) : null);
  const px = (r: Box) => ({ left: (r.x / b.w) * w, top: (r.y / b.h) * h, width: (r.w / b.w) * w, height: (r.h / b.h) * h });
  const rect = $derived(box ? px(box) : null);

  let drag: { id: number; mode: "move" | 0 | 1 | 2 | 3; x0: number; y0: number; from: Box } | null = null;

  /** Page units of a screen point. */
  function pt(e: PointerEvent) {
    const r = layer.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * b.w, y: ((e.clientY - r.top) / r.height) * b.h };
  }

  function start(e: PointerEvent, mode: "move" | 0 | 1 | 2 | 3) {
    if (e.button > 0 || !base || drag) return;
    // Palm rules apply here too: a resting hand while the pen is down moves nothing.
    const d = edit.gate.down({ id: e.pointerId, type: e.pointerType, width: e.width, height: e.height, t: e.timeStamp });
    if (d.action === "ignore") return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = pt(e);
    drag = { id: e.pointerId, mode, x0: p.x, y0: p.y, from: base };
  }

  function move(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const p = pt(e);
    const t: Transform = drag.mode === "move" ? { ...IDENTITY, dx: p.x - drag.x0, dy: p.y - drag.y0 } : scaleFromCorner(drag.from, drag.mode, p);
    edit.setPreview(t);
  }

  function end(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    edit.gate.up(e.pointerId, e.pointerType, e.timeStamp);
    drag = null;
    void edit.commit();
  }

  const CORNERS = [
    { c: 0, name: "sol üst", cls: "tl" },
    { c: 1, name: "sağ üst", cls: "tr" },
    { c: 2, name: "sağ alt", cls: "br" },
    { c: 3, name: "sol alt", cls: "bl" },
  ] as const;
</script>

<div class="sel-layer" bind:this={layer} bind:clientWidth={w} bind:clientHeight={h}>
  {#if rect}
    <div class="box" role="group" aria-label="Seçim" style:left="{rect.left}px" style:top="{rect.top}px"
      style:width="{rect.width}px" style:height="{rect.height}px">
      <button class="body" aria-label="Seçimi taşı" onpointerdown={(e) => start(e, "move")} onpointermove={move}
        onpointerup={end} onpointercancel={end}></button>
      {#each CORNERS as k (k.c)}
        <button class="handle {k.cls}" aria-label="Boyutlandır ({k.name})" onpointerdown={(e) => start(e, k.c)}
          onpointermove={move} onpointerup={end} onpointercancel={end}><span></span></button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .sel-layer { position: absolute; inset: 0; pointer-events: none; z-index: 4; }
  .box { position: absolute; outline: 1.5px dashed var(--accent); outline-offset: 2px; }
  .body {
    position: absolute; inset: 0; pointer-events: auto; border: 0; padding: 0; background: color-mix(in srgb, var(--accent) 6%, transparent);
    cursor: move; touch-action: none; min-width: 0; min-height: 0;
  }
  /* 40px touch target, 14px visible dot. */
  .handle {
    position: absolute; width: 40px; height: 40px; margin: -20px; pointer-events: auto; border: 0; padding: 0;
    background: transparent; touch-action: none; display: grid; place-items: center;
  }
  .handle span { width: 14px; height: 14px; border-radius: 50%; background: var(--surface); border: 2px solid var(--accent); }
  .tl { left: 0; top: 0; cursor: nwse-resize; }
  .tr { left: 100%; top: 0; cursor: nesw-resize; }
  .br { left: 100%; top: 100%; cursor: nwse-resize; }
  .bl { left: 0; top: 100%; cursor: nesw-resize; }
</style>
