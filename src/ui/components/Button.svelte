<script lang="ts">
  import type { Snippet } from "svelte";
  let { variant = "default", disabled = false, onclick, children }: {
    variant?: "default" | "primary" | "ghost" | "danger";
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  } = $props();
</script>

<button class="btn {variant}" {disabled} {onclick}>{@render children()}</button>

<style>
  .btn {
    min-height: var(--hit); padding: 0 16px; border-radius: var(--radius-sm);
    border: 1px solid var(--border); background: var(--surface); cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px; white-space: nowrap;
  }
  .btn:hover:not(:disabled) { background: var(--surface-2); }
  .primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .primary:hover:not(:disabled) { background: var(--accent); filter: brightness(1.08); }
  .ghost { border-color: transparent; background: transparent; }
  .danger { background: var(--danger); border-color: var(--danger); color: var(--on-accent); }
  .danger:hover:not(:disabled) { background: var(--danger); filter: brightness(1.08); }
  .btn:disabled { opacity: 0.5; cursor: default; }
</style>
