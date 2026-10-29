<script lang="ts">
  import type { Document } from "../../core/types";
  import Button from "../components/Button.svelte";
  import type { Library } from "../library.svelte";
  import ReaderView from "./ReaderView.svelte";

  let { lib, docs }: { lib: Library; docs: [Document, Document] } = $props();

  /** Closing one side returns to the single reader with the other document. */
  function keep(d: Document) {
    lib.split = null;
    lib.opened = d;
  }
</script>

<div class="split">
  <header class="bar">
    <span class="title">Yan yana</span>
    <Button variant="ghost" onclick={() => keep(docs[0])}>Tek görünüme dön</Button>
  </header>
  <div class="panes">
    {#each docs as d, i (d.id)}
      <section class="pane" aria-label={d.title}>
        <ReaderView {lib} doc={d} compact onclose={() => keep(docs[1 - i])} />
      </section>
    {/each}
  </div>
</div>

<style>
  .split { display: flex; flex-direction: column; height: 100%; }
  .bar { display: flex; align-items: center; gap: 8px; padding: 4px 12px; border-bottom: 1px solid var(--border); background: var(--surface); }
  .title { flex: 1; color: var(--text-2); font-size: 13px; }
  .panes { flex: 1; display: grid; grid-template-columns: 1fr 1fr; min-height: 0; }
  .pane { min-width: 0; min-height: 0; overflow: hidden; }
  .pane + .pane { border-left: 1px solid var(--border); }
</style>
