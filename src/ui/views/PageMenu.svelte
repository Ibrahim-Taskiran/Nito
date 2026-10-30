<script lang="ts">
  import { FilePlus } from "@lucide/svelte";
  import type { InsertWhere } from "../../core/pages";
  import MenuButton from "../components/MenuButton.svelte";
  import type { Reader } from "../reader.svelte";

  /** Reader toolbar "Sayfa": blank pages before / after the current one, and the transcript beside pages. */
  let { reader, page, label, oninsert, onremove }: {
    reader: Reader;
    page: number;
    label: string;
    oninsert: (where: InsertWhere) => void;
    onremove: () => void;
  } = $props();
  const L = $derived(reader.lecture);
</script>

<MenuButton label="Sayfa" title="Boş sayfa ekle, döküm">
  {#snippet icon()}<FilePlus size={18} />{/snippet}
  {#snippet children(close)}
    <p class="hint">Sayfa {label}</p>
    <button class="item" onclick={() => { close(); oninsert("before"); }}>Önüne boş sayfa ekle</button>
    <button class="item" onclick={() => { close(); oninsert("after"); }}>Arkasına boş sayfa ekle</button>
    {#if page < 0}
      <button class="item danger" onclick={() => { close(); onremove(); }}>Bu boş sayfayı sil</button>
    {/if}
    {#if L.hasTranscripts}
      <label class="item"><input type="checkbox" checked={L.transcriptBeside}
        onchange={(e) => L.setPref("transcriptBeside", e.currentTarget.checked)} />Dökümü sayfanın yanında göster</label>
    {/if}
  {/snippet}
</MenuButton>

<style>
  .hint { margin: 4px 8px; color: var(--text-2); font-size: 12px; }
  .danger { color: var(--danger); }
</style>
