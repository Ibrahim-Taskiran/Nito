<script lang="ts">
  import { Ellipsis, Star } from "@lucide/svelte";
  import { longPress } from "../../longpress";
  import type { Document } from "../../../core/types";
  import type { Library } from "../../library.svelte";
  import Cover from "./Cover.svelte";
  import DocStats from "./DocStats.svelte";

  let { lib, doc, onmenu }: { lib: Library; doc: Document; onmenu: (d: Document, x: number, y: number) => void } = $props();
  const course = $derived(lib.courses.find((c) => c.id === doc.courseId));
  const meta = $derived([course?.name, doc.week != null ? `Hafta ${doc.week}` : null].filter(Boolean).join(" · "));

  function menuFrom(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onmenu(doc, r.right, r.bottom + 4);
  }
</script>

<article class="card" class:selected={lib.selectedId === doc.id}
  {@attach longPress((x, y) => { lib.selectedId = doc.id; onmenu(doc, x, y); })}
  oncontextmenu={(e) => { e.preventDefault(); lib.selectedId = doc.id; onmenu(doc, e.clientX, e.clientY); }}>
  <button class="main" aria-label={doc.title} aria-describedby="meta-{doc.id}"
    onclick={() => lib.activate(doc)} ondblclick={() => lib.resume(doc)}>
    <span class="art">
      <Cover storage={lib.platform.storage} {doc} />
      <span class="kind">PDF{#if doc.pageCount}<i>{doc.pageCount} syf</i>{/if}</span>
    </span>
    <span class="meta n-eyebrow" id="meta-{doc.id}">{meta || "Derssiz"}</span>
    <span class="title">{doc.title}</span>
  </button>
  <div class="foot"><DocStats {doc} stats={lib.stats.get(doc.id)} /></div>
  <button class="star" class:on={doc.favorite} aria-label="Favori" aria-pressed={doc.favorite} title="Favori"
    onclick={() => lib.toggleFavorite(doc)}><Star size={16} fill={doc.favorite ? "currentColor" : "none"} /></button>
  <button class="more" aria-label="Diğer işlemler" aria-haspopup="menu" title="Diğer işlemler" onclick={menuFrom}><Ellipsis size={18} /></button>
</article>

<style>
  .card {
    position: relative; display: flex; flex-direction: column; gap: 10px; padding: 10px 10px 14px;
    border-radius: var(--radius); background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow-1);
    transition: border-color 0.12s, box-shadow 0.12s, transform 0.12s; content-visibility: auto; contain-intrinsic-size: auto 360px;
    -webkit-touch-callout: none; user-select: none;
  }
  .card:hover { box-shadow: var(--shadow-2); border-color: var(--border-strong); }
  .card.selected { border-color: var(--accent-strong); box-shadow: 0 0 0 1px var(--accent-strong), var(--shadow-2); }
  button { border: 0; background: transparent; cursor: pointer; padding: 0; }
  .main { display: flex; flex-direction: column; gap: 6px; text-align: left; min-width: 0; border-radius: var(--radius-sm); }
  .art { position: relative; display: block; margin-bottom: 6px; }
  .art :global(.cover) { aspect-ratio: 4 / 3; border-radius: var(--radius-sm); }
  .kind {
    position: absolute; left: 10px; top: 10px; display: inline-flex; gap: 6px; align-items: center; padding: 4px 9px; border-radius: var(--radius-xs);
    background: color-mix(in srgb, var(--surface) 92%, transparent); color: var(--text); font: 700 11px/1 var(--font-label);
    letter-spacing: 0.04em; box-shadow: var(--shadow-1);
  }
  .kind i { font-style: normal; font-weight: 600; color: var(--text-2); letter-spacing: 0.01em; }
  .title {
    font-weight: 600; font-size: 15px; line-height: 1.35; padding: 0 4px;
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    min-height: calc(2 * 1.35em); overflow-wrap: anywhere;
  }
  .meta { padding: 0 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .foot { margin-top: auto; padding: 10px 4px 0; border-top: 1px solid var(--border); }
  .star, .more {
    position: absolute; top: 18px; width: var(--hit); height: var(--hit); border-radius: 50%;
    display: grid; place-items: center; color: var(--text-2);
    background: color-mix(in srgb, var(--surface) 90%, transparent); box-shadow: var(--shadow-1);
  }
  .star { right: 66px; }
  .more { right: 18px; }
  .star:hover, .more:hover { color: var(--text); background: var(--surface); }
  .star.on { color: var(--amber); }
</style>
