<script lang="ts">
  import type { Backup } from "../../platform/types";
  import Button from "./Button.svelte";
  import Dialog from "./Dialog.svelte";

  let { backup }: { backup: Backup } = $props();
  let message = $state<string | null>(null);
  let confirming = $state(false);
  let busy = $state(false);

  async function run(fn: () => Promise<string | null>, done: (path: string) => string) {
    busy = true;
    try {
      const path = await fn();
      if (path) message = done(path);
    } catch (e) {
      message = `Hata: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      busy = false;
    }
  }

  const doBackup = () => run(backup.backup, (p) => `Yedek alındı: ${p}`);
  async function doRestore() {
    confirming = false;
    await run(backup.restore, () => {
      // Every screen reads the database again.
      setTimeout(() => location.reload(), 1200);
      return "Geri yüklendi. Uygulama yenileniyor…";
    });
  }
</script>

<div class="backup">
  <Button variant="ghost" disabled={busy} onclick={doBackup}>Yedekle</Button>
  <Button variant="ghost" disabled={busy} onclick={() => (confirming = true)}>Geri yükle</Button>
</div>
{#if message}<p class="msg" role="status">{message}</p>{/if}

{#if confirming}
  <Dialog title="Yedekten geri yükle">
    <p>Seçeceğin yedek bu kütüphanenin yerini alır. Şu anki durum önce uygulama klasöründeki "backups" içine kaydedilir.</p>
    {#snippet actions()}
      <Button onclick={() => (confirming = false)}>Vazgeç</Button>
      <Button variant="primary" onclick={doRestore}>Klasör seç</Button>
    {/snippet}
  </Dialog>
{/if}

<style>
  .backup { display: flex; gap: 4px; margin-top: 8px; }
  .backup :global(.btn) { flex: 1; padding: 0 8px; font-size: 13px; }
  .msg { font-size: 12px; color: var(--text-2); margin: 6px 4px 0; overflow-wrap: anywhere; }
</style>
