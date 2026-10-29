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
  .backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.28); display: grid; place-items: center; z-index: 10; }
  .dialog {
    width: min(440px, calc(100vw - 32px)); background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 20px; box-shadow: 0 12px 40px rgb(0 0 0 / 0.18);
  }
  h2 { margin: 0 0 12px; font-size: 16px; font-weight: 600; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
