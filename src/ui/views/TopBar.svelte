<script lang="ts">
  import { FilePlus, Menu, Search, X } from "@lucide/svelte";
  import Button from "../components/Button.svelte";
  import type { Library } from "../library.svelte";
  import { shell } from "../shell.svelte";

  /** Global search (title + course, results in Kütüphane) and the add action. Ctrl+K focuses the search. */
  let { lib, addPdfs }: { lib: Library; addPdfs: () => void } = $props();
  let search: HTMLInputElement;

  function oninput() {
    if (lib.query && lib.section !== "library") lib.section = "library";
  }

  function onkeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      search.focus();
      search.select();
    } else if (e.key === "Escape" && document.activeElement === search && lib.query) {
      lib.query = "";
    }
  }
</script>

<svelte:window {onkeydown} />

<header class="topbar">
  <button class="menu" aria-label="Menü" onclick={() => (shell.drawer = true)}><Menu size={22} /></button>
  <label class="search">
    <Search size={18} aria-hidden="true" />
    <input bind:this={search} bind:value={lib.query} {oninput} type="search" placeholder="Belge ya da ders ara…" aria-label="Ara" aria-keyshortcuts="Control+K" />
    {#if lib.query}
      <button class="clear" aria-label="Aramayı temizle" onclick={() => { lib.query = ""; search.focus(); }}><X size={16} /></button>
    {:else}
      <kbd class="n-kbd">Ctrl K</kbd>
    {/if}
  </label>
  <div class="actions">
    <Button variant="primary" onclick={addPdfs}><FilePlus size={18} aria-hidden="true" /><span class="lbl">PDF ekle</span></Button>
  </div>
</header>

<style>
  .topbar { display: flex; align-items: center; gap: 12px; padding: 14px 28px; flex: none; }
  .menu {
    display: none; width: var(--hit); height: var(--hit); flex: none; place-items: center; border: 0; border-radius: var(--radius-sm);
    background: transparent; color: var(--text); cursor: pointer;
  }
  .search {
    flex: 1 1 auto; min-width: 0; max-width: 560px; display: flex; align-items: center; gap: 10px; padding: 0 8px 0 14px;
    min-height: 46px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-2); color: var(--text-2);
    transition: border-color 0.12s, box-shadow 0.12s, background 0.12s;
  }
  .search:focus-within { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-soft); }
  .search input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--text); outline: none; font-size: 15px; }
  .search input::placeholder { color: var(--text-2); }
  .search input::-webkit-search-cancel-button { display: none; }
  .clear { border: 0; background: transparent; color: var(--text-2); cursor: pointer; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; }
  .clear:hover { background: var(--surface-3); color: var(--text); }
  .actions { margin-left: auto; display: flex; gap: 8px; }
  @media (max-width: 719px) {
    .topbar { padding: 10px 12px; gap: 6px; }
    .menu { display: grid; }
    kbd { display: none; }
    .lbl { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .actions :global(.btn) { padding: 0 12px; }
  }
</style>
