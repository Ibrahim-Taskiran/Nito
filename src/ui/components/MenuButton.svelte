<script lang="ts">
  import type { Snippet } from "svelte";

  /** Tool button that opens a small panel below it. Closes on a tap outside or Escape. `pressed`: a tool group in use. */
  let { label, title, pressed, onopen, icon, children }: {
    label: string;
    title?: string;
    pressed?: boolean;
    /** Runs when the panel opens. */
    onopen?: () => void;
    icon: Snippet;
    children: Snippet<[() => void]>;
  } = $props();

  let open = $state(false);
  let root: HTMLDivElement;
  const close = () => (open = false);

  function toggle() {
    if (!open) onopen?.();
    open = !open;
  }

  function onDocDown(e: PointerEvent) {
    if (open && !root.contains(e.target as Node)) open = false;
  }

  function onKey(e: KeyboardEvent) {
    if (open && e.key === "Escape") {
      e.preventDefault(); // the reader must not close
      open = false;
    }
  }
</script>

<svelte:window onpointerdown={onDocDown} onkeydown={onKey} />

<div class="menu" bind:this={root}>
  <button class="tool" title={title ?? label} aria-haspopup="true" aria-expanded={open} aria-pressed={pressed} onclick={toggle}>
    {@render icon()}<span>{label}</span>
  </button>
  {#if open}
    <div class="panel" role="group" aria-label={label}>{@render children(close)}</div>
  {/if}
</div>

<style>
  .menu { position: relative; flex: none; }
  .tool {
    min-height: var(--hit); min-width: var(--hit); padding: 0 10px; border: 0; border-radius: var(--radius-sm);
    background: transparent; color: var(--text-2); cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
    font: inherit; font-size: 13px; white-space: nowrap; touch-action: manipulation;
  }
  .tool:hover { background: var(--surface-2); color: var(--text); }
  .tool[aria-expanded="true"], .tool[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
  .panel {
    position: absolute; top: calc(100% + 4px); left: 0; z-index: 30; min-width: 230px; padding: 4px;
    display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); box-shadow: 0 8px 28px rgb(0 0 0 / 0.16);
  }
  .panel :global(.item) {
    min-height: var(--hit); display: flex; align-items: center; gap: 10px; padding: 0 10px; border: 0; border-radius: var(--radius-sm);
    background: transparent; color: var(--text); font: inherit; font-size: 13px; text-align: left; cursor: pointer; touch-action: manipulation;
  }
  .panel :global(.item:hover) { background: var(--surface-2); }
  .panel :global(.item input) { width: 18px; height: 18px; accent-color: var(--accent); margin: 0; }
  .panel :global(.item:disabled) { opacity: 0.5; cursor: default; }
  .panel :global(.hint) { padding: 4px 10px 6px; color: var(--text-2); font-size: 12px; }
</style>
