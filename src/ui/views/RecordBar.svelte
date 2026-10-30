<script lang="ts">
  import { formatTimestamp } from "../../core/recording";
  import { Mic } from "@lucide/svelte";
  import Button from "../components/Button.svelte";
  import IconButton from "../components/IconButton.svelte";
  import type { Recorder } from "../recorder.svelte";
  let { recorder }: { recorder: Recorder } = $props();
</script>

<div class="rec" role="group" aria-label="Ses kaydı">
  {#if recorder.state === "idle"}
    <Button variant="ghost" onclick={() => recorder.start()}><Mic size={18} />Ses kaydı</Button>
  {:else}
    <span class="dot" class:live={recorder.state === "recording"}></span>
    <span class="time" aria-label="Kayıt süresi">{formatTimestamp(recorder.elapsed)}</span>
    <span class="meter" aria-hidden="true"><span style:width="{recorder.level * 100}%"></span></span>
    {#if recorder.state === "recording"}
      <IconButton label="Duraklat" onclick={() => recorder.pause()}>❚❚</IconButton>
    {:else if recorder.state === "paused"}
      <IconButton label="Sürdür" onclick={() => recorder.resume()}>▶</IconButton>
    {/if}
    <IconButton label="Kaydı durdur" onclick={() => recorder.stop()}>■</IconButton>
  {/if}
  {#if recorder.error}<span class="err" role="alert">{recorder.error}</span>{/if}
</div>

<style>
  .rec { display: flex; align-items: center; gap: 6px; margin-right: 8px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--danger); flex: none; }
  .dot.live { animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.35; } }
  .time { font-variant-numeric: tabular-nums; min-width: 44px; }
  .meter { width: 56px; height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
  .meter span { display: block; height: 100%; background: var(--accent); transition: width 0.1s linear; }
  .rec :global(.btn svg) { color: var(--danger); }
  .err { color: var(--danger); font-size: 12px; }
  @media (prefers-reduced-motion: reduce) { .dot.live { animation: none; } }
</style>
