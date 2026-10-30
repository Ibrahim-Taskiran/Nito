<script lang="ts">
  import { CalendarCheck, Columns3, Folder, FolderPlus, GraduationCap, LibraryBig, NotebookPen, PanelLeft, Sparkles } from "@lucide/svelte";
  import type { Component } from "svelte";
  import { isoDay } from "../../core/plan/plan";
  import { dueCards } from "../../core/study/cards";
  import { StudyRepo } from "../../core/study/studyRepo";
  import type { LibraryFilter } from "../../core/types";
  import BackupButtons from "../components/BackupButtons.svelte";
  import ThemeSwitch from "../components/ThemeSwitch.svelte";
  import type { Library, Section } from "../library.svelte";
  import { shell } from "../shell.svelte";
  import Logo from "./Logo.svelte";

  let { lib, addFolder }: { lib: Library; addFolder: () => void } = $props();

  type Icon = Component<{ size?: number; "aria-hidden"?: boolean }>;
  // svelte-ignore state_referenced_locally
  const study = new StudyRepo(lib.platform.db);
  $effect(() => {
    void lib.section; // recount when the user moves between screens (cards are reviewed in Çalışma)
    const today = isoDay(new Date());
    study.listCards(null, today).then((c) => (shell.due = dueCards(c, today).length), () => {});
  });

  const main: { s: Section; name: string; icon: Icon; count?: number }[] = $derived([
    { s: "home", name: "Bugün", icon: CalendarCheck },
    { s: "plan", name: "Program", icon: Columns3 },
    { s: "library", name: "Kütüphane", icon: LibraryBig, count: lib.counts.all },
    { s: "study", name: "Çalışma Merkezi", icon: GraduationCap, count: shell.due || undefined },
    { s: "notes", name: "Notlar", icon: NotebookPen },
    // AI exists on desktop only (Platform.ai is undefined on Android and iOS).
    ...(!lib.platform.ai ? [] : [{ s: "ai" as Section, name: "Yapay zekâ", icon: Sparkles }]),
  ]);
  const courseActive = (id: number) => lib.section === "library" && lib.filter.kind === "course" && lib.filter.courseId === id;

  function go(s: Section) {
    if (s === "library") void lib.setFilter({ kind: "all" });
    else lib.section = s;
    shell.drawer = false;
  }
  function course(id: number) {
    void lib.setFilter({ kind: "course", courseId: id } as LibraryFilter);
    shell.drawer = false;
  }
</script>

