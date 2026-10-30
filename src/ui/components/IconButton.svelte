<script lang="ts">
  import type { Snippet } from "svelte";
  let { label, pressed, onclick, children }: {
    label: string;
    pressed?: boolean;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  } = $props();
</script>

<button class="icon" aria-label={label} title={label} aria-pressed={pressed} {onclick}>{@render children()}</button>

<style>
  .icon {
    width: var(--hit); height: var(--hit); border-radius: var(--radius-sm); border: 0;
    background: transparent; cursor: pointer; display: inline-grid; place-items: center;
    color: var(--text-2); font-size: 18px; flex: none; touch-action: manipulation; transition: background 0.12s;
  }
  .icon:hover { background: var(--surface-2); color: var(--text); }
  .icon:active { transform: scale(0.96); }
  .icon[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
</style>
