<script lang="ts">
  import { Ellipsis, Star } from "@lucide/svelte";
  import { longPress } from "../longpress";
  import { READ_STATUS_NAMES } from "../../core/labels";
  import type { Document } from "../../core/types";
  import type { Library } from "../library.svelte";
  import DocStats from "./library/DocStats.svelte";

  /** Compact list mode of the library; same information as the cards, without covers. */
  let { lib, items, onmenu }: { lib: Library; items: Document[]; onmenu: (d: Document, x: number, y: number) => void } = $props();
  const courseName = (d: Document) => lib.courses.find((c) => c.id === d.courseId)?.name;
</script>

<div class="list n-card">
      {#each items as d (d.id)}
        <div class="row" class:selected={lib.selectedId === d.id} role="group" aria-label={d.title}
          {@attach longPress((x, y) => { lib.selectedId = d.id; onmenu(d, x, y); })}
          oncontextmenu={(e) => { e.preventDefault(); lib.selectedId = d.id; onmenu(d, e.clientX, e.clientY); }}>
          <button class="dot {d.readStatus}" aria-label="Durum: {READ_STATUS_NAMES[d.readStatus]}" title={READ_STATUS_NAMES[d.readStatus]}
            onclick={() => lib.cycleReadStatus(d)}></button>
          <button class="title" aria-label={d.title} onclick={() => lib.activate(d)} ondblclick={() => lib.resume(d)}>
            <span class="name">{d.title}</span>
            <span class="meta">{[courseName(d), d.week != null ? `Hafta ${d.week}` : null].filter(Boolean).join(" · ")}</span>
          </button>
          <div class="stats"><DocStats doc={d} stats={lib.stats.get(d.id)} /></div>
          <button class="icon star" class:on={d.favorite} aria-label="Favori" aria-pressed={d.favorite} title="Favori"
            onclick={() => lib.toggleFavorite(d)}><Star size={16} fill={d.favorite ? "currentColor" : "none"} /></button>
          <button class="icon" aria-label="Diğer işlemler" aria-haspopup="menu" title="Diğer işlemler"
            onclick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onmenu(d, r.right, r.bottom + 4); }}><Ellipsis size={18} /></button>
        </div>
      {/each}
</div>

<style>
  .list { padding: 6px; margin-top: 12px; }
  /* Off-screen rows skip layout and paint: cheap virtualisation for long lists. */
  .row { display: flex; align-items: center; gap: 4px; border-radius: var(--radius-sm); content-visibility: auto; contain-intrinsic-size: auto 52px; padding-right: 4px; -webkit-touch-callout: none; user-select: none; }
  .row:hover { background: var(--surface-2); }
  .row + .row { margin-top: 2px; }
  .row.selected { background: var(--accent-soft); }
  button { border: 0; background: transparent; cursor: pointer; min-height: var(--hit); color: inherit; }
  .dot { width: var(--hit); display: grid; place-items: center; flex: none; }
  .dot::before { content: ""; width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--accent); }
  .dot.reading::before { background: linear-gradient(90deg, var(--accent) 50%, transparent 50%); }
  .dot.read::before { border-color: var(--emerald); background: var(--emerald); }
  .title { flex: 1; min-width: 0; text-align: left; padding: 6px 4px; display: grid; gap: 1px; }
  .name { font-weight: 600; }
  .name, .meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: 12px; color: var(--text-2); }
  .meta:empty { display: none; }
  .stats { width: 170px; flex: none; padding: 0 8px; }
  .icon { width: var(--hit); flex: none; display: grid; place-items: center; color: var(--text-2); border-radius: var(--radius-sm); }
  .icon:hover { color: var(--text); }
  .star.on { color: var(--amber); }
  @media (max-width: 640px) { .stats { width: 90px; } }
</style>
