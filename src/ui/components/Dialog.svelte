<script lang="ts">
  import type { Snippet } from "svelte";
  let { title, children, actions }: { title: string; children: Snippet; actions?: Snippet } = $props();
</script>

<div class="backdrop">
  <div class="dialog" role="dialog" aria-modal="true" aria-label={title}>
    <h2>{title}</h2>
    {@render children()}
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: var(--scrim); display: grid; place-items: center; z-index: 50; padding: 16px; }
  .dialog {
    width: min(460px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; background: var(--surface);
    border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 24px; box-shadow: var(--shadow-3);
  }
  h2 { margin: 0 0 16px; font-size: 18px; line-height: 26px; font-weight: 700; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; flex-wrap: wrap; }
</style>
