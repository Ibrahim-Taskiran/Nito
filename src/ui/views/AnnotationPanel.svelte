<script lang="ts">
  import { LABELS, labelInfo } from "../../core/labels";
  import { formatTimestamp } from "../../core/recording";
  import type { LabelKey } from "../../core/types";
  import type { Reader } from "../reader.svelte";
  import RecordingList from "./RecordingList.svelte";
  let { reader, onjump }: { reader: Reader; onjump: (page: number) => void } = $props();
</script>

<aside class="panel" aria-label="Vurgular">
  <h2>Vurgular <span class="count">{reader.annotations.length}</span></h2>
  {#each reader.annotations as a (a.id)}
    <article class="item" class:focused={reader.focusedId === a.id} style:--label={labelInfo(a.label).color}>
      <button class="quote" onclick={() => { reader.focusedId = a.id; onjump(a.page); }}>
        <span class="meta">s. {a.page} · {labelInfo(a.label).name}</span>
        <span class="text">{a.text}</span>
      </button>
      <textarea placeholder="Yorum ekle…" rows="2" value={a.comment}
        onchange={(e) => reader.update(a.id, { comment: e.currentTarget.value })}></textarea>
      <div class="row">
        <select aria-label="Etiket" value={a.label} onchange={(e) => reader.update(a.id, { label: e.currentTarget.value as LabelKey })}>
          {#each LABELS as l (l.key)}<option value={l.key}>{l.name}</option>{/each}
        </select>
        {#if reader.marks.get(a.id)}
          {@const m = reader.marks.get(a.id)!}
          <button class="play" aria-pressed={reader.playingId === a.id} onclick={() => reader.play(a.id)}>
            {reader.playingId === a.id ? "❚❚" : "▶"} {formatTimestamp(m.offsetSeconds)}
          </button>
        {/if}
        <button class="del" onclick={() => reader.remove(a.id)}>Sil</button>
      </div>
    </article>
  {:else}
    <p class="hint">Metni seçip bir etiket seçerek vurgu ekleyin.</p>
  {/each}
  <RecordingList {reader} {onjump} />
</aside>

<style>
  .panel { width: 300px; flex: none; overflow-y: auto; border-left: 1px solid var(--border); background: var(--surface); padding: 12px; }
  h2 { font-size: 13px; font-weight: 600; margin: 4px 4px 12px; }
  .count { color: var(--text-2); font-weight: 400; }
  .item { border: 1px solid var(--border); border-left: 4px solid var(--label); border-radius: var(--radius-sm); padding: 8px; margin-bottom: 8px; content-visibility: auto; contain-intrinsic-size: auto 120px; }
  .item.focused { border-color: var(--accent); border-left-color: var(--label); }
  .quote { display: block; width: 100%; text-align: left; border: 0; background: transparent; cursor: pointer; padding: 0; }
  .meta { display: block; font-size: 12px; color: var(--text-2); margin-bottom: 2px; }
  .text { display: -webkit-box; -webkit-line-clamp: 4; line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
  textarea { width: 100%; margin-top: 8px; resize: vertical; font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; }
  .row { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
  select { min-height: 32px; font: inherit; color: inherit; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0 6px; }
  .play { min-height: 32px; border: 1px solid var(--border); background: var(--surface); border-radius: 6px; padding: 0 8px; cursor: pointer; font-variant-numeric: tabular-nums; margin-left: auto; margin-right: 4px; }
  .play[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
  .del { min-height: 32px; border: 0; background: transparent; color: var(--danger); cursor: pointer; padding: 0 8px; border-radius: 6px; }
  .del:hover { background: var(--surface-2); }
  .hint { color: var(--text-2); margin: 4px; }
  @media (max-width: 1023px) { .panel { width: 240px; } }
</style>
