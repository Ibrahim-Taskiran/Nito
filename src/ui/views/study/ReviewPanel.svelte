<script lang="ts">
  import { labelInfo } from "../../../core/labels";
  import Button from "../../components/Button.svelte";
  import ProgressBar from "../../components/ProgressBar.svelte";
  import type { Study } from "../../study.svelte";
  let { st }: { st: Study } = $props();
  const s = $derived(st.session!);
</script>

<section class="panel" aria-label="Tekrar oturumu">
  {#if st.card}
    {@const c = st.card}
    <div class="meta">
      <span class="dot" style:background={labelInfo(c.label).color}></span>
      {labelInfo(c.label).name} · {st.docTitle(c.documentId)} · s. {c.page} · Kutu {c.box}
      <span class="spacer"></span>{s.index + 1} / {s.queue.length}
    </div>
    <ProgressBar value={s.index} max={s.queue.length} />
    <p class="front">{c.front}</p>
    {#if s.revealed}
      <p class="back">{c.back}</p>
      <div class="row">
        <Button onclick={() => st.answer(false)}>Bilemedim</Button>
        <Button variant="primary" onclick={() => st.answer(true)}>Bildim</Button>
      </div>
    {:else}
      <div class="row"><Button variant="primary" onclick={() => st.reveal()}>Cevabı göster</Button></div>
    {/if}
  {:else}
    <p class="front">Oturum bitti</p>
    <p class="muted">{s.right} / {s.queue.length} kartı bildin. Bilemediklerin yarın tekrar gelecek.</p>
  {/if}
  <div class="row end"><Button variant="ghost" onclick={() => st.endReview()}>Bitir</Button></div>
</section>

<style>
  .panel { display: grid; gap: 12px; }
  .meta { display: flex; align-items: center; gap: 8px; color: var(--text-2); font-size: 13px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  .spacer { flex: 1; }
  .front { font-size: 18px; font-weight: 600; margin: 8px 0 0; white-space: pre-wrap; }
  .back { margin: 0; padding: 12px; border-radius: var(--radius-sm); background: var(--surface-2); white-space: pre-wrap; }
  .muted { color: var(--text-2); margin: 0; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .end { justify-content: flex-end; }
</style>
