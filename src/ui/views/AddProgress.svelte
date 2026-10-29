<script lang="ts">
  import Button from "../components/Button.svelte";
  import Dialog from "../components/Dialog.svelte";
  import ProgressBar from "../components/ProgressBar.svelte";
  import type { Library } from "../library.svelte";
  let { lib }: { lib: Library } = $props();
</script>

{#if lib.adding}
  <Dialog title="PDF'ler ekleniyor">
    <ProgressBar value={lib.adding.done} max={lib.adding.total} />
    <p class="muted">{lib.adding.done} / {lib.adding.total}</p>
    {#snippet actions()}
      <Button onclick={() => lib.adding?.abort.abort()}>İptal</Button>
    {/snippet}
  </Dialog>
{:else if lib.addSummary}
  <div class="toast" role="status">
    <span>{lib.addSummary}</span>
    <Button variant="ghost" onclick={() => (lib.addSummary = null)}>Tamam</Button>
  </div>
{/if}

<style>
  .muted { color: var(--text-2); margin: 8px 0 0; font-variant-numeric: tabular-nums; }
  .toast {
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 5;
    display: flex; align-items: center; gap: 12px; padding: 4px 4px 4px 16px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 6px 24px rgb(0 0 0 / 0.12);
  }
</style>
