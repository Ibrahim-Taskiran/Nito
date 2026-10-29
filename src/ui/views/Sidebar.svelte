<script lang="ts">
  import type { LibraryFilter } from "../../core/types";
  import ThemeSwitch from "../components/ThemeSwitch.svelte";
  import type { Library, Section } from "../library.svelte";
  let { lib }: { lib: Library } = $props();

  const same = (a: LibraryFilter, b: LibraryFilter) =>
    a.kind === b.kind && (a.kind !== "course" || (b.kind === "course" && a.courseId === b.courseId));
  const tools: { s: Section; name: string }[] = $derived([
    { s: "study", name: "Çalışma Merkezi" },
    { s: "notes", name: "Notlar" },
    // Ollama runs on desktop only.
    ...(lib.platform.mobile ? [] : [{ s: "ai" as Section, name: "Yapay zekâ" }]),
  ]);
  const fixed = $derived([
    { f: { kind: "all" } as LibraryFilter, name: "Tümü", count: lib.counts.all },
    { f: { kind: "unread" } as LibraryFilter, name: "Okunmamış", count: lib.counts.unread },
    { f: { kind: "favorites" } as LibraryFilter, name: "Favoriler", count: lib.counts.favorites },
  ]);
</script>

<nav class="sidebar" aria-label="Kütüphane">
  <div class="brand">Nito</div>
  {#each fixed as item (item.name)}
    <button class="item" class:active={lib.section === "library" && same(lib.filter, item.f)} onclick={() => lib.setFilter(item.f)}>
      <span>{item.name}</span><span class="count">{item.count}</span>
    </button>
  {/each}
  <div class="heading">Çalışma</div>
  {#each tools as t (t.s)}
    <button class="item" class:active={lib.section === t.s} onclick={() => (lib.section = t.s)}>
      <span>{t.name}</span>
    </button>
  {/each}
  {#if lib.courses.length}
    <div class="heading">Dersler</div>
    {#each lib.courses as c (c.id)}
      {@const f = { kind: "course", courseId: c.id } as LibraryFilter}
      <button class="item" class:active={lib.section === "library" && same(lib.filter, f)} onclick={() => lib.setFilter(f)}>
        <span class="name">{c.name}</span><span class="count">{lib.counts.byCourse[c.id] ?? 0}</span>
      </button>
    {/each}
  {/if}
  <div class="foot"><ThemeSwitch /></div>
</nav>

<style>
  .sidebar { width: 232px; flex: none; display: flex; flex-direction: column; padding: 12px 8px; border-right: 1px solid var(--border); background: var(--surface); overflow-y: auto; }
  .foot { margin-top: auto; padding: 16px 4px 4px; }
  .brand { font-weight: 600; font-size: 15px; padding: 6px 12px 14px; color: var(--accent); }
  .heading { font-size: 12px; color: var(--text-2); padding: 16px 12px 6px; text-transform: uppercase; letter-spacing: 0.04em; }
  .item {
    width: 100%; min-height: var(--hit); display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 0 12px; border: 0; border-radius: var(--radius-sm); background: transparent; cursor: pointer; text-align: left;
  }
  .item:hover { background: var(--surface-2); }
  .item.active { background: var(--accent-soft); color: var(--accent); font-weight: 500; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .count { color: var(--text-2); font-size: 12px; font-variant-numeric: tabular-nums; }
</style>
