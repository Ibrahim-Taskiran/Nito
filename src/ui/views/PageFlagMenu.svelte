<script lang="ts">
  import { Flag } from "@lucide/svelte";
  import { FLAGS } from "../../core/exam/flags";
  import type { Document } from "../../core/types";
  import MenuButton from "../components/MenuButton.svelte";
  import type { Library } from "../library.svelte";
  import { PageFlags } from "../pageFlags.svelte";

  /** Reader toolbar: mark the current page for the exam view (Çalışma Merkezi › Sınav hazırlığı). */
  let { lib, doc, page }: { lib: Library; doc: Document; page: number } = $props();
  const flags = $derived(PageFlags.for(lib, doc.id));
  const on = $derived(flags.on(page));
</script>

<MenuButton label={on.length ? `İşaretli (${on.length})` : "İşaretle"} title="Bu sayfayı sınav için işaretle">
  {#snippet icon()}<Flag size={18} fill={on.length ? FLAGS.find((f) => f.key === on[0])?.color : "none"} />{/snippet}
  {#snippet children()}
    <p class="hint">Sayfa {page}</p>
    {#each FLAGS as f (f.key)}
      <label class="item"><input type="checkbox" checked={on.includes(f.key)} onchange={() => flags.toggle(page, f.key)} />
        <span class="dot" style:background={f.color}></span>{f.name}</label>
    {/each}
  {/snippet}
</MenuButton>

<style>
  .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
</style>
