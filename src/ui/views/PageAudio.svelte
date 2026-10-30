<script lang="ts">
  import { BadgeAlert, Captions, Play } from "@lucide/svelte";
  import { formatTimestamp } from "../../core/recording";
  import type { Reader } from "../reader.svelte";

  /** Corner chips on a page that a recording explains: play from that moment, spoken cues, transcript snippets. */
  let { reader, page }: { reader: Reader; page: number } = $props();

  const L = $derived(reader.lecture);
  const hit = $derived(L.recordingFor(page));
  const cues = $derived(L.pageCues(page));
  const snippets = $derived(L.pageSnippets(page));
  let open = $state(false);
</script>

{#if hit}
  <div class="page-audio" data-page-audio={page}>
    <div class="chips">
      <button class="chip" aria-label="Bu sayfanın anlatıldığı yere git" title="Bu sayfanın anlatıldığı yere git"
        onclick={() => L.play(hit.rec, hit.segment.start)}>
        <Play size={14} /><span>{formatTimestamp(hit.segment.start)}</span>
      </button>
      {#if cues}
        <button class="chip cue" aria-label="Sınav ipucu: {cues.cues.length}" title="Hoca bu sayfada vurguladı" aria-expanded={open}
          onclick={() => (open = !open)}>
          <BadgeAlert size={14} /><span>{cues.cues.length}</span>
        </button>
      {/if}
      {#if snippets}
        <button class="chip" aria-label="Bu sayfada anlatılanlar" title="Bu sayfada anlatılanlar" aria-expanded={open}
          onclick={() => (open = !open)}>
          <Captions size={14} />
        </button>
      {/if}
    </div>
    {#if open && (cues || snippets)}
      <div class="pop" role="dialog" aria-label="Sayfa {page} dökümü">
        {#each cues?.cues ?? [] as c, i (i)}
          <button class="line cue-line" onclick={() => cues && L.play(cues.rec, Math.max(0, c.at - 2))}>
            <span class="ts">{formatTimestamp(c.at)}</span> <strong>“{c.phrase}”</strong> {c.snippet}
          </button>
        {/each}
        {#each snippets?.paragraphs ?? [] as p, i (i)}
          <button class="line" onclick={() => snippets && L.play(snippets.rec, p.start)}>
            <span class="ts">{formatTimestamp(p.start)}</span> {p.text}
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .page-audio { position: absolute; top: 6px; right: 6px; z-index: 3; display: grid; justify-items: end; gap: 6px; max-width: min(340px, 90%); }
  .chips { display: flex; gap: 4px; }
  .chip {
    min-height: var(--hit); min-width: var(--hit); display: inline-flex; align-items: center; justify-content: center; gap: 4px;
    padding: 0 10px; border: 1px solid var(--border); border-radius: 999px; background: color-mix(in srgb, var(--surface) 92%, transparent);
    color: var(--text-2); font: inherit; font-size: 12px; font-variant-numeric: tabular-nums; cursor: pointer; touch-action: manipulation;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
  }
  .chip:hover { color: var(--text); }
  .chip.cue { color: var(--danger); }
  .chip[aria-expanded="true"] { background: var(--accent-soft); }
  .pop {
    max-height: 260px; overflow-y: auto; display: grid; gap: 2px; padding: 6px; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-sm); box-shadow: 0 8px 28px rgb(0 0 0 / 0.16); font-size: 12px; line-height: 1.45;
  }
  .line { text-align: left; min-height: var(--hit); padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--text); font: inherit; cursor: pointer; }
  .line:hover { background: var(--surface-2); }
  .cue-line { border-left: 3px solid var(--danger); }
  .ts { color: var(--accent); font-variant-numeric: tabular-nums; }
</style>
