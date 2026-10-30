<script lang="ts">
  import { ArrowUpDown, ChevronDown, FolderPlus, GraduationCap, LayoutGrid, List } from "@lucide/svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { SORT_NAMES, type SortKey } from "../../core/library/browse";
  import type { Document, LibraryFilter } from "../../core/types";
  import { groupByWeek, type WeekGroup } from "../../core/week";
  import Button from "../components/Button.svelte";
  import type { Library } from "../library.svelte";
  import { shell } from "../shell.svelte";
  import DetailPanel from "./DetailPanel.svelte";
  import DocumentList from "./DocumentList.svelte";
  import DocCard from "./library/DocCard.svelte";
  import DocDialogs from "./library/DocDialogs.svelte";
  import DocMenu, { type DocAction } from "./library/DocMenu.svelte";

  /** Library main area: title row (filters, sort, view), course chips, week groups, detail panel. Search lives in TopBar. */
  let { lib, addFolder }: { lib: Library; addFolder: () => void } = $props();
  let menu = $state<{ doc: Document; x: number; y: number } | null>(null);
  let dialog = $state<{ kind: DocAction; doc: Document } | null>(null);
  const folded = new SvelteSet<string>();

  const groups = $derived<WeekGroup<Document>[]>(
    lib.sort === "week" ? groupByWeek(lib.visible) : [{ week: null, label: "", items: lib.visible }],
  );
  const courseFilter = $derived(lib.filter.kind === "course" ? lib.filter.courseId : null);
  const title = $derived(lib.courses.find((c) => c.id === courseFilter)?.name ?? "Kütüphane");
  const onmenu = (doc: Document, x: number, y: number) => (menu = { doc, x, y });
  const pages = (items: Document[]) => items.reduce((s, d) => s + (d.pageCount ?? 0), 0);
  const kinds: { f: LibraryFilter; name: string; n: () => number }[] = [
    { f: { kind: "all" }, name: "Tümü", n: () => lib.counts.all },
    { f: { kind: "unread" }, name: "Okunmamış", n: () => lib.counts.unread },
    { f: { kind: "favorites" }, name: "Favoriler", n: () => lib.counts.favorites },
  ];
  const fold = (label: string) => (folded.has(label) ? folded.delete(label) : folded.add(label));
</script>

