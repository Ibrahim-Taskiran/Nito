<script lang="ts">
  import { Eye, Trash2 } from "@lucide/svelte";
  import { isTapeSized, rectFrom, tapeAt, type PageRect, type Tape } from "../../core/pageTools";
  import { isInkTool, type Reader } from "../reader.svelte";

  /** Tape: cover an area to test yourself, tap to see it again. Drawn with the "Bant" tool. */
  let { reader, page }: { reader: Reader; page: number } = $props();

  let layer: HTMLDivElement;
  let drag = $state<{ from: { x: number; y: number }; rect: PageRect } | null>(null);

  const tools = $derived(reader.tools);
  const tapes = $derived(tools.layers.tape ? tools.tapes.filter((t) => t.page === page) : []);
  const b = $derived(tools.bounds(page));
  const taping = $derived(reader.inkTool === "tape");
  /** While a pen draws, tapes let the pen through. */
  const inert = $derived(isInkTool(reader.inkTool));

  const pos = (r: PageRect) =>
    `left:${(r.x / b.w) * 100}%;top:${(r.y / b.h) * 100}%;width:${(r.w / b.w) * 100}%;height:${(r.h / b.h) * 100}%`;

  function at(e: PointerEvent) {
    const r = layer.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * b.w, y: ((e.clientY - r.top) / r.height) * b.h };
  }

  function down(e: PointerEvent) {
    if (!taping || e.button > 0) return;
    e.preventDefault();
    layer.setPointerCapture(e.pointerId);
    const p = at(e);
    drag = { from: p, rect: rectFrom(p, p, b) };
  }

  function move(e: PointerEvent) {
    if (drag) drag.rect = rectFrom(drag.from, at(e), b);
  }

  function up(e: PointerEvent) {
    const d = drag;
    drag = null;
    if (!d) return;
    if (isTapeSized(d.rect)) void tools.addTape(page, d.rect);
    else {
      // A tap, not a drag: open or cover the tape under it.
      const hit = tapeAt(tapes, at(e));
      if (hit) void tools.toggleTape(hit.id);
    }
  }

  function toggle(e: MouseEvent, t: Tape) {
    e.stopPropagation();
    void tools.toggleTape(t.id);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tapes" class:taping class:inert bind:this={layer} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={() => (drag = null)}>
  {#each tapes as t (t.id)}
    <div class="tape" class:open={t.revealed} class:covered={!t.revealed} style={pos(t)} data-tape={t.id}>
      {#if t.revealed}
        <button class="tab" aria-label="Bandı kapat" title="Bandı kapat" onpointerdown={(e) => e.stopPropagation()}
          onclick={(e) => toggle(e, t)}><Eye size={16} /></button>
      {:else}
        <!-- In tape mode taps reach the layer, so a drag that starts on a tape still draws a new one. -->
        <button class="cover" aria-label="Bandı aç" title="Bandı aç" tabindex={taping ? -1 : 0} onclick={(e) => toggle(e, t)}></button>
      {/if}
      {#if taping}
        <button class="del" aria-label="Bandı sil" title="Bandı sil" onpointerdown={(e) => e.stopPropagation()}
          onclick={(e) => { e.stopPropagation(); void tools.removeTape(t.id); }}><Trash2 size={16} /></button>
      {/if}
    </div>
  {/each}
  {#if drag}<div class="tape draft" style={pos(drag.rect)}></div>{/if}
</div>

<style>
  .tapes { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
  .tapes.taping { pointer-events: auto; touch-action: none; cursor: crosshair; }
  .tape { position: absolute; border-radius: 3px; }
  .covered {
    background: repeating-linear-gradient(-45deg, #e9dcb0 0 10px, #e2d3a2 10px 20px);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.18);
  }
  .cover {
    position: absolute; inset: 0; width: 100%; height: 100%; border: 0; padding: 0; background: transparent;
    pointer-events: auto; cursor: pointer; touch-action: manipulation; border-radius: inherit;
  }
  .taping .cover { pointer-events: none; }
  .del { pointer-events: auto; }
  .open { outline: 1.5px dashed #c8b67a; outline-offset: -1px; background: rgb(233 220 176 / 0.12); }
  .draft { outline: 2px dashed var(--accent); background: rgb(233 220 176 / 0.55); }
  .inert .cover, .inert .tab { pointer-events: none; }
  .tab, .del {
    position: absolute; width: var(--hit); height: var(--hit); display: grid; place-items: center; cursor: pointer;
    border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text-2);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.14); touch-action: manipulation; padding: 0;
  }
  .tab { left: 0; top: 0; transform: translate(-30%, -30%); pointer-events: auto; opacity: 0.85; }
  .del { right: 0; top: 0; transform: translate(30%, -30%); color: var(--danger); }
</style>
