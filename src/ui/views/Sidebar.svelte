<script lang="ts">
  import { BookOpen, CalendarDays, Folder, GraduationCap, House, Library as LibraryIcon, NotebookPen, Sparkles, Star } from "@lucide/svelte";
  import type { Component } from "svelte";
  import type { LibraryFilter } from "../../core/types";
  import BackupButtons from "../components/BackupButtons.svelte";
  import ThemeSwitch from "../components/ThemeSwitch.svelte";
  import type { Library, Section } from "../library.svelte";
  let { lib }: { lib: Library } = $props();

  type Icon = Component<{ size?: number; "aria-hidden"?: boolean }>;
  const same = (a: LibraryFilter, b: LibraryFilter) =>
    a.kind === b.kind && (a.kind !== "course" || (b.kind === "course" && a.courseId === b.courseId));
  const top: { s: Section; name: string; icon: Icon }[] = [
    { s: "home", name: "Bugün", icon: House },
    { s: "plan", name: "Program", icon: CalendarDays },
  ];
  const tools: { s: Section; name: string; icon: Icon }[] = $derived([
    { s: "study", name: "Çalışma Merkezi", icon: GraduationCap },
    { s: "notes", name: "Notlar", icon: NotebookPen },
    // Ollama runs on desktop only.
    ...(lib.platform.mobile ? [] : [{ s: "ai" as Section, name: "Yapay zekâ", icon: Sparkles }]),
  ]);
  const fixed: { f: LibraryFilter; name: string; count: number; icon: Icon }[] = $derived([
    { f: { kind: "all" }, name: "Tümü", count: lib.counts.all, icon: LibraryIcon },
    { f: { kind: "unread" }, name: "Okunmamış", count: lib.counts.unread, icon: BookOpen },
    { f: { kind: "favorites" }, name: "Favoriler", count: lib.counts.favorites, icon: Star },
  ]);
</script>

{#snippet row(Ico: Icon, name: string, active: boolean, onclick: () => void, count?: number)}
  <button class="item" class:active aria-current={active ? "page" : undefined} {onclick}>
    <Ico size={18} aria-hidden={true} />
    <span class="name">{name}</span>
    {#if count !== undefined}<span class="count">{count}</span>{/if}
  </button>
{/snippet}

<nav class="sidebar" aria-label="Gezinti">
  <div class="brand">Nito</div>
  {#each top as t (t.s)}
    {@render row(t.icon, t.name, lib.section === t.s, () => (lib.section = t.s))}
  {/each}
  <div class="heading">Kütüphane</div>
  {#each fixed as item (item.name)}
    {@render row(item.icon, item.name, lib.section === "library" && same(lib.filter, item.f), () => lib.setFilter(item.f), item.count)}
  {/each}
  <div class="heading">Çalışma</div>
  {#each tools as t (t.s)}
    {@render row(t.icon, t.name, lib.section === t.s, () => (lib.section = t.s))}
  {/each}
  {#if lib.courses.length}
    <div class="heading">Dersler</div>
    {#each lib.courses as c (c.id)}
      {@const f = { kind: "course", courseId: c.id } as LibraryFilter}
      {@render row(Folder, c.name, lib.section === "library" && same(lib.filter, f), () => lib.setFilter(f), lib.counts.byCourse[c.id] ?? 0)}
    {/each}
  {/if}
  <div class="foot">
    <ThemeSwitch />
    {#if lib.platform.backup}<BackupButtons backup={lib.platform.backup} />{/if}
  </div>
</nav>

<style>
  .sidebar { width: 232px; flex: none; display: flex; flex-direction: column; gap: 1px; padding: 12px 8px; border-right: 1px solid var(--border); background: var(--surface); overflow-y: auto; }
  .foot { margin-top: auto; padding: 16px 4px 4px; }
  .brand { font-weight: 600; font-size: 15px; padding: 6px 12px 14px; color: var(--accent); }
  .heading { font-size: 12px; color: var(--text-2); padding: 16px 12px 6px; text-transform: uppercase; letter-spacing: 0.04em; }
  .item {
    width: 100%; min-height: var(--hit); display: flex; align-items: center; gap: 10px; flex: none;
    padding: 0 12px; border: 0; border-radius: var(--radius-sm); background: transparent; cursor: pointer; text-align: left;
  }
  .item :global(svg) { flex: none; color: var(--text-2); }
  .item:hover { background: var(--surface-2); }
  .item.active { background: var(--accent-soft); color: var(--accent); font-weight: 500; }
  .item.active :global(svg) { color: var(--accent); }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .count { color: var(--text-2); font-size: 12px; font-variant-numeric: tabular-nums; }
</style>
