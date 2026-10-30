<script lang="ts">
  import { applyTheme, loadTheme, type Theme } from "../theme";
  let theme = $state<Theme>(loadTheme());
  const options: { v: Theme; name: string }[] = [
    { v: "system", name: "Sistem" },
    { v: "light", name: "Açık" },
    { v: "dark", name: "Koyu" },
  ];
</script>

<div class="switch" role="radiogroup" aria-label="Tema">
  {#each options as o (o.v)}
    <button role="radio" aria-checked={theme === o.v} onclick={() => applyTheme((theme = o.v))}>{o.name}</button>
  {/each}
</div>

<style>
  .switch { display: flex; padding: 4px; gap: 2px; background: var(--surface-3); border-radius: var(--radius-sm); }
  button {
    flex: 1; min-height: 40px; border: 0; border-radius: 8px; background: transparent; cursor: pointer; color: var(--text-2);
    font: 600 12px/1 var(--font-label); letter-spacing: 0.02em; touch-action: manipulation;
  }
  button:hover { color: var(--text); }
  button[aria-checked="true"] { background: var(--surface); color: var(--accent-strong); box-shadow: var(--shadow-1); }
</style>
