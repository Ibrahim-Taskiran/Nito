<script lang="ts">
  import { onMount } from "svelte";
  import Button from "../components/Button.svelte";
  import Dialog from "../components/Dialog.svelte";
  import type { FolderWatcher } from "../watcher.svelte";
  let { watcher, onclose, web }: { watcher: FolderWatcher; onclose: () => void; web: boolean } = $props();

  let path = $state("");
  let recursive = $state(true);

  onMount(() => void watcher.reload());

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (!path.trim()) return;
    await watcher.add(path, recursive);
    path = "";
  }

  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" }) : "henüz taranmadı";
</script>

<Dialog title="İzlenen klasörler">
  <p class="hint">Bu klasörler açılışta ve her 10 dakikada bir taranır; yeni PDF'ler kütüphaneye eklenir, aynı dosyalar atlanır.</p>
  {#if web}<p class="hint warn">Tarayıcı sürümü klasör yollarını okuyamaz; tarama yalnız masaüstü uygulamasında çalışır.</p>{/if}
  <form onsubmit={add}>
    <input aria-label="Klasör yolu" placeholder="C:\Dersler\Ağlar" bind:value={path} />
    <Button variant="primary">Klasör izle</Button>
  </form>
  <label class="check"><input type="checkbox" bind:checked={recursive} /> Alt klasörleri ders olarak ekle</label>
  {#if watcher.folders.length}
    <ul>
      {#each watcher.folders as f (f.id)}
        <li>
          <div class="info">
            <span class="path" title={f.path}>{f.path}</span>
            <span class="meta">
              {watcher.scanning === f.id ? "taranıyor…" : when(f.lastScan)}{f.recursive ? " · alt klasörler" : ""}{watcher.results[f.id] ? ` · ${watcher.results[f.id]}` : ""}
            </span>
          </div>
          <Button variant="ghost" onclick={() => watcher.scan(f)}>Tara</Button>
          <Button variant="ghost" onclick={() => watcher.remove(f.id)}>Kaldır</Button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="hint">Henüz izlenen klasör yok.</p>
  {/if}
  {#snippet actions()}<Button onclick={onclose}>Kapat</Button>{/snippet}
</Dialog>

<style>
  .hint { color: var(--text-2); margin: 0 0 12px; font-size: 13px; }
  .warn { color: var(--danger); }
  form { display: flex; gap: 8px; }
  input:not([type]) {
    flex: 1; min-width: 0; min-height: var(--hit); padding: 0 12px; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: var(--surface); color: var(--text);
  }
  .check { display: flex; gap: 8px; align-items: center; color: var(--text-2); min-height: var(--hit); }
  ul { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 240px; overflow-y: auto; }
  li { display: flex; align-items: center; gap: 4px; padding: 4px 0 4px 8px; border-radius: var(--radius-sm); background: var(--surface-2); }
  .info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { color: var(--text-2); font-size: 12px; }
</style>