{#snippet row(Ico: Icon, name: string, active: boolean, onclick: () => void, count?: number, hot?: boolean)}
  <button class="item" class:active aria-label={name} title={shell.collapsed ? name : undefined} aria-current={active ? "page" : undefined} {onclick}>
    <Ico size={20} aria-hidden={true} />
    <span class="name">{name}</span>
    {#if count !== undefined}<span class="count" class:hot>{count}</span>{/if}
  </button>
{/snippet}

{#if shell.drawer}<button class="scrim" aria-label="Menüyü kapat" onclick={() => (shell.drawer = false)}></button>{/if}
<nav class="sidebar" class:rail={shell.collapsed} class:open={shell.drawer} aria-label="Gezinti">
  <div class="brand">
    <Logo />
    <span class="brandtext"><strong>Nito</strong><small>Çalışma Alanı</small></span>
    <button class="collapse" aria-label={shell.collapsed ? "Kenar çubuğunu genişlet" : "Kenar çubuğunu daralt"}
      title={shell.collapsed ? "Genişlet" : "Daralt"} onclick={() => shell.toggleCollapsed()}><PanelLeft size={20} /></button>
  </div>

  <div class="heading n-eyebrow">Ana menü</div>
  {#each main as m (m.s)}
    {@const active = lib.section === m.s && (m.s !== "library" || lib.filter.kind !== "course")}
    {@render row(m.icon, m.name, active, () => go(m.s), m.count, m.s === "study")}
  {/each}

  <div class="heading n-eyebrow courses">
    <span>Derslerim</span>
    <button class="plus" aria-label="Klasörden ders ekle" title="Klasörden ders ekle" onclick={addFolder}><FolderPlus size={18} /></button>
  </div>
  {#each lib.courses as c (c.id)}
    {@render row(Folder, c.name, courseActive(c.id), () => course(c.id), lib.counts.byCourse[c.id] ?? 0)}
  {:else}
    <p class="hint">Bir klasör eklediğinde alt klasörleri ders olur.</p>
  {/each}

  <div class="foot">
    <ThemeSwitch />
    {#if lib.platform.backup}<BackupButtons backup={lib.platform.backup} />{/if}
  </div>
</nav>

<style>
  .sidebar {
    width: 264px; flex: none; display: flex; flex-direction: column; gap: 2px; padding: 16px 14px 14px;
    background: var(--sidebar); border-right: 1px solid var(--border); overflow-y: auto; overflow-x: hidden;
    transition: width 0.18s ease;
  }
  .brand { display: flex; align-items: center; gap: 12px; padding: 0 2px 14px 4px; }
  .brandtext { display: grid; flex: 1; min-width: 0; line-height: 1.15; }
  .brandtext strong { font-size: 20px; font-weight: 700; color: var(--accent-strong); letter-spacing: -0.02em; }
  .brandtext small { font: 500 12px/16px var(--font-label); color: var(--text-2); }
  .collapse, .plus {
    width: var(--hit); height: var(--hit); flex: none; display: grid; place-items: center; border: 0; border-radius: var(--radius-sm);
    background: transparent; color: var(--text-2); cursor: pointer;
  }
  .collapse:hover, .plus:hover { background: var(--surface-3); color: var(--text); }
  .heading { padding: 18px 10px 8px; }
  .courses { display: flex; align-items: center; justify-content: space-between; padding-top: 10px; padding-bottom: 0; margin-top: 12px; }
  .plus { margin-right: -10px; }
  .item {
    width: 100%; min-height: var(--hit); display: flex; align-items: center; gap: 12px; flex: none;
    padding: 0 12px; border: 0; border-radius: var(--radius-sm); background: transparent; cursor: pointer; text-align: left;
    color: var(--text); font-size: 15px; touch-action: manipulation; transition: background 0.12s;
  }
  .item :global(svg) { flex: none; color: var(--text-2); }
  .item:hover { background: var(--surface-3); }
  .item.active { background: var(--accent-soft); color: var(--accent-strong); font-weight: 700; }
  .item.active :global(svg) { color: var(--accent-strong); }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .count { color: var(--text-2); font: 600 12px/1 var(--font-label); font-variant-numeric: tabular-nums; padding: 4px 8px; border-radius: var(--pill); }
  .count.hot { background: var(--accent-soft); color: var(--accent-strong); }
  .item.active .count { background: var(--surface); }
  .hint { margin: 0; padding: 4px 12px; color: var(--text-2); font-size: 13px; }
  .foot { margin-top: auto; padding-top: 20px; }

  .rail { width: 76px; padding-left: 14px; padding-right: 14px; }
  .rail .brand { flex-direction: column; padding: 0 0 8px; gap: 6px; }
  .rail .brandtext, .rail .name, .rail .count, .rail .heading span, .rail .hint, .rail .foot, .rail .n-eyebrow:not(.courses) { display: none; }
  .rail .courses { justify-content: center; padding: 8px 0; border-top: 1px solid var(--border); border-radius: 0; }
  .rail .plus { margin: 0; }
  .rail .item { justify-content: center; padding: 0; }

  .scrim { display: none; }
  @media (max-width: 719px) {
    .sidebar, .rail {
      position: fixed; inset: 0 auto 0 0; z-index: 40; width: min(300px, 86vw); padding: 16px 14px;
      transform: translateX(-102%); transition: transform 0.2s ease; box-shadow: var(--shadow-3); visibility: hidden;
    }
    .sidebar.open { transform: none; visibility: visible; }
    .rail .brand { flex-direction: row; padding: 0 2px 14px 4px; gap: 12px; }
    .rail .brandtext, .rail .name, .rail .count, .rail .hint, .rail .foot, .rail .n-eyebrow:not(.courses), .rail .heading span { display: revert; }
    .rail .brandtext { display: grid; }
    .rail .foot { display: block; }
    .rail .item { justify-content: flex-start; padding: 0 12px; }
    .collapse { display: none; }
    .scrim { display: block; position: fixed; inset: 0; z-index: 39; border: 0; background: var(--scrim); }
  }
  @media (prefers-reduced-motion: reduce) { .sidebar { transition: none; } }
</style>
