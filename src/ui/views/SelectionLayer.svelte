<script lang="ts">
  import { IDENTITY, applyBox, scaleFromCorner, type Box, type Transform } from "../../core/selection";
  import type { Reader } from "../reader.svelte";

  /** Box around the lasso selection on one page: drag inside to move (also onto another page), corner handles to scale. */
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

  /** `px` is the press point in screen pixels from the page corner, for a drop on another page. */
  let drag: { id: number; mode: "move" | 0 | 1 | 2 | 3; x0: number; y0: number; from: Box; px: { x: number; y: number } } | null = null;

  const rectOf = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };

  /** The other page of this reader under a screen point, if any. */
  function pageAt(x: number, y: number): { key: number; el: Element } | null {
    const all = (layer.closest(".scroller") ?? document).querySelectorAll(".sel-layer[data-sel-page]");
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (el !== layer && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { key: Number((el as HTMLElement).dataset.selPage), el };
    }
    return null;
  }

  /** Near the top or bottom edge while carrying a selection: scroll, so a far page can be reached. */
  function edgeScroll(y: number) {
    const s = layer.closest(".scroller");
    if (!s) return;
    const r = s.getBoundingClientRect();
    if (y > r.bottom - 48) s.scrollTop += 16;
    else if (y < r.top + 48) s.scrollTop -= 16;
  }

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
    const r = layer.getBoundingClientRect();
    drag = { id: e.pointerId, mode, x0: p.x, y0: p.y, from: base, px: { x: e.clientX - r.left, y: e.clientY - r.top } };
  }

  function move(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const p = pt(e);
    if (drag.mode !== "move") return edit.setPreview(scaleFromCorner(drag.from, drag.mode, p));
    const t: Transform = { ...IDENTITY, dx: p.x - drag.x0, dy: p.y - drag.y0 };
    const other = pageAt(e.clientX, e.clientY);
    edit.dropPage = other?.key ?? null;
    // Over another page the box follows the pen freely; it lands there on release.
    if (other) edit.preview = t;
    else edit.setPreview(t);
    edgeScroll(e.clientY);
  }

  function end(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    edit.gate.up(e.pointerId, e.pointerType, e.timeStamp);
    const d = drag;
    drag = null;
    edit.dropPage = null;
    const other = d.mode === "move" && e.type === "pointerup" ? pageAt(e.clientX, e.clientY) : null;
    if (!other) return void edit.commit();
    const from = rectOf(layer);
    const shift = { x: e.clientX - from.x - d.px.x, y: e.clientY - from.y - d.px.y };
    void edit.moveTo(other.key, { rect: from, bounds: b }, { rect: rectOf(other.el), bounds: reader.tools.bounds(other.key) }, shift);
  }

  const CORNERS = [
    { c: 0, name: "sol üst", cls: "tl" },
    { c: 1, name: "sağ üst", cls: "tr" },
    { c: 2, name: "sağ alt", cls: "br" },
    { c: 3, name: "sol alt", cls: "bl" },
  ] as const;
</script>

<div class="sel-layer" class:drop={edit.dropPage === page} data-sel-page={page} bind:this={layer} bind:clientWidth={w} bind:clientHeight={h}>
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
  .drop { outline: 2px dashed var(--accent); outline-offset: -2px; background: color-mix(in srgb, var(--accent) 5%, transparent); }
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
