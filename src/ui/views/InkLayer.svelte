<script lang="ts">
  import { INK_KINDS, strokePath, strokeWidth, type InkPoint, type InkStroke } from "../../core/ink";
  import { applyPoints } from "../../core/selection";
  import { recognizeShape, type Shape } from "../../core/shapes";
  import { isAccidental } from "../../core/touchInput";
  import { isInkTool, type Reader } from "../reader.svelte";

  let { reader, page }: { reader: Reader; page: number } = $props();

  /** The laser stays this long after the pen lifts, fading out (CSS animation of the same length). */
  const LASER_MS = 3600;
  const LASER_WIDTH = 0.0035;
  /** Hold the pen this long without moving more than HOLD_SLOP px: the stroke becomes a clean shape. */
  const HOLD_MS = 500;
  const HOLD_SLOP = 6;

  let svg: SVGSVGElement;
  let w = $state(0);
  let h = $state(0);
  /** Points of the line being drawn. Plain array (pushed per event); `liveVer` tells Svelte it changed. */
  let live: InkPoint[] | null = null;
  /** Where the pen is predicted to be next: drawn as a short tail, never saved. */
  let predicted: InkPoint[] = [];
  let liveVer = $state(0);
  /** Recognised shape shown while the pen is still held; saved on lift. */
  let snapped: Shape | null = null;
  /** Laser lines that are fading out. Never saved. */
  let fading = $state<{ id: number; points: InkPoint[] }[]>([]);
  let fadeId = 0;
  /** Finger that scrolls the page (pen-only mode, or after a stylus was seen). */
  let scrollFrom: { id: number; x: number; y: number } | null = null;
  /** Facts about the stroke in progress, for the accidental-touch check. */
  let stroke: { type: string; t0: number; lenPx: number; lastX: number; lastY: number } | null = null;
  /** Where the pen rests; the timer fires when it stays there HOLD_MS. */
  let hold: { x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;

  const edit = $derived(reader.edit);
  const strokes = $derived(reader.ink.filter((s) => s.page === page && !reader.lecture.hidesStroke(s.id)));
  const layers = $derived(reader.tools.layers);
  const drawing = $derived(isInkTool(reader.inkTool));
  const tool = $derived(reader.inkTool);
  const penKind = $derived(tool === "pen" || tool === "pencil" || tool === "highlighter" ? tool : null);
  /** The svg covers the page and its added margin; points stay normalised to the PDF page. */
  const bounds = $derived(reader.tools.bounds(page));
  const pw = $derived(w / bounds.w);
  const ph = $derived(h / bounds.h);
  /** Selected strokes being moved or scaled are drawn where the preview puts them. */
  const moving = $derived.by(() => {
    const s = edit.selection;
    const t = edit.preview;
    return s?.page === page && (t.k !== 1 || t.dx || t.dy) ? new Set(s.strokes) : null;
  });
  const shown = (s: InkStroke): InkStroke =>
    moving?.has(s.id) ? { ...s, points: applyPoints(edit.preview, s.points), width: s.width * edit.preview.k } : s;
  const marker = $derived(layers.highlights ? strokes.filter((s) => s.kind === "highlighter").map(shown) : []);
  const lines = $derived(layers.ink ? strokes.filter((s) => s.kind !== "highlighter").map(shown) : []);

  function at(e: PointerEvent): InkPoint {
    const r = svg.getBoundingClientRect();
    const p = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
    return { x: ((e.clientX - r.left) / r.width) * bounds.w, y: ((e.clientY - r.top) / r.height) * bounds.h, p };
  }

  /** Live line: drawn points plus the predicted tail, or the shape while the pen is held. */
  const livePts = $derived.by(() => {
    void liveVer;
    if (snapped) return snapped.points.slice();
    return live ? live.concat(predicted) : null; // a new array each time, so the path redraws
  });

  const facts = (e: PointerEvent) => ({ id: e.pointerId, type: e.pointerType, width: e.width, height: e.height, t: e.timeStamp });
  const shapeOpts = () => ({ aspect: ph / pw, allow: penKind === "highlighter" ? (["line"] as const) : undefined });

  function stopHold() {
    if (hold) clearTimeout(hold.timer);
    hold = null;
  }

  function armHold(x: number, y: number) {
    stopHold();
    hold = { x, y, timer: setTimeout(onHold, HOLD_MS) };
  }

  /** Pen held still. Drawing: show the clean shape. Select tool at the start: the touch "Yapıştır" menu. */
  function onHold() {
    const where = hold;
    hold = null;
    if (!live) return;
    if (tool === "select") {
      if (stroke && stroke.lenPx < 10 && where) {
        const p = live[0];
        cancel();
        edit.pasteMenu = { page, at: { x: p.x, y: p.y }, x: where.x, y: where.y };
      }
      return;
    }
    if (!penKind || !edit.prefs.shapeHold) return;
    const shape = recognizeShape(live, { ...shapeOpts(), mode: "hold" });
    if (!shape) return;
    snapped = shape;
    predicted = [];
    liveVer++;
  }

  /** Drops the line in progress (a palm, or the first finger of a pinch). */
  function cancel() {
    stopHold();
    live = null;
    snapped = null;
    predicted = [];
    stroke = null;
    liveVer++;
  }

  $effect(() => edit.onCancel(cancel));

  function down(e: PointerEvent) {
    if (!drawing || e.button > 0) return;
    const d = edit.gate.down(facts(e));
    if (d.cancel) edit.cancelLive();
    if (d.action === "ignore") return;
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
    if (d.action === "scroll") {
      scrollFrom = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    stroke = { type: e.pointerType, t0: e.timeStamp, lenPx: 0, lastX: e.clientX, lastY: e.clientY };
    if (tool === "eraser") {
      void reader.eraseAt(page, at(e));
      return;
    }
    if (tool === "select") edit.clear();
    live = [at(e)];
    predicted = [];
    snapped = null;
    liveVer++;
    if ((penKind && edit.prefs.shapeHold) || (tool === "select" && e.pointerType !== "mouse")) armHold(e.clientX, e.clientY);
  }

  function move(e: PointerEvent) {
    if (scrollFrom?.id === e.pointerId) {
      svg.closest(".scroller")?.scrollBy(scrollFrom.x - e.clientX, scrollFrom.y - e.clientY);
      scrollFrom = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    if (!stroke || !edit.gate.drawing(e.pointerId)) return;
    stroke.lenPx += Math.hypot(e.clientX - stroke.lastX, e.clientY - stroke.lastY);
    stroke.lastX = e.clientX;
    stroke.lastY = e.clientY;
    if (tool === "eraser") void reader.eraseAt(page, at(e));
    else if (live && !snapped) {
      // Coalesced events: every sample the pen sent since the last frame, not only the last one.
      const coalesced = e.getCoalescedEvents?.() ?? [];
      for (const c of coalesced.length ? coalesced : [e]) live.push(at(c));
      predicted = (e.getPredictedEvents?.() ?? []).slice(-2).map(at);
      liveVer++;
      if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > HOLD_SLOP) {
        // The select tool's paste menu needs a still start; a moving lasso never opens it.
        if (tool === "select") stopHold();
        else armHold(e.clientX, e.clientY);
      }
    }
  }

  function up(e: PointerEvent) {
    const mine = edit.gate.drawing(e.pointerId);
    edit.gate.up(e.pointerId, e.pointerType, e.timeStamp);
    if (scrollFrom?.id === e.pointerId) scrollFrom = null;
    if (!mine) return;
    stopHold();
    const pts = live;
    const shape = snapped;
    const st = stroke;
    live = null;
    snapped = null;
    predicted = [];
    stroke = null;
    liveVer++;
    if (!pts || !st) return;
    // A touch the browser took over, or a tiny quick brush, is not a stroke.
    if (e.type === "pointercancel" && st.type === "touch") return;
    if (tool === "select") {
      edit.select(page, pts, st.lenPx < 12);
      return;
    }
    if (isAccidental(st.type, st.lenPx, e.timeStamp - st.t0, edit.prefs.sensitivity)) return;
    if (tool === "laser") {
      const id = ++fadeId;
      fading = [...fading, { id, points: pts }];
      setTimeout(() => (fading = fading.filter((f) => f.id !== id)), LASER_MS);
      return;
    }
    const fit = shape ?? (edit.prefs.shapeAuto && penKind ? recognizeShape(pts, { ...shapeOpts(), mode: "auto" }) : null);
    if (fit) void edit.addShape(page, pts, fit);
    else void edit.addStroke(page, pts);
  }

  const laserW = $derived(Math.max(2, LASER_WIDTH * pw));
</script>

<!-- Highlighter: below the text look, multiplied with the page so black text stays black. -->
<svg class="ink under" viewBox="0 0 {w || 1} {h || 1}" aria-hidden="true">
  {#each marker as s (s.id)}
    <path class="hl" d={strokePath(s.points, pw, ph)} stroke={s.color} stroke-opacity={INK_KINDS.highlighter.opacity}
      stroke-width={strokeWidth(s, pw)} />
  {/each}
  {#if livePts && penKind === "highlighter"}
    <path class="hl" d={strokePath(livePts, pw, ph)} stroke={reader.inkColor} stroke-opacity={INK_KINDS.highlighter.opacity}
      stroke-width={strokeWidth({ kind: "highlighter", width: reader.inkWidth, points: livePts }, pw)} />
  {/if}
</svg>

<svg bind:this={svg} class="ink" class:drawing class:erase={tool === "eraser"} class:select={tool === "select"}
  bind:clientWidth={w} bind:clientHeight={h} viewBox="0 0 {w || 1} {h || 1}" role="presentation"
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
    <path d={strokePath(s.points, pw, ph)} stroke={s.color} stroke-opacity={INK_KINDS[s.kind].opacity}
      stroke-width={strokeWidth(s, pw)} data-kind={s.kind} data-id={s.id} filter={s.kind === "pencil" ? "url(#pencil-grain)" : undefined} />
  {/each}
  {#if livePts && (penKind === "pen" || penKind === "pencil")}
    <path class="live" d={strokePath(livePts, pw, ph)} stroke={reader.inkColor} stroke-opacity={INK_KINDS[penKind].opacity}
      stroke-width={strokeWidth({ width: reader.inkWidth, points: livePts }, pw)}
      filter={penKind === "pencil" ? "url(#pencil-grain)" : undefined} />
  {/if}
  {#if livePts && tool === "select"}
    <path class="lasso" d={strokePath(livePts, pw, ph) + "Z"} />
  {/if}
  {#if livePts && tool === "laser"}
    <g class="laser"><path d={strokePath(livePts, pw, ph)} stroke-width={laserW} /><path class="core" d={strokePath(livePts, pw, ph)} stroke-width={laserW / 3} /></g>
  {/if}
  {#each fading as f (f.id)}
    <g class="laser fade" style:animation-duration="{LASER_MS}ms">
      <path d={strokePath(f.points, pw, ph)} stroke-width={laserW} /><path class="core" d={strokePath(f.points, pw, ph)} stroke-width={laserW / 3} />
    </g>
  {/each}
</svg>

<style>
  .ink { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2; overflow: visible; }
  .ink.under { z-index: 1; mix-blend-mode: multiply; }
  .ink.drawing { pointer-events: auto; touch-action: none; cursor: crosshair; }
  .ink.erase { cursor: cell; }
  .ink.select { cursor: default; }
  path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  path.hl { stroke-linecap: butt; }
  .lasso { stroke: var(--accent); stroke-width: 1.5; stroke-dasharray: 5 4; fill: color-mix(in srgb, var(--accent) 8%, transparent); }
  .laser path { stroke: #ff3b5c; filter: drop-shadow(0 0 3px #ff3b5c) drop-shadow(0 0 7px rgb(255 59 92 / 0.6)); }
  .laser path.core { stroke: #fff4f6; filter: none; }
  .laser.fade { animation: laser-fade linear forwards; }
  @keyframes laser-fade { 0%, 35% { opacity: 1; } 100% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .laser.fade { animation: none; } }
</style>
