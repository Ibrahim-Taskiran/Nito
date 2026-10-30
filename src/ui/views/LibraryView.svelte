<script lang="ts">
  import { ArrowUpDown, LayoutGrid, List, Search, X } from "@lucide/svelte";
  import type { Snippet } from "svelte";
  import { SORT_NAMES, type SortKey } from "../../core/library/browse";
  import type { Document } from "../../core/types";
  import { groupByWeek, type WeekGroup } from "../../core/week";
  import type { Library } from "../library.svelte";
  import DetailPanel from "./DetailPanel.svelte";
  import DocumentList from "./DocumentList.svelte";
  import DocCard from "./library/DocCard.svelte";
  import DocDialogs from "./library/DocDialogs.svelte";
  import DocMenu, { type DocAction } from "./library/DocMenu.svelte";

  /** Library main area: toolbar (search, course chips, sort, view), grid or list, detail panel. */
  let { lib, addButtons }: { lib: Library; addButtons: Snippet } = $props();
  let search: HTMLInputElement;
  let menu = $state<{ doc: Document; x: number; y: number } | null>(null);
  let dialog = $state<{ kind: DocAction; doc: Document } | null>(null);

  const groups = $derived<WeekGroup<Document>[]>(
    lib.sort === "week" ? groupByWeek(lib.visible) : [{ week: null, label: "", items: lib.visible }],
  );
  const courseFilter = $derived(lib.filter.kind === "course" ? lib.filter.courseId : null);
  const onmenu = (doc: Document, x: number, y: number) => (menu = { doc, x, y });

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

