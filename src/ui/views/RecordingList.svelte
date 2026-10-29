<script lang="ts">
  import { onDestroy } from "svelte";
  import { formatTimestamp } from "../../core/recording";
  import { transcriptParagraphs } from "../../core/transcribe/transcript";
  import { WHISPER_MODELS } from "../../platform/transcriber";
  import Button from "../components/Button.svelte";
  import Dialog from "../components/Dialog.svelte";
  import ProgressBar from "../components/ProgressBar.svelte";
  import type { Reader } from "../reader.svelte";
  import { Transcripts, type Job } from "../transcripts.svelte";
  let { reader }: { reader: Reader } = $props();

  // svelte-ignore state_referenced_locally
  const t = new Transcripts(reader);
  // Reload whenever the recorder goes back to idle (a recording was just saved).
  $effect(() => {
    if (reader.recorder.state === "idle") void t.load();
  });
  onDestroy(() => t.dispose());

  const when = (iso: string) =>
    new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const jobText = (j: Job) =>
    j.phase === "convert" ? "Ses hazırlanıyor…" : j.phase === "whisper" ? `Yazıya dökülüyor… %${j.percent}` : "Not kaydediliyor…";
  const mb = (b: number) => (b / 1048576).toFixed(0);
</script>

<section class="recs" aria-label="Kayıtlar">
  <h2>Kayıtlar <span class="count">{t.recordings.length}</span></h2>
  {#each t.recordings as r (r.id)}
    {@const job = t.jobs[r.id]}
    {@const note = t.notes.get(r.id)}
    <article class="rec">
      <div class="row">
        <button class="play" aria-pressed={t.playingId === r.id} aria-label={t.playingId === r.id ? "Oynatmayı durdur" : "Kaydı oynat"}
          onclick={() => t.play(r)}>{t.playingId === r.id ? "❚❚" : "▶"}</button>
        <span class="meta">{when(r.startedAt)} · {formatTimestamp(r.durationSeconds)}</span>
      </div>
      {#if job}
        <div class="job" aria-live="polite">
          <ProgressBar value={job.phase === "convert" ? 0 : job.percent} max={100} />
          <span>{jobText(job)}</span>
        </div>
      {:else if note}
        <div class="row">
          <button class="link" aria-expanded={t.expandedId === r.id} onclick={() => (t.expandedId = t.expandedId === r.id ? null : r.id)}>
            {t.expandedId === r.id ? "Dökümü gizle" : "Dökümü göster"}
          </button>
          {#if t.available}<button class="link quiet" onclick={() => t.transcribe(r)}>Yeniden dök</button>{/if}
        </div>
      {:else}
        <Button onclick={() => t.transcribe(r)}>Yazıya dök</Button>
      {/if}
      {#if t.errors[r.id]}<p class="error" role="alert">{t.errors[r.id]}</p>{/if}
      {#if note && t.expandedId === r.id}
        <div class="transcript" data-note={note.id} aria-label="Yazıya döküm">
          {#each transcriptParagraphs(note.body) as p, i (i)}
            <p><button class="ts" onclick={() => t.play(r, p.start)}>{formatTimestamp(p.start)}</button> {p.text}</p>
          {:else}
            <p class="hint">Kayıtta konuşma bulunamadı.</p>
          {/each}
        </div>
      {/if}
    </article>
  {:else}
    <p class="hint">Kayıt yok. Üstteki “Kaydet” ile dersi kaydedebilirsiniz.</p>
  {/each}

  {#if t.missing}
    <div class="missing" role="status">
      <p>Whisper kurulu değil.</p>
      {#if t.canSetup}
        <Button variant="primary" onclick={() => (t.setupOpen = true)}>Whisper kur</Button>
      {:else}
        <p class="hint">Yazıya dökme masaüstü uygulamasında çalışır.</p>
      {/if}
    </div>
  {/if}
</section>

{#if t.setupOpen}
  <Dialog title="Whisper kur">
    <p class="hint">Konuşmayı yazıya döken whisper.cpp ve bir model bu bilgisayara indirilir. İnternet yalnız kurulumda gerekir.</p>
    <fieldset disabled={!!t.setupProgress}>
      <legend>Model</legend>
      {#each WHISPER_MODELS as m (m.id)}
        <label class="model">
          <input type="radio" name="model" value={m.id} bind:group={t.setupModel} />
          <span>{m.name}</span><span class="size">{m.size}</span>
        </label>
      {/each}
    </fieldset>
    {#if t.setupProgress}
      {@const p = t.setupProgress}
      <div class="job" aria-live="polite">
        <ProgressBar value={p.received} max={p.total || 1} />
        <span>{p.stage === "binary" ? "Program indiriliyor" : "Model indiriliyor"} · {mb(p.received)}{p.total ? ` / ${mb(p.total)}` : ""} MB</span>
      </div>
    {/if}
    {#if t.setupError}<p class="error" role="alert">{t.setupError}</p>{/if}
    {#snippet actions()}
      <Button variant="ghost" disabled={!!t.setupProgress} onclick={() => (t.setupOpen = false)}>Vazgeç</Button>
      <Button variant="primary" disabled={!!t.setupProgress} onclick={() => t.runSetup()}>İndir ve kur</Button>
    {/snippet}
  </Dialog>
{/if}

<style>
  .recs { margin-top: 20px; border-top: 1px solid var(--border); padding-top: 12px; }
  h2 { font-size: 13px; font-weight: 600; margin: 4px 4px 12px; }
  .count { color: var(--text-2); font-weight: 400; }
  .rec { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px; margin-bottom: 8px; display: grid; gap: 8px; }
  .row { display: flex; align-items: center; gap: 8px; }
  .meta { color: var(--text-2); font-size: 12px; font-variant-numeric: tabular-nums; }
  .play { width: var(--hit); height: var(--hit); flex: none; border: 1px solid var(--border); border-radius: 50%; background: var(--surface); cursor: pointer; }
  .play[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); }
  .job { display: grid; gap: 4px; font-size: 12px; color: var(--text-2); }
  .link { min-height: 32px; border: 0; background: transparent; color: var(--accent); cursor: pointer; padding: 0 6px; border-radius: 6px; }
  .link:hover { background: var(--surface-2); }
  .quiet { color: var(--text-2); margin-left: auto; }
  .transcript { max-height: 320px; overflow-y: auto; background: var(--bg); border-radius: 6px; padding: 4px 8px; font-size: 13px; line-height: 1.5; }
  .transcript p { margin: 6px 0; }
  .ts { border: 0; background: var(--accent-soft); color: var(--accent); border-radius: 4px; padding: 0 4px; cursor: pointer; font: inherit; font-size: 12px; font-variant-numeric: tabular-nums; }
  .error { color: var(--danger); margin: 0; font-size: 12px; }
  .hint { color: var(--text-2); margin: 4px; font-size: 13px; }
  .missing { display: grid; gap: 8px; padding: 8px; border-radius: var(--radius-sm); background: var(--surface-2); }
  .missing p { margin: 0; }
  fieldset { border: 0; padding: 0; margin: 12px 0; display: grid; gap: 4px; }
  legend { font-weight: 600; margin-bottom: 4px; }
  .model { display: flex; align-items: center; gap: 8px; min-height: var(--hit); padding: 0 8px; border-radius: 6px; cursor: pointer; }
  .model:hover { background: var(--surface-2); }
  .size { margin-left: auto; color: var(--text-2); font-size: 12px; }
</style>
