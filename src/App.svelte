<script lang="ts">
  import { onMount } from "svelte";
  import Button from "./ui/components/Button.svelte";
  import AddProgress from "./ui/views/AddProgress.svelte";
  import DetailPanel from "./ui/views/DetailPanel.svelte";
  import DocumentList from "./ui/views/DocumentList.svelte";
  import ReaderView from "./ui/views/ReaderView.svelte";
  import Sidebar from "./ui/views/Sidebar.svelte";
  import AiView from "./ui/views/AiView.svelte";
  import NotesView from "./ui/views/NotesView.svelte";
  import SplitView from "./ui/views/SplitView.svelte";
  import StudyView from "./ui/views/StudyView.svelte";
  import type { Library } from "./ui/library.svelte";

  let { lib }: { lib: Library } = $props();
  let recursive = $state(true);

  onMount(() => {
    const off = lib.platform.onDrop((files) => lib.add(files));
    return () => void off.then((f) => f());
  });

  const addPdfs = async () => lib.add(await lib.platform.pickers.pickPdfs());
  const addFolder = async () => lib.add(await lib.platform.pickers.pickFolder(recursive));
</script>

{#snippet addButtons()}
  <Button variant="primary" onclick={addPdfs}>PDF ekle</Button>
  <Button onclick={addFolder}>Klasör ekle</Button>
{/snippet}

{#if lib.split}
  <SplitView {lib} docs={lib.split} />
{:else if lib.opened}
  {#key lib.opened.id}<ReaderView {lib} doc={lib.opened} />{/key}
{:else if lib.counts.all === 0}
  <main class="empty">
    <h1>Kütüphanen boş</h1>
    <p>Ders PDF'lerini ekleyerek başla. Dosyaları ya da klasörleri pencereye de sürükleyebilirsin.</p>
    <div class="row">{@render addButtons()}</div>
    <label class="check"><input type="checkbox" bind:checked={recursive} /> Alt klasörleri ders olarak ekle</label>
  </main>
{:else}
  <div class="shell">
    <Sidebar {lib} />
    {#if lib.section === "study"}
      <StudyView {lib} />
    {:else if lib.section === "notes"}
      <NotesView {lib} />
    {:else if lib.section === "ai"}
      <AiView {lib} />
    {:else}
      <main class="center">
        <header class="toolbar">
          <div class="row">{@render addButtons()}</div>
        </header>
        <DocumentList {lib} />
      </main>
      <DetailPanel {lib} />
    {/if}
  </div>
{/if}
<AddProgress {lib} />

<style>
  .shell { display: flex; height: 100%; }
  .center { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .toolbar { display: flex; justify-content: flex-end; padding: 10px 16px; border-bottom: 1px solid var(--border); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .empty { height: 100%; display: grid; place-content: center; justify-items: center; text-align: center; padding: 16px; gap: 12px; }
  .empty h1 { font-size: 20px; font-weight: 600; margin: 0; }
  .empty p { color: var(--text-2); margin: 0; max-width: 380px; }
  .check { display: flex; gap: 8px; align-items: center; color: var(--text-2); min-height: var(--hit); }
</style>
