<script lang="ts">
  import Button from "../../components/Button.svelte";
  import ProgressBar from "../../components/ProgressBar.svelte";
  import type { Study } from "../../study.svelte";
  let { st }: { st: Study } = $props();
  const q = $derived(st.quiz!);
  const picked = $derived(q.picks[q.index] ?? null);
</script>

<section class="panel" aria-label="Test">
  {#if st.question}
    {@const qu = st.question}
    <div class="meta">Soru {q.index + 1} / {q.questions.length} · {st.docTitle(qu.card.documentId)} · s. {qu.card.page}</div>
    <ProgressBar value={q.index} max={q.questions.length} />
    <p class="front">{qu.card.front}</p>
    <div class="options" role="group" aria-label="Seçenekler">
      {#each qu.options as opt, i (i)}
        <button
          class="opt"
          class:right={picked !== null && i === qu.answer}
          class:wrong={picked === i && i !== qu.answer}
          disabled={picked !== null}
          onclick={() => st.pick(i)}
        >{opt}</button>
      {/each}
    </div>
    {#if picked !== null}
      <div class="row">
        <span class="muted">{picked === qu.answer ? "Doğru." : "Yanlış; doğru cevap işaretli."}</span>
        <span class="spacer"></span>
        <Button variant="primary" onclick={() => st.nextQuestion()}>{q.index + 1 < q.questions.length ? "Sonraki" : "Sonucu gör"}</Button>
      </div>
    {/if}
  {:else if q.questions.length}
    <p class="front">Puan: {st.quizScore?.correct} / {st.quizScore?.total}</p>
    <p class="muted">Yanlış yaptığın kartları tekrar oturumunda çalışabilirsin.</p>
  {:else}
    <p class="muted">Test için cevabı olan kart gerekli. Tanım vurgula ya da Soru vurgularına yorum olarak cevap yaz.</p>
  {/if}
  <div class="row end"><Button variant="ghost" onclick={() => st.endQuiz()}>Bitir</Button></div>
</section>

<style>
  .panel { display: grid; gap: 12px; }
  .meta, .muted { color: var(--text-2); font-size: 13px; }
  .muted { margin: 0; }
  .front { font-size: 18px; font-weight: 600; margin: 8px 0 0; white-space: pre-wrap; }
  .options { display: grid; gap: 8px; }
  .opt {
    text-align: left; min-height: var(--hit); padding: 8px 12px; border-radius: var(--radius-sm);
    border: 1px solid var(--border); background: var(--surface); cursor: pointer; white-space: pre-wrap;
  }
  .opt:hover:not(:disabled) { background: var(--surface-2); }
  .opt:disabled { cursor: default; }
  .opt.right { border-color: #7fa074; background: color-mix(in srgb, #7fa074 18%, var(--surface)); }
  .opt.wrong { border-color: var(--danger); background: color-mix(in srgb, var(--danger) 14%, var(--surface)); }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .spacer { flex: 1; }
  .end { justify-content: flex-end; }
</style>
