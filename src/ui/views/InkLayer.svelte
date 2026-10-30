<script lang="ts">
  import { INK_KINDS, strokePath, strokeWidth, type InkPoint } from "../../core/ink";
  import type { Reader } from "../reader.svelte";

  let { reader, page }: { reader: Reader; page: number } = $props();

  /** The laser stays this long after the pen lifts, fading out (CSS animation of the same length). */
  const LASER_MS = 1800;
  const LASER_WIDTH = 0.0035;

  let svg: SVGSVGElement;
  let w = $state(0);
  let h = $state(0);
  let live = $state<InkPoint[] | null>(null);
  /** Laser lines that are fading out. Never saved. */
  let fading = $state<{ id: number; points: InkPoint[] }[]>([]);
  let fadeId = 0;
  /** After a stylus is seen, fingers scroll instead of drawing (palm and finger stay free). */
  let penSeen = false;

  const strokes = $derived(reader.ink.filter((s) => s.page === page));
  const marker = $derived(strokes.filter((s) => s.kind === "highlighter"));
  const lines = $derived(strokes.filter((s) => s.kind !== "highlighter"));
  const drawing = $derived(reader.inkTool !== "none");
  const tool = $derived(reader.inkTool);

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
    if (tool === "eraser") void reader.eraseAt(page, at(e));
    else live = [at(e)];
  }

  function move(e: PointerEvent) {
    if (scrollFrom) {
      svg.closest(".scroller")?.scrollBy(scrollFrom.x - e.clientX, scrollFrom.y - e.clientY);
      scrollFrom = { x: e.clientX, y: e.clientY };
      return;
    }
    if (!svg.hasPointerCapture(e.pointerId)) return;
    if (tool === "eraser") void reader.eraseAt(page, at(e));
    else if (live) live = [...live, ...(e.getCoalescedEvents?.() ?? [e]).map(at)];
  }

  function up() {
    scrollFrom = null;
    const pts = live;
    live = null;
    if (!pts) return;
    if (tool === "laser") {
      const id = ++fadeId;
      fading = [...fading, { id, points: pts }];
      setTimeout(() => (fading = fading.filter((f) => f.id !== id)), LASER_MS);
    } else {
      void reader.addStroke(page, pts);
    }
  }

  const liveKind = $derived(tool === "pen" || tool === "pencil" || tool === "highlighter" ? tool : null);
  const laserW = $derived(Math.max(2, LASER_WIDTH * w));
</script>

<!-- Highlighter: below the text look, multiplied with the page so black text stays black. -->
<svg class="ink under" viewBox="0 0 {w || 1} {h || 1}" aria-hidden="true">
  {#each marker as s (s.id)}
    <path class="hl" d={strokePath(s.points, w, h)} stroke={s.color} stroke-opacity={INK_KINDS.highlighter.opacity}
      stroke-width={strokeWidth(s, w)} />
  {/each}
  {#if live && liveKind === "highlighter"}
    <path class="hl" d={strokePath(live, w, h)} stroke={reader.inkColor} stroke-opacity={INK_KINDS.highlighter.opacity}
      stroke-width={strokeWidth({ kind: "highlighter", width: reader.inkWidth, points: live }, w)} />
  {/if}
</svg>

<svg bind:this={svg} class="ink" class:drawing class:erase={tool === "eraser"} bind:clientWidth={w} bind:clientHeight={h}
  viewBox="0 0 {w || 1} {h || 1}" role="presentation"
  onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
  <defs>
    <!-- Pencil grain: noise punches small holes into the line, like graphite on paper. -->
    <filter id="pencil-grain" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="3" result="noise" />
      <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.45" result="mask" />
      <feComposite in="SourceGraphic" in2="mask" operator="in" />
    </filter>
  </defs>
  {#each lines as s (s.id)}
    <path d={strokePath(s.points, w, h)} stroke={s.color} stroke-opacity={INK_KINDS[s.kind].opacity}
      stroke-width={strokeWidth(s, w)} data-kind={s.kind} filter={s.kind === "pencil" ? "url(#pencil-grain)" : undefined} />
  {/each}
  {#if live && (liveKind === "pen" || liveKind === "pencil")}
    <path d={strokePath(live, w, h)} stroke={reader.inkColor} stroke-opacity={INK_KINDS[liveKind].opacity}
      stroke-width={strokeWidth({ width: reader.inkWidth, points: live }, w)}
      filter={liveKind === "pencil" ? "url(#pencil-grain)" : undefined} />
  {/if}
  {#if live && tool === "laser"}
    <g class="laser"><path d={strokePath(live, w, h)} stroke-width={laserW} /><path class="core" d={strokePath(live, w, h)} stroke-width={laserW / 3} /></g>
  {/if}
  {#each fading as f (f.id)}
    <g class="laser fade" style:animation-duration="{LASER_MS}ms">
      <path d={strokePath(f.points, w, h)} stroke-width={laserW} /><path class="core" d={strokePath(f.points, w, h)} stroke-width={laserW / 3} />
    </g>
  {/each}
</svg>

<style>
  .ink { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2; overflow: visible; }
  .ink.under { z-index: 1; mix-blend-mode: multiply; }
  .ink.drawing { pointer-events: auto; touch-action: none; cursor: crosshair; }
  .ink.erase { cursor: cell; }
  path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  path.hl { stroke-linecap: butt; }
  .laser path { stroke: #ff3b5c; filter: drop-shadow(0 0 3px #ff3b5c) drop-shadow(0 0 7px rgb(255 59 92 / 0.6)); }
  .laser path.core { stroke: #fff4f6; filter: none; }
  .laser.fade { animation: laser-fade linear forwards; }
  @keyframes laser-fade { 0%, 35% { opacity: 1; } 100% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .laser.fade { animation: none; } }
</style>
