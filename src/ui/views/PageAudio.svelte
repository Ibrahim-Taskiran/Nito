<script lang="ts">
  import { BadgeAlert, Captions, Play } from "@lucide/svelte";
  import { formatTimestamp } from "../../core/recording";
  import type { Reader } from "../reader.svelte";

  /**
   * Corner chips on a page that a recording explains: play from that moment, and the spoken cues.
   * The cue (or transcript) chip opens the page's transcript block beside or under the page (PageTranscript).
   */
  let { reader, page }: { reader: Reader; page: number } = $props();

  const L = $derived(reader.lecture);
  const hit = $derived(L.recordingFor(page));
  const cues = $derived(L.pageCues(page));
  const snippets = $derived(L.pageSnippets(page));
</script>

{#if hit}
  <div class="page-audio" data-page-audio={page}>
    <button class="chip" aria-label="Bu sayfanın anlatıldığı yere git" title="Bu sayfanın anlatıldığı yere git"
      onclick={() => L.play(hit.rec, hit.segment.start)}>
      <Play size={14} /><span>{formatTimestamp(hit.segment.start)}</span>
    </button>
    {#if cues}
      <button class="chip cue" aria-label="Sınav ipucu: {cues.cues.length}" title="Hoca bu sayfada vurguladı: dökümü aç"
        aria-expanded={L.openTranscripts.has(page)} onclick={() => L.toggleTranscript(page)}>
        <BadgeAlert size={14} /><span>{cues.cues.length}</span>
      </button>
    {:else if snippets}
      <button class="chip" aria-label="Bu sayfada anlatılanlar" title="Bu sayfada anlatılanlar"
        aria-expanded={L.openTranscripts.has(page)} onclick={() => L.toggleTranscript(page)}>
        <Captions size={14} />
      </button>
    {/if}
  </div>
{/if}

<style>
  .page-audio { position: absolute; top: 6px; right: 6px; z-index: 3; display: flex; gap: 4px; }
  .chip {
    min-height: var(--hit); min-width: var(--hit); display: inline-flex; align-items: center; justify-content: center; gap: 4px;
    padding: 0 10px; border: 1px solid var(--border); border-radius: 999px; background: color-mix(in srgb, var(--surface) 92%, transparent);
    color: var(--text-2); font: inherit; font-size: 12px; font-variant-numeric: tabular-nums; cursor: pointer; touch-action: manipulation;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
  }
  .chip:hover { color: var(--text); }
  .chip.cue { color: var(--danger); }
  .chip[aria-expanded="true"] { background: var(--accent-soft); }
</style>
