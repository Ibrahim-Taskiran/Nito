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
    min-height: var(--hit); padding: 0 18px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong); background: var(--surface); color: var(--accent-strong); cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; touch-action: manipulation;
    font: 600 14px/1 var(--font-label); letter-spacing: 0.01em; transition: background 0.12s, transform 0.08s, filter 0.12s;
  }
  .btn:hover:not(:disabled) { background: var(--surface-2); }
  .btn:active:not(:disabled) { transform: scale(0.98); }
  .primary { background: var(--accent-strong); border-color: var(--accent-strong); color: var(--on-accent); box-shadow: var(--shadow-1); }
  .primary:hover:not(:disabled) { background: var(--accent-strong); filter: brightness(1.12); }
  .ghost { border-color: transparent; background: transparent; color: var(--text-2); }
  .ghost:hover:not(:disabled) { color: var(--text); }
  .danger { background: var(--danger); border-color: var(--danger); color: var(--on-accent); }
  .danger:hover:not(:disabled) { background: var(--danger); filter: brightness(1.08); }
  .btn:disabled { opacity: 0.5; cursor: default; }
</style>
