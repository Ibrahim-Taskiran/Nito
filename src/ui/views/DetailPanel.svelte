<script lang="ts">
  import { READ_STATUS_NAMES } from "../../core/labels";
  import type { Library } from "../library.svelte";
  let { lib }: { lib: Library } = $props();
  const d = $derived(lib.selected);
  const course = $derived(d && lib.courses.find((c) => c.id === d.courseId));
</script>

<aside class="detail" aria-label="Belge ayrıntısı">
  {#if d}
    <h2>{d.title}</h2>
    <dl>
      <dt>Ders</dt><dd>{course?.name ?? "—"}</dd>
      <dt>Hafta</dt><dd>{d.week ?? "—"}</dd>
      <dt>Durum</dt><dd>{READ_STATUS_NAMES[d.readStatus]}</dd>
      <dt>Eklendi</dt><dd>{new Date(d.addedAt).toLocaleDateString("tr-TR")}</dd>
    </dl>
  {:else}
    <p class="hint">Ayrıntı için bir belge seçin.</p>
  {/if}
</aside>

<style>
  .detail { width: 280px; flex: none; border-left: 1px solid var(--border); background: var(--surface); padding: 20px; overflow-y: auto; }
  h2 { font-size: 15px; font-weight: 600; margin: 0 0 16px; overflow-wrap: anywhere; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; margin: 0; }
  dt { color: var(--text-2); }
  dd { margin: 0; }
  .hint { color: var(--text-2); }
  @media (max-width: 1023px) { .detail { display: none; } }
</style>
