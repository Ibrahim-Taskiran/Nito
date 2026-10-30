<script lang="ts">
  import { skippedSeconds } from "../../core/lecture";
  import { formatTimestamp } from "../../core/recording";
  import { WHISPER_MODELS } from "../../platform/transcriber";
  import { AudioWaveform, BadgeAlert, ChevronsRight, Layers, RotateCcw, RotateCw, Trash2 } from "@lucide/svelte";
  import { RATES } from "../playback";
  import Button from "../components/Button.svelte";
  import Dialog from "../components/Dialog.svelte";
  import ProgressBar from "../components/ProgressBar.svelte";
  import type { Reader } from "../reader.svelte";
  import { Transcripts, type Job } from "../transcripts.svelte";
  let { reader, onjump }: { reader: Reader; onjump?: (page: number) => void } = $props();

  // svelte-ignore state_referenced_locally
  const t = new Transcripts(reader);
  // svelte-ignore state_referenced_locally
  const L = reader.lecture;
  /** Page label: "12", or "12a" for an inserted blank page. */
  const pg = (key: number) => reader.pages.label(key);
  // Reload whenever the recorder goes back to idle (a recording was just saved).
  $effect(() => {
    if (reader.recorder.state === "idle") void t.load();
  });

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
    {@const seg = L.timelines.get(r.id) ?? []}
    {@const cues = L.cues.get(r.id) ?? []}
    {@const total = L.duration || r.durationSeconds || 1}
    <article class="rec">
      <div class="row">
        <button class="play" aria-pressed={L.playingId === r.id} aria-label={L.playingId === r.id ? "Oynatmayı durdur" : "Kaydı oynat"}
          onclick={() => L.play(r)}>{L.playingId === r.id ? "❚❚" : "▶"}</button>
        <span class="meta">{when(r.startedAt)} · {formatTimestamp(r.durationSeconds)}</span>
        <button class="icon del" aria-label="Kaydı sil" title="Kaydı sil" disabled={!!job} onclick={() => (t.deleting = r)}>
          <Trash2 size={16} />
        </button>
      </div>
      {#if L.activeId === r.id}
        {@const spans = L.silences.get(r.id)}
        <div class="player" aria-label="Oynatıcı">
          {#if seg.length}
            <div class="timeline" role="group" aria-label="Sayfa zaman çizelgesi">
              {#each seg as s (s.start)}
                <button class="seg" class:now={L.position >= s.start && L.position < s.end} style:flex-grow={Math.max(0.01, s.end - s.start)}
                  aria-label="Sayfa {pg(s.page)}, {formatTimestamp(s.start)}" title="s. {pg(s.page)} · {formatTimestamp(s.start)}"
                  onclick={() => { void L.play(r, s.start); onjump?.(s.page); }}><span>s. {pg(s.page)}</span></button>
              {/each}
              {#each cues as c, i (i)}<span class="tick" style:left="{Math.min(100, (c.at / total) * 100)}%" aria-hidden="true"></span>{/each}
            </div>
          {/if}
          <input class="seek" type="range" min="0" max={total} step="0.1" value={L.position}
            aria-label="Konum" oninput={(e) => L.seek(Number(e.currentTarget.value))} />
          <div class="row">
            <button class="icon" aria-label="10 saniye geri" onclick={() => L.skip(-10)}><RotateCcw size={16} /><span>10</span></button>
            <span class="meta time">{formatTimestamp(L.position)} / {formatTimestamp(total)}</span>
            <button class="icon" aria-label="10 saniye ileri" onclick={() => L.skip(10)}><RotateCw size={16} /><span>10</span></button>
            <select class="rate" aria-label="Oynatma hızı" value={L.rate} onchange={(e) => L.setRate(Number(e.currentTarget.value))}>
              {#each RATES as v (v)}<option value={v}>{v.toLocaleString("tr-TR")}×</option>{/each}
            </select>
          </div>
          <div class="toggles">
            <button class="tog" aria-pressed={L.skipSilence} onclick={() => L.setPref("skipSilence", !L.skipSilence)}>
              <ChevronsRight size={16} />Sessizliği atla
            </button>
            <button class="tog" aria-pressed={L.replayNotes} onclick={() => L.setPref("replayNotes", !L.replayNotes)}>
              <Layers size={16} />Notları sesle birlikte göster
            </button>
            <button class="tog" aria-pressed={L.denoise} onclick={() => L.setPref("denoise", !L.denoise)}>
              <AudioWaveform size={16} />Gürültü azalt
            </button>
          </div>
          {#if L.skipSilence}
            <span class="meta" aria-live="polite">
              {L.analysing === r.id ? "Sessizlik aranıyor…" : spans ? (spans.length ? `${spans.length} sessizlik atlanır (${Math.round(skippedSeconds(spans))} sn)` : "Atlanacak sessizlik yok") : ""}
            </span>
          {/if}
        </div>
      {/if}
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
      {#if cues.length}
        <div class="cues" role="group" aria-label="Sınav ipuçları">
          <span class="meta"><BadgeAlert size={14} /> Sınav ipuçları · {cues.length}</span>
          {#each cues as c, i (i)}
            <button class="cue" onclick={() => { void L.play(r, Math.max(0, c.at - 2)); if (c.page) onjump?.(c.page); }}>
              <span class="meta">{c.page ? `s. ${pg(c.page)} · ` : ""}{formatTimestamp(c.at)} · “{c.phrase}”</span>
              <span class="snip">{c.snippet}</span>
            </button>
          {/each}
        </div>
      {/if}
      {#if t.errors[r.id]}<p class="error" role="alert">{t.errors[r.id]}</p>{/if}
      {#if note && t.expandedId === r.id}
        <div class="transcript" data-note={note.id} aria-label="Yazıya döküm">
          {#each L.paragraphs.get(r.id) ?? [] as p, i (i)}
            <p><button class="ts" onclick={() => L.play(r, p.start)}>{formatTimestamp(p.start)}</button>
              {#if p.pages.length}<button class="pg" title="Sayfaya git" onclick={() => onjump?.(p.pages[0])}>s. {p.pages.map(pg).join(", ")}</button>{/if}
              {p.text}</p>
          {:else}
            <p class="hint">Kayıtta konuşma bulunamadı.</p>
          {/each}
        </div>
      {/if}
    </article>
  {:else}
    <p class="hint">Kayıt yok. Üstteki “Ses kaydı” ile dersi kaydedebilirsiniz.</p>
  {/each}

  <label class="mic">
    <input type="checkbox" checked={L.micClean} onchange={(e) => L.setPref("mic", e.currentTarget.checked)} />
    Kayıtta gürültü ve yankı engelleme
  </label>

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

{#if t.deleting}
  {@const d = t.deleting}
  <Dialog title="Kaydı sil">
    <p>{when(d.startedAt)} tarihli {formatTimestamp(d.durationSeconds)} süreli kayıt silinsin mi? Bu geri alınamaz.</p>
    {#if t.notes.get(d.id)}<p class="hint">Yazıya dökümü notlarda kalır.</p>{/if}
    {#snippet actions()}
      <Button variant="ghost" onclick={() => (t.deleting = null)}>Vazgeç</Button>
      <Button variant="danger" onclick={() => t.remove(d)}>Sil</Button>
    {/snippet}
  </Dialog>
{/if}

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
  .icon { min-width: var(--hit); height: var(--hit); flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 2px;
    border: 0; border-radius: 8px; background: transparent; color: var(--text-2); cursor: pointer; font-size: 11px; }
  .icon:hover:not(:disabled) { background: var(--surface-2); color: var(--text); }
  .icon:disabled { opacity: 0.4; cursor: default; }
  .del { margin-left: auto; }
  .del:hover:not(:disabled) { color: var(--danger); }
  .player { display: grid; gap: 4px; }
  .seek { width: 100%; height: 28px; accent-color: var(--accent); margin: 0; }
  .time { flex: 1; text-align: center; }
  .rate { height: var(--hit); border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); padding: 0 6px; font: inherit; font-size: 12px; }
  .timeline { position: relative; display: flex; height: var(--hit); border-radius: 6px; overflow: hidden; background: var(--surface-2); }
  .seg { flex: 1 1 0; min-width: 0; border: 0; border-right: 1px solid var(--surface); background: transparent; color: var(--text-2);
    font: inherit; font-size: 11px; cursor: pointer; padding: 0 2px; touch-action: manipulation; }
  .seg span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .seg.now { background: var(--accent-soft); color: var(--accent); }
  .seg:hover { color: var(--text); }
  .tick { position: absolute; bottom: 0; width: 2px; height: 8px; margin-left: -1px; background: var(--danger); pointer-events: none; }
  .toggles { display: flex; flex-wrap: wrap; gap: 4px; }
  .tog { min-height: var(--hit); display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; border: 1px solid var(--border);
    border-radius: 999px; background: var(--surface); color: var(--text-2); font: inherit; font-size: 12px; cursor: pointer; touch-action: manipulation; }
  .tog[aria-pressed="true"] { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
  .cues { display: grid; gap: 4px; }
  .cues > .meta { display: inline-flex; align-items: center; gap: 4px; }
  .cue { display: grid; gap: 2px; text-align: left; min-height: var(--hit); padding: 6px 8px; border: 0; border-left: 3px solid var(--danger);
    border-radius: 6px; background: var(--bg); color: var(--text); font: inherit; font-size: 12px; cursor: pointer; }
  .cue:hover { background: var(--surface-2); }
  .snip { color: var(--text-2); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .pg { border: 0; background: var(--surface-2); color: var(--text-2); border-radius: 4px; padding: 0 4px; cursor: pointer; font: inherit; font-size: 12px; }
  .mic { display: flex; align-items: center; gap: 8px; min-height: var(--hit); padding: 0 4px; color: var(--text-2); font-size: 12px; cursor: pointer; }
  .mic input { width: 18px; height: 18px; accent-color: var(--accent); }
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
