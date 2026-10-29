<script lang="ts">
  import { READ_STATUS_NAMES } from "../../core/labels";
  import { groupByWeek } from "../../core/week";
  import type { Library } from "../library.svelte";
  let { lib }: { lib: Library } = $props();
  const groups = $derived(groupByWeek(lib.documents));
</script>

<div class="list">
  {#each groups as g (g.week)}
    <section>
      <h3>{g.label}</h3>
      {#each g.items as d (d.id)}
        <div class="row" class:selected={lib.selectedId === d.id}>
          <button class="dot {d.readStatus}" aria-label="Durum: {READ_STATUS_NAMES[d.readStatus]}" title={READ_STATUS_NAMES[d.readStatus]}
            onclick={() => lib.cycleReadStatus(d)}></button>
          <button class="title" onclick={() => (lib.selectedId = d.id)} ondblclick={() => lib.open(d)}>{d.title}</button>
          <button class="star" class:on={d.favorite} aria-label="Favori" aria-pressed={d.favorite}
            onclick={() => lib.toggleFavorite(d)}>{d.favorite ? "★" : "☆"}</button>
        </div>
      {/each}
    </section>
  {:else}
    <p class="none">Bu görünümde belge yok.</p>
  {/each}
</div>

<style>
  .list { flex: 1; overflow-y: auto; padding: 8px 16px 24px; }
  h3 { font-size: 12px; font-weight: 600; color: var(--text-2); margin: 16px 8px 4px; }
  /* Off-screen rows skip layout and paint: cheap virtualisation for long lists. */
  .row { display: flex; align-items: center; gap: 4px; border-radius: var(--radius-sm); content-visibility: auto; contain-intrinsic-size: auto 40px; }
  .row:hover { background: var(--surface-2); }
  .row.selected { background: var(--accent-soft); }
  button { border: 0; background: transparent; cursor: pointer; min-height: var(--hit); }
  .dot { width: var(--hit); display: grid; place-items: center; }
  .dot::before { content: ""; width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--accent); }
  .dot.reading::before { background: linear-gradient(90deg, var(--accent) 50%, transparent 50%); }
  .dot.read::before { border-color: var(--border); background: var(--border); }
  .title { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 4px; }
  .star { width: var(--hit); color: var(--text-2); font-size: 16px; }
  .star.on { color: #c9a23e; }
  .none { color: var(--text-2); padding: 24px 8px; }
</style>
