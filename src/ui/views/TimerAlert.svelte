<script lang="ts">
  import { AlarmClock } from "@lucide/svelte";
  import { studyTimer as t } from "../timer.svelte";
</script>

{#if t.ringing}
  <div class="alert" role="alertdialog" aria-label="Süre doldu">
    <AlarmClock size={22} />
    <strong>Süre doldu</strong>
    <button onclick={() => (t.ringing = false)}>Tamam</button>
  </div>
{/if}

<style>
  .alert {
    position: fixed; left: 50%; top: 16px; transform: translateX(-50%); z-index: 50; display: flex; align-items: center; gap: 12px;
    padding: 8px 8px 8px 16px; background: var(--surface); color: var(--text); border: 1px solid var(--accent);
    border-radius: 12px; box-shadow: 0 12px 40px rgb(0 0 0 / 0.2); max-width: calc(100vw - 32px);
  }
  .alert :global(svg) { color: var(--accent); }
  button {
    min-height: var(--hit); padding: 0 16px; border: 0; border-radius: var(--radius-sm); background: var(--accent); color: #fff;
    font: inherit; cursor: pointer;
  }
</style>
