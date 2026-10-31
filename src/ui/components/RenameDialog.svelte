<script lang="ts">
  import { rename } from "../names.svelte";
  import Button from "./Button.svelte";
  import Dialog from "./Dialog.svelte";

  /** Renames highlight labels or page flags. `prefix`: "label" or "flag". Blank = default name. */
  let { title, prefix, items, onclose }: {
    title: string;
    prefix: "label" | "flag";
    items: readonly { key: string; name: string; defaultName: string; color: string }[];
    onclose: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally (the draft starts from the names when the dialog opens)
  const draft = $state<Record<string, string>>(Object.fromEntries(items.map((i) => [i.key, i.name])));

  function save() {
    rename(Object.fromEntries(items.map((i) => [`${prefix}.${i.key}`, draft[i.key] === i.defaultName ? "" : draft[i.key]])));
    onclose();
  }
</script>

<Dialog {title}>
  {#each items as i (i.key)}
    <label class="row">
      <span class="dot" style:background={i.color}></span>
      <input maxlength="40" placeholder={i.defaultName} aria-label="{i.defaultName} adı" bind:value={draft[i.key]} />
    </label>
  {/each}
  <p class="hint">Boş bırakılan ad varsayılana döner.</p>
  {#snippet actions()}
    <Button variant="ghost" onclick={onclose}>Vazgeç</Button>
    <Button variant="primary" onclick={save}>Kaydet</Button>
  {/snippet}
</Dialog>

<style>
  .row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .dot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
  input {
    flex: 1; height: var(--hit); padding: 0 12px; font: inherit; color: var(--text); background: var(--surface-2);
    border: 1px solid var(--border); border-radius: var(--radius-sm);
  }
  .hint { margin: 4px 0 0; color: var(--text-2); font-size: 13px; }
</style>