<main class="center">
  <header class="toolbar">
    <div class="top">
      <label class="search">
        <Search size={16} aria-hidden="true" />
        <input bind:this={search} bind:value={lib.query} type="search" placeholder="Belge ya da ders ara…" aria-label="Ara" aria-keyshortcuts="Control+K" />
        {#if lib.query}
          <button class="clear" aria-label="Aramayı temizle" onclick={() => { lib.query = ""; search.focus(); }}><X size={14} /></button>
        {:else}
          <kbd>Ctrl K</kbd>
        {/if}
      </label>
      <label class="sort" title="Sırala">
        <ArrowUpDown size={15} aria-hidden="true" />
        <select aria-label="Sırala" value={lib.sort} onchange={(e) => lib.setSort(e.currentTarget.value as SortKey)}>
          {#each Object.entries(SORT_NAMES) as [k, name] (k)}<option value={k}>{name}</option>{/each}
        </select>
      </label>
      <div class="seg" role="group" aria-label="Görünüm">
        <button aria-label="Izgara görünümü" title="Izgara" aria-pressed={lib.view === "grid"} onclick={() => lib.setView("grid")}><LayoutGrid size={16} /></button>
        <button aria-label="Liste görünümü" title="Liste" aria-pressed={lib.view === "list"} onclick={() => lib.setView("list")}><List size={16} /></button>
      </div>
      <div class="add">{@render addButtons()}</div>
    </div>
    {#if lib.courses.length}
      <div class="chips" role="group" aria-label="Ders filtresi">
        <button class="chip" aria-pressed={courseFilter === null} onclick={() => lib.setFilter({ kind: "all" })}>Tüm dersler</button>
        {#each lib.courses as c (c.id)}
          <button class="chip" aria-pressed={courseFilter === c.id} onclick={() => lib.setFilter({ kind: "course", courseId: c.id })}>
            {c.name}<span class="n">{lib.counts.byCourse[c.id] ?? 0}</span>
          </button>
        {/each}
      </div>
    {/if}
  </header>

  <div class="scroll">
    {#if !lib.visible.length}
      <div class="none">
        {#if lib.query}
          <p><strong>“{lib.query}”</strong> ile eşleşen belge yok.</p>
          <button class="link" onclick={() => (lib.query = "")}>Aramayı temizle</button>
        {:else}
          <p>Bu görünümde belge yok.</p>
          <p class="muted">PDF ekleyebilir ya da dosyaları pencereye sürükleyebilirsin.</p>
        {/if}
      </div>
    {:else if lib.view === "list"}
      <DocumentList {lib} {groups} {onmenu} />
    {:else}
      {#each groups as g (g.label)}
        <section>
          {#if g.label}<h3>{g.label}</h3>{/if}
          <div class="grid">
            {#each g.items as d (d.id)}<DocCard {lib} doc={d} {onmenu} />{/each}
          </div>
        </section>
      {/each}
    {/if}
  </div>
</main>
<DetailPanel {lib} />

{#if menu}
  <DocMenu {lib} doc={menu.doc} x={menu.x} y={menu.y} onclose={() => (menu = null)} onaction={(kind, doc) => (dialog = { kind, doc })} />
{/if}
{#if dialog}
  {#key dialog}<DocDialogs {lib} kind={dialog.kind} doc={dialog.doc} onclose={() => (dialog = null)} />{/key}
{/if}

<style>
  .center { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .toolbar { display: grid; gap: 10px; padding: 12px 20px; border-bottom: 1px solid var(--border); background: var(--surface); }
  .top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .search {
    flex: 1 1 220px; min-width: 0; max-width: 460px; display: flex; align-items: center; gap: 8px; padding: 0 10px;
    min-height: var(--hit); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); color: var(--text-2);
  }
  .search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  .search input { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--text); font: inherit; outline: none; }
  .search input::-webkit-search-cancel-button { display: none; }
  kbd { font: 11px var(--font); padding: 2px 6px; border: 1px solid var(--border); border-radius: 4px; color: var(--text-2); white-space: nowrap; }
  .clear { border: 0; background: transparent; color: var(--text-2); cursor: pointer; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; }
  .clear:hover { background: var(--surface-2); color: var(--text); }
  .sort {
    position: relative; display: flex; align-items: center; gap: 6px; padding-left: 10px; color: var(--text-2);
    min-height: var(--hit); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface);
  }
  .sort select { border: 0; background: transparent; color: var(--text); font: inherit; min-height: calc(var(--hit) - 2px); padding: 0 8px 0 0; cursor: pointer; outline: none; }
  .sort select option { background: var(--surface); color: var(--text); }
  .sort:focus-within { border-color: var(--accent); }
  .seg { display: flex; border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
  .seg button { width: var(--hit); height: calc(var(--hit) - 2px); border: 0; background: var(--surface); color: var(--text-2); cursor: pointer; display: grid; place-items: center; }
  .seg button + button { border-left: 1px solid var(--border); }
  .seg button[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
  .add { display: flex; gap: 8px; margin-left: auto; }
  .chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
  .chip {
    flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 12px; border-radius: 999px;
    border: 1px solid var(--border); background: var(--surface); color: var(--text-2); cursor: pointer; font-size: 13px;
  }
  .chip:hover { color: var(--text); background: var(--surface-2); }
  .chip[aria-pressed="true"] { background: var(--accent-soft); border-color: transparent; color: var(--accent); font-weight: 600; }
  .chip .n { font-size: 11px; opacity: 0.75; font-variant-numeric: tabular-nums; }
  .scroll { flex: 1; overflow-y: auto; padding: 4px 20px 32px; }
  h3 { font-size: 12px; font-weight: 600; color: var(--text-2); margin: 18px 2px 10px; text-transform: none; letter-spacing: 0.01em; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 14px; }
  section:first-child h3 { margin-top: 14px; }
  .grid:first-child { margin-top: 16px; }
  .none { display: grid; justify-items: center; gap: 6px; padding: 64px 16px; text-align: center; color: var(--text); }
  .none p { margin: 0; }
  .muted { color: var(--text-2); }
  .link { border: 0; background: transparent; color: var(--accent); cursor: pointer; min-height: var(--hit); text-decoration: underline; }
  @media (max-width: 640px) {
    .toolbar, .scroll { padding-left: 16px; padding-right: 16px; }
    .grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
    kbd { display: none; }
  }
</style>