<main class="center">
  <header class="head">
    <div class="titlerow">
      <h1>{title}</h1>
      <span class="n-badge">{lib.visible.length} belge</span>
      <div class="tools">
        <div class="seg" role="group" aria-label="Durum filtresi">
          {#each kinds as k (k.name)}
            <button aria-pressed={lib.filter.kind === k.f.kind} onclick={() => lib.setFilter(k.f)}>{k.name}<span class="n">{k.n()}</span></button>
          {/each}
        </div>
        <label class="sort" title="Sırala">
          <ArrowUpDown size={16} aria-hidden="true" />
          <select aria-label="Sırala" value={lib.sort} onchange={(e) => lib.setSort(e.currentTarget.value as SortKey)}>
            {#each Object.entries(SORT_NAMES) as [k, name] (k)}<option value={k}>{name}</option>{/each}
          </select>
        </label>
        <div class="seg icons" role="group" aria-label="Görünüm">
          <button aria-label="Izgara görünümü" title="Izgara" aria-pressed={lib.view === "grid"} onclick={() => lib.setView("grid")}><LayoutGrid size={18} /></button>
          <button aria-label="Liste görünümü" title="Liste" aria-pressed={lib.view === "list"} onclick={() => lib.setView("list")}><List size={18} /></button>
        </div>
        <Button onclick={addFolder}><FolderPlus size={18} aria-hidden="true" />Klasör ekle</Button>
      </div>
    </div>
    {#if lib.courses.length}
      <div class="chips" role="group" aria-label="Ders filtresi">
        <button class="n-chip" aria-pressed={courseFilter === null} onclick={() => lib.setFilter({ kind: "all" })}>Tüm dersler<span class="n">{lib.counts.all}</span></button>
        {#each lib.courses as c (c.id)}
          <button class="n-chip" aria-pressed={courseFilter === c.id} onclick={() => lib.setFilter({ kind: "course", courseId: c.id })}>
            {c.name}<span class="n">{lib.counts.byCourse[c.id] ?? 0}</span>
          </button>
        {/each}
      </div>
    {/if}
  </header>

  <div class="scroll">
    {#if !lib.visible.length}
      <div class="n-empty">
        {#if lib.query}
          <p><strong>“{lib.query}”</strong> ile eşleşen belge yok.</p>
          <button class="link" onclick={() => (lib.query = "")}>Aramayı temizle</button>
        {:else}
          <p><strong>Bu görünümde belge yok.</strong></p>
          <p>PDF ekleyebilir ya da dosyaları pencereye sürükleyebilirsin.</p>
        {/if}
      </div>
    {:else}
      {#each groups as g (g.label)}
        {@const open = !folded.has(g.label)}
        <section class="group">
          {#if g.label}
            <div class="whead">
              <span class="n-dot" aria-hidden="true"></span>
              <h3>{g.label}</h3>
              <span class="n-badge">{g.items.length} belge{#if pages(g.items)} · {pages(g.items)} sayfa{/if}</span>
              <button class="fold" aria-expanded={open} onclick={() => fold(g.label)}>
                {open ? "Daralt" : "Genişlet"}<ChevronDown size={16} aria-hidden="true" />
              </button>
            </div>
          {/if}
          {#if open}
            {#if lib.view === "list"}
              <DocumentList {lib} items={g.items} {onmenu} />
            {:else}
              <div class="grid">
                {#each g.items as d (d.id)}<DocCard {lib} doc={d} {onmenu} />{/each}
              </div>
            {/if}
          {/if}
        </section>
      {/each}
      {#if shell.due}
        <section class="review">
          <span class="n-icon-tile big"><GraduationCap size={26} /></span>
          <div class="rtext">
            <h2>Aralıklı tekrar kartları <span class="n-badge">{shell.due} bekleyen</span></h2>
            <p>Tanım ve Soru vurgularından oluşan kartların bugün tekrar zamanı geldi.</p>
          </div>
          <Button variant="primary" onclick={() => (lib.section = "study")}>Tekrara başla</Button>
        </section>
      {/if}
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
  .head { display: grid; gap: 14px; padding: 8px 28px 6px; }
  .titlerow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  h1 { font-size: 30px; line-height: 38px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
  .tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-left: auto; }
  .sort {
    display: flex; align-items: center; gap: 6px; padding-left: 12px; color: var(--text-2);
    min-height: var(--hit); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); box-shadow: var(--shadow-1);
  }
  .sort select {
    border: 0; background: transparent; color: var(--text); font: 600 14px/1 var(--font-label); min-height: calc(var(--hit) - 2px);
    padding: 0 10px 0 0; cursor: pointer; outline: none;
  }
  .sort select option { background: var(--surface); color: var(--text); }
  .sort:focus-within { border-color: var(--accent); }
  .seg { display: flex; padding: 3px; gap: 2px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); box-shadow: var(--shadow-1); }
  .seg button {
    min-height: calc(var(--hit) - 8px); padding: 0 12px; border: 0; border-radius: 8px; background: transparent; color: var(--text-2);
    cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font: 600 13px/1 var(--font-label);
  }
  .seg.icons button { width: calc(var(--hit) - 4px); padding: 0; justify-content: center; }
  .seg button:hover { color: var(--text); }
  .seg button[aria-pressed="true"] { background: var(--accent-strong); color: var(--on-accent); }
  .seg .n { font-size: 11px; opacity: 0.75; font-variant-numeric: tabular-nums; }
  .chips { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; padding: 2px 0 4px; }
  .scroll { flex: 1; overflow-y: auto; padding: 4px 28px 40px; }
  .group + .group { margin-top: 8px; }
  .whead { display: flex; align-items: center; gap: 10px; margin: 18px 2px 12px; }
  .whead .n-dot { background: var(--accent-strong); }
  h3 { font-size: 24px; line-height: 30px; font-weight: 700; margin: 0; letter-spacing: -0.02em; }
  .fold {
    margin-left: auto; display: inline-flex; align-items: center; gap: 4px; min-height: var(--hit); padding: 0 10px; border: 0;
    border-radius: var(--radius-sm); background: transparent; color: var(--text-2); cursor: pointer; font: 600 13px/1 var(--font-label);
  }
  .fold:hover { background: var(--surface-2); color: var(--text); }
  .fold[aria-expanded="false"] :global(svg) { transform: rotate(-90deg); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 18px; }
  .group:first-child .grid:first-child { margin-top: 16px; }
  .review {
    margin-top: 32px; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; padding: 22px 24px;
    border-radius: var(--radius-lg); background: var(--surface-3); border: 1px solid var(--border);
  }
  .n-icon-tile.big { width: 56px; height: 56px; background: var(--accent-strong); color: var(--on-accent); }
  .rtext { flex: 1 1 260px; min-width: 0; }
  .review h2 { margin: 0 0 4px; font-size: 20px; line-height: 28px; font-weight: 700; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .review p { margin: 0; color: var(--text-2); }
  .link { border: 0; background: transparent; color: var(--accent); cursor: pointer; min-height: var(--hit); text-decoration: underline; }
  @media (max-width: 719px) {
    .head { padding: 4px 16px 4px; }
    .scroll { padding: 4px 16px 32px; }
    h1 { font-size: 24px; line-height: 32px; }
    .tools { margin-left: 0; }
    .grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
    h3 { font-size: 20px; }
  }
</style>
