<script lang="ts">
  import { onMount } from "svelte";
  import type { Document } from "../../core/types";
  import Button from "../components/Button.svelte";
  import Dialog from "../components/Dialog.svelte";
  import type { Library } from "../library.svelte";

  let { lib, doc, onclose }: { lib: Library; doc: Document; onclose: () => void } = $props();
  let all = $state<Document[]>([]);
  let query = $state("");

  const courseName = (id: number | null) => lib.courses.find((c) => c.id === id)?.name ?? "Derssiz";
  const shown = $derived(
    all.filter((d) => d.id !== doc.id && d.title.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr"))),
  );

  onMount(async () => {
    all = await lib.repo.listDocuments({ kind: "all" });
  });

  function choose(other: Document) {
    lib.split = [doc, other];
    onclose();
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onclose()} />

<Dialog title="Yan yana açılacak belge">
  <!-- svelte-ignore a11y_autofocus -->
  <input class="search" type="search" placeholder="Belge ara…" bind:value={query} autofocus aria-label="Belge ara" />
  <ul class="list">
    {#each shown as d (d.id)}
      <li><button onclick={() => choose(d)}><span class="t">{d.title}</span><span class="c">{courseName(d.courseId)}</span></button></li>
    {:else}
      <li class="none">Başka belge yok.</li>
    {/each}
  </ul>
  {#snippet actions()}<Button onclick={onclose}>Vazgeç</Button>{/snippet}
</Dialog>

<style>
  .search { width: 100%; min-height: var(--hit); padding: 0 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); box-sizing: border-box; }
  .list { list-style: none; margin: 8px 0 0; padding: 0; max-height: 320px; overflow: auto; }
  .list button {
    width: 100%; min-height: var(--hit); padding: 6px 10px; border: 0; border-radius: var(--radius-sm); background: transparent;
    color: var(--text); cursor: pointer; display: flex; justify-content: space-between; gap: 12px; text-align: left;
  }
  .list button:hover { background: var(--surface-2); }
  .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .c { color: var(--text-2); flex: none; font-size: 13px; }
  .none { color: var(--text-2); padding: 8px 10px; }
</style>
