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
  .switch { display: flex; padding: 3px; gap: 2px; background: var(--surface-2); border-radius: var(--radius-sm); }
  button { flex: 1; min-height: 34px; border: 0; border-radius: 6px; background: transparent; cursor: pointer; color: var(--text-2); font-size: 13px; }
  button[aria-checked="true"] { background: var(--surface); color: var(--text); box-shadow: 0 1px 2px rgb(0 0 0 / 0.1); }
</style>
