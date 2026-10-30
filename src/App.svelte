<script lang="ts">
  import { onMount } from "svelte";
  import Button from "./ui/components/Button.svelte";
  import AddProgress from "./ui/views/AddProgress.svelte";
  import LibraryView from "./ui/views/LibraryView.svelte";
  import ReaderView from "./ui/views/ReaderView.svelte";
  import Sidebar from "./ui/views/Sidebar.svelte";
  import AiView from "./ui/views/AiView.svelte";
  import HomeView from "./ui/views/HomeView.svelte";
  import PlanView from "./ui/views/PlanView.svelte";
  import NotesView from "./ui/views/NotesView.svelte";
  import SplitView from "./ui/views/SplitView.svelte";
  import TopBar from "./ui/views/TopBar.svelte";
  import BottomNav from "./ui/views/BottomNav.svelte";
  import Logo from "./ui/views/Logo.svelte";
  import StudyView from "./ui/views/StudyView.svelte";
  import type { Library } from "./ui/library.svelte";
  import type { SourceFile } from "./core/library/addDocuments";

  let { lib }: { lib: Library } = $props();
  let recursive = $state(true);

  onMount(() => {
    const off = lib.platform.onDrop(addFiles);
    return () => void off.then((f) => f());
  });

  /** New files show up in the library, so leave Bugün/Program for it. */
  const addFiles = async (files: SourceFile[]) => {
    if (files.length && lib.section !== "library") lib.section = "library";
    await lib.add(files);
  };
  const addPdfs = async () => addFiles(await lib.platform.pickers.pickPdfs());
  const addFolder = async () => addFiles(await lib.platform.pickers.pickFolder(recursive));
  import TimerAlert from "./ui/views/TimerAlert.svelte";
</script>

{#if lib.split}
  <SplitView {lib} docs={lib.split} />
{:else if lib.opened}
  {#key lib.opened.id}<ReaderView {lib} doc={lib.opened} />{/key}
{:else if lib.counts.all === 0}
  <main class="empty">
    <div class="welcome n-card">
      <Logo />
      <h1>Kütüphanen boş</h1>
      <p>Ders PDF'lerini ekleyerek başla. Dosyaları ya da klasörleri pencereye de sürükleyebilirsin.</p>
      <div class="row">
        <Button variant="primary" onclick={addPdfs}>PDF ekle</Button>
        <Button onclick={addFolder}>Klasör ekle</Button>
      </div>
      <label class="check"><input type="checkbox" bind:checked={recursive} /> Alt klasörleri ders olarak ekle</label>
    </div>
  </main>
{:else}
  <div class="shell">
    <Sidebar {lib} {addFolder} />
    <div class="main">
    <TopBar {lib} {addPdfs} />
    <div class="view">
    {#if lib.section === "home"}
      <HomeView {lib} />
    {:else if lib.section === "plan"}
      <PlanView {lib} />
    {:else if lib.section === "study"}
      <StudyView {lib} />
    {:else if lib.section === "notes"}
      <NotesView {lib} />
    {:else if lib.section === "ai" && lib.platform.ai}
      <AiView {lib} />
    {:else}
      <LibraryView {lib} {addFolder} />
    {/if}
    </div>
    <BottomNav {lib} />
    </div>
  </div>
{/if}
<AddProgress {lib} />

<TimerAlert />

<style>
  .shell { display: flex; height: 100%; overflow: hidden; }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .view { flex: 1; min-height: 0; display: flex; overflow: hidden; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
  .empty { height: 100%; overflow: auto; display: grid; place-items: center; padding: 16px; }
  .welcome { display: grid; justify-items: center; text-align: center; gap: 14px; padding: 40px 32px; max-width: 480px; box-shadow: var(--shadow-2); }
  .empty h1 { font-size: 28px; line-height: 36px; font-weight: 700; letter-spacing: -0.02em; margin: 4px 0 0; }
  .empty p { color: var(--text-2); margin: 0; max-width: 380px; font-size: 15px; }
  .check { display: flex; gap: 8px; align-items: center; color: var(--text-2); min-height: var(--hit); }
</style>
