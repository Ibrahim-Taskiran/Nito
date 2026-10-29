<script lang="ts">
  import { INK_WIDTH, strokePath, strokeWidth, type InkPoint } from "../../core/ink";
  import type { Reader } from "../reader.svelte";

  let { reader, page }: { reader: Reader; page: number } = $props();

  let svg: SVGSVGElement;
  let w = $state(0);
  let h = $state(0);
  let live = $state<InkPoint[] | null>(null);
  /** After a stylus is seen, fingers scroll instead of drawing (palm and finger stay free). */
  let penSeen = false;

  const strokes = $derived(reader.ink.filter((s) => s.page === page));
  const drawing = $derived(reader.inkTool !== "none");

  function at(e: PointerEvent): InkPoint {
    const r = svg.getBoundingClientRect();
    const p = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, p };
  }

  let scrollFrom: { x: number; y: number } | null = null;

  function down(e: PointerEvent) {
    if (!drawing || e.button > 0) return;
    if (e.pointerType === "pen") penSeen = true;
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
    if (e.pointerType === "touch" && penSeen) {
      scrollFrom = { x: e.clientX, y: e.clientY };
      return;
    }
    if (reader.inkTool === "eraser") void reader.eraseAt(page, at(e));
    else live = [at(e)];
  }

  function move(e: PointerEvent) {
    if (scrollFrom) {
      svg.closest(".scroller")?.scrollBy(scrollFrom.x - e.clientX, scrollFrom.y - e.clientY);
      scrollFrom = { x: e.clientX, y: e.clientY };
      return;
    }
    if (!svg.hasPointerCapture(e.pointerId)) return;
    if (reader.inkTool === "eraser") void reader.eraseAt(page, at(e));
    else if (live) live = [...live, ...(e.getCoalescedEvents?.() ?? [e]).map(at)];
  }

  function up() {
    scrollFrom = null;
    if (live) void reader.addStroke(page, live);
    live = null;
  }
</script>

<svg bind:this={svg} class="ink" class:drawing class:erase={reader.inkTool === "eraser"} bind:clientWidth={w} bind:clientHeight={h}
  viewBox="0 0 {w || 1} {h || 1}" role="presentation"
  onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
  {#each strokes as s (s.id)}
    <path d={strokePath(s.points, w, h)} stroke={s.color} stroke-width={strokeWidth(s, w)} />
  {/each}
  {#if live}
    <path d={strokePath(live, w, h)} stroke={reader.inkColor} stroke-width={strokeWidth({ width: INK_WIDTH, points: live }, w)} />
  {/if}
</svg>

<style>
  .ink { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2; overflow: visible; }
  .ink.drawing { pointer-events: auto; touch-action: none; cursor: crosshair; }
  .ink.erase { cursor: cell; }
  path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
</style>
