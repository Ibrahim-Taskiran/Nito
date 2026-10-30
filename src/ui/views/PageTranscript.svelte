<script lang="ts">
  import { BadgeAlert, Captions, ChevronDown, ChevronUp, Play } from "@lucide/svelte";
  import { formatTimestamp } from "../../core/recording";
  import type { Reader } from "../reader.svelte";

  /**
   * Transcript paragraphs spoken while this page was on screen. `side`: a column beside the page (wide
   * screens, landscape tablets); otherwise a collapsible block under the page (phones, portrait).
   */
  let { reader, page, label, side, height }: { reader: Reader; page: number; label: string; side: boolean; height: number } = $props();

  const L = $derived(reader.lecture);
  const snippets = $derived(L.pageSnippets(page));
  const cues = $derived(L.pageCues(page)?.cues ?? []);
  /** Under the page: open when tapped open here or from the cue chip. */
  const expanded = $derived(side || L.openTranscripts.has(page));
  const cuesIn = (p: { start: number; end: number }) => cues.filter((c) => c.at >= p.start && c.at < p.end);
</script>

{#if snippets}
  <section class="pt" class:side data-transcript={page} aria-label="Sayfa {label} dökümü" style:max-height={side ? `${height}px` : undefined}>
    {#if side}
      <h3><Captions size={14} />Döküm · s. {label}</h3>
    {:else}
      <button class="head" aria-expanded={expanded} onclick={() => L.toggleTranscript(page)}>
        <Captions size={16} /><span>Döküm · s. {label} · {snippets.paragraphs.length} paragraf</span>
        {#if cues.length}<span class="badge" aria-label="{cues.length} sınav ipucu"><BadgeAlert size={14} />{cues.length}</span>{/if}
        {#if expanded}<ChevronUp size={18} />{:else}<ChevronDown size={18} />{/if}
      </button>
    {/if}
    {#if expanded}
      <ol>
        {#each snippets.paragraphs as p, i (i)}
          {@const found = cuesIn(p)}
          <li class:cued={found.length > 0}>
            <button class="ts" aria-label="{formatTimestamp(p.start)} anından dinle" onclick={() => L.play(snippets.rec, p.start)}>
              <Play size={12} />{formatTimestamp(p.start)}
            </button>
            {#each found as c, k (k)}
              <button class="cue" title="Hoca: “{c.phrase}”" onclick={() => L.play(snippets.rec, Math.max(0, c.at - 2))}>
                <BadgeAlert size={12} />“{c.phrase}”
              </button>
            {/each}
            <p>{p.text}</p>
          </li>
        {/each}
      </ol>
    {/if}
  </section>
{:else if side}
  <div class="pt-gap" aria-hidden="true"></div>
{/if}

<style>
  .pt {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; line-height: 1.5;
    color: var(--text); margin: -4px auto 16px; overflow: hidden;
  }
  .pt.side { width: 300px; flex: none; margin: 0 0 16px; overflow-y: auto; position: sticky; top: 0; }
  .pt-gap { width: 300px; flex: none; }
  h3 {
    display: flex; align-items: center; gap: 6px; margin: 0; padding: 8px 12px; font-size: 12px; font-weight: 600; color: var(--text-2);
    border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--surface);
  }
  .head {
    width: 100%; min-height: var(--hit); display: flex; align-items: center; gap: 8px; padding: 0 12px; border: 0; background: transparent;
    color: var(--text-2); font: inherit; font-size: 13px; cursor: pointer; text-align: left; touch-action: manipulation;
  }
  .head span:first-of-type { flex: 1; }
  .badge { display: inline-flex; align-items: center; gap: 3px; color: var(--danger); font-variant-numeric: tabular-nums; }
  ol { list-style: none; margin: 0; padding: 4px 8px 8px; display: grid; gap: 2px; }
  .head + ol { border-top: 1px solid var(--border); }
  li { padding: 6px 4px; border-radius: 6px; }
  li.cued { border-left: 3px solid var(--danger); padding-left: 8px; }
  li p { margin: 2px 0 0; user-select: text; }
  .ts, .cue {
    min-height: var(--hit); min-width: var(--hit); display: inline-flex; align-items: center; gap: 4px; padding: 0 8px; margin-right: 4px;
    border: 1px solid var(--border); border-radius: 999px; background: var(--bg); color: var(--accent); font: inherit; font-size: 12px;
    font-variant-numeric: tabular-nums; cursor: pointer; touch-action: manipulation;
  }
  .cue { color: var(--danger); }
  .ts:hover, .cue:hover { background: var(--accent-soft); }
</style>
