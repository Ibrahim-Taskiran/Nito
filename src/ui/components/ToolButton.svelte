<script lang="ts">
  import type { Snippet } from "svelte";
  /** Icon with a short visible label under or beside it. Touch-sized (min 40px). */
  let { label, title, pressed, disabled = false, onclick, children }: {
    label: string;
    title?: string;
    pressed?: boolean;
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  } = $props();
</script>

<button class="tool" title={title ?? label} aria-pressed={pressed} {disabled} {onclick}>
  {@render children()}<span>{label}</span>
</button>

<style>
  .tool {
    min-height: var(--hit); min-width: var(--hit); padding: 0 10px; border: 0; border-radius: var(--radius-sm);
    background: transparent; color: var(--text-2); cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
    font: inherit; font-size: 13px; white-space: nowrap; flex: none; touch-action: manipulation;
  }
  .tool:hover:not(:disabled) { background: var(--surface-2); color: var(--text); }
  .tool[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
  .tool:disabled { opacity: 0.5; cursor: default; }
</style>
