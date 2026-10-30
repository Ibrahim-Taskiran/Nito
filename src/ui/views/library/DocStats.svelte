<script lang="ts">
  import { Highlighter, Mic, NotebookPen } from "@lucide/svelte";
  import { readingProgress } from "../../../core/library/browse";
  import type { Document, DocumentStats } from "../../../core/types";

  /** Progress bar with label, plus highlight / recording / note badges (only non-zero ones). */
  let { doc, stats, bar = true }: { doc: Document; stats?: DocumentStats; bar?: boolean } = $props();
  const p = $derived(readingProgress(doc));
  const badges = $derived(
    [
      { n: stats?.highlights ?? 0, name: "vurgu", Icon: Highlighter },
      { n: stats?.recordings ?? 0, name: "kayıt", Icon: Mic },
      { n: stats?.notes ?? 0, name: "not", Icon: NotebookPen },
    ].filter((b) => b.n > 0),
  );
</script>

<div class="stats">
  {#if bar}
    <div class="bar" class:done={p.ratio >= 1} aria-hidden="true"><i style:width="{p.ratio * 100}%"></i></div>
  {/if}
  <div class="line">
    <span class="pct" class:done={p.ratio >= 1}>{p.label}</span>
    {#each badges as b (b.name)}
      <span class="badge" title="{b.n} {b.name}"><b.Icon size={13} strokeWidth={2} aria-hidden="true" />{b.n}<span class="sr">{b.name}</span></span>
    {/each}
  </div>
</div>

<style>
  .stats { display: grid; gap: 6px; min-width: 0; }
  .bar { height: 4px; border-radius: 2px; background: var(--surface-2); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--accent); border-radius: 2px; }
  .bar.done i { opacity: 0.55; }
  .line { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--text-2); min-height: 16px; }
  .pct { margin-right: auto; font-variant-numeric: tabular-nums; }
  .pct.done { color: var(--accent); }
  .badge { display: inline-flex; align-items: center; gap: 3px; font-variant-numeric: tabular-nums; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
