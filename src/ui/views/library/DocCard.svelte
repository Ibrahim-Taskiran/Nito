<script lang="ts">
  import { MoreVertical, Star } from "@lucide/svelte";
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
  oncontextmenu={(e) => { e.preventDefault(); lib.selectedId = doc.id; onmenu(doc, e.clientX, e.clientY); }}>
  <button class="main" aria-label={doc.title} aria-describedby="meta-{doc.id}"
    onclick={() => (lib.selectedId = doc.id)} ondblclick={() => lib.resume(doc)}>
    <Cover storage={lib.platform.storage} {doc} />
    <span class="title">{doc.title}</span>
    <span class="meta" id="meta-{doc.id}">{meta || "Derssiz"}</span>
  </button>
  <div class="foot"><DocStats {doc} stats={lib.stats.get(doc.id)} /></div>
  <button class="star" class:on={doc.favorite} aria-label="Favori" aria-pressed={doc.favorite} title="Favori"
    onclick={() => lib.toggleFavorite(doc)}><Star size={16} fill={doc.favorite ? "currentColor" : "none"} /></button>
  <button class="more" aria-label="Diğer işlemler" aria-haspopup="menu" title="Diğer işlemler" onclick={menuFrom}><MoreVertical size={16} /></button>
</article>

<style>
  .card {
    position: relative; display: flex; flex-direction: column; gap: 8px; padding: 10px;
    border-radius: var(--radius); background: var(--surface); border: 1px solid var(--border);
    transition: border-color 0.12s, box-shadow 0.12s; content-visibility: auto; contain-intrinsic-size: auto 320px;
  }
  .card:hover { border-color: color-mix(in srgb, var(--accent) 35%, var(--border)); box-shadow: 0 4px 14px rgb(0 0 0 / 0.06); }
  .card.selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  button { border: 0; background: transparent; cursor: pointer; padding: 0; }
  .main { display: flex; flex-direction: column; gap: 6px; text-align: left; min-width: 0; border-radius: var(--radius-sm); }
  .title {
    font-weight: 600; font-size: 13.5px; line-height: 1.35; margin-top: 4px;
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    min-height: calc(2 * 1.35em); overflow-wrap: anywhere;
  }
  .meta { font-size: 12px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .foot { margin-top: auto; }
  .star, .more {
    position: absolute; top: 16px; width: 32px; height: 32px; border-radius: 50%;
    display: grid; place-items: center; color: var(--text-2);
    background: color-mix(in srgb, var(--surface) 88%, transparent); box-shadow: 0 1px 4px rgb(0 0 0 / 0.12);
  }
  .star { right: 52px; }
  .more { right: 16px; }
  .star:hover, .more:hover { color: var(--text); background: var(--surface); }
  .star.on { color: #c9a23e; }
  /* Hover devices hide the quiet actions until needed; touch keeps them visible. */
  @media (hover: hover) {
    .star:not(.on), .more { opacity: 0; transition: opacity 0.12s; }
    .card:hover .star, .card:hover .more, .card:focus-within .star, .card:focus-within .more { opacity: 1; }
  }
</style>
