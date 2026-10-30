<script lang="ts">
  import { CalendarCheck, Columns3, GraduationCap, LibraryBig, NotebookPen } from "@lucide/svelte";
  import type { Library, Section } from "../library.svelte";

  /** Phone-width tab bar for the five main screens; the drawer holds the rest. */
  let { lib }: { lib: Library } = $props();
  const tabs = [
    { s: "home", name: "Bugün", icon: CalendarCheck },
    { s: "plan", name: "Program", icon: Columns3 },
    { s: "library", name: "Kütüphane", icon: LibraryBig },
    { s: "study", name: "Çalışma", icon: GraduationCap },
    { s: "notes", name: "Notlar", icon: NotebookPen },
  ] as const;
  const go = (s: Section) => (s === "library" ? void lib.setFilter({ kind: "all" }) : (lib.section = s));
</script>

<nav class="tabs" aria-label="Alt gezinti">
  {#each tabs as t (t.s)}
    <button aria-current={lib.section === t.s ? "page" : undefined} onclick={() => go(t.s)}>
      <t.icon size={22} aria-hidden={true} /><span>{t.name}</span>
    </button>
  {/each}
</nav>

<style>
  .tabs { display: none; }
  @media (max-width: 719px) {
    .tabs {
      display: grid; grid-template-columns: repeat(5, 1fr); flex: none; background: var(--surface); border-top: 1px solid var(--border);
      padding: 4px 4px calc(4px + env(safe-area-inset-bottom));
    }
    button {
      min-height: 56px; display: grid; justify-items: center; align-content: center; gap: 3px; border: 0; background: transparent;
      color: var(--text-2); cursor: pointer; font: 600 11px/1 var(--font-label); letter-spacing: 0.02em; border-radius: var(--radius-sm);
      touch-action: manipulation;
    }
    button[aria-current="page"] { color: var(--accent-strong); }
    button[aria-current="page"] :global(svg) { background: var(--accent-soft); border-radius: var(--pill); padding: 3px 14px; width: 52px; height: 28px; }
  }
</style>
