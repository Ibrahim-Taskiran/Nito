<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { Hit } from "../../core/ai/bm25";
  import { cleanAnswer, emphasis, parseCitations } from "../../core/ai/prompts";
  import Button from "../components/Button.svelte";
  import { Ai } from "../ai.svelte";
  import type { Library } from "../library.svelte";

  let { lib }: { lib: Library } = $props();
  // One Ai per library, so the chat survives opening a cited page and coming back.
  // svelte-ignore state_referenced_locally
  const ai = Ai.for(lib);
  let question = $state("");
  let missing = $state<number | null>(null);
  let log: HTMLDivElement | undefined = $state();

  onMount(() => void ai.init());

  // Keep the newest tokens in view while streaming.
  $effect(() => {
    void ai.turns.at(-1)?.content;
    if (log) log.scrollTop = log.scrollHeight;
  });

  async function send(e: SubmitEvent) {
    e.preventDefault();
    const q = question;
    question = "";
    missing = null;
    await ai.ask(q);
    await tick();
  }

  async function cite(page: number, hits?: Hit[], title?: string) {
    missing = (await ai.openCitation(page, hits, title)) ? null : page;
  }
</script>

{#snippet answer(text: string, oncite: (page: number, title?: string) => void)}
  {#each parseCitations(cleanAnswer(text)) as seg, i (i)}
    {#if "page" in seg}
      <button class="cite" title="Sayfayı aç" onclick={() => oncite(seg.page, seg.title)}>[{seg.label}]</button>
    {:else}{#each emphasis(seg.text) as r, j (j)}{#if r.strong}<strong>{r.text}</strong>{:else}{r.text}{/if}{/each}{/if}
  {/each}
{/snippet}

<main class="ai">
  <header class="head">
    <h1>Yapay zekâ</h1>
    <label>Ders
      <select value={ai.courseId ?? ""} onchange={(e) => ai.setCourse(e.currentTarget.value ? Number(e.currentTarget.value) : null)}>
        <option value="">Tüm belgeler</option>
        {#each lib.courses as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
      </select>
    </label>
    {#if ai.status === "ready" && ai.models.length}
      <label>Model
        <select value={ai.model} onchange={(e) => ai.setModel(e.currentTarget.value)}>
          {#each ai.models as m (m)}<option value={m}>{m}</option>{/each}
        </select>
      </label>
    {/if}
  </header>

  {#if ai.status === "checking"}
    <p class="msg">Ollama aranıyor…</p>
  {:else if ai.status === "down"}
    <section class="card state" role="status">
      <h2>Ollama çalışmıyor</h2>
      <p>Yapay zekâ özellikleri bilgisayarındaki ücretsiz Ollama ile çalışır; veriler dışarı gönderilmez.</p>
      <ol>
        <li>Ollama kurulu değilse <a href="https://ollama.com/download" target="_blank" rel="noreferrer">ollama.com/download</a> adresinden kur.</li>
        <li>Bir terminalde şunu çalıştır: <code>ollama serve</code></li>
      </ol>
      <Button variant="primary" onclick={() => ai.checkOllama()}>Yeniden dene</Button>
    </section>
  {:else if !ai.models.length}
    <section class="card state" role="status">
      <h2>Kurulu model yok</h2>
      <p>Bir terminalde önerilen modeli indir, sonra yeniden dene: <code>ollama pull qwen2.5:7b</code></p>
      <Button variant="primary" onclick={() => ai.checkOllama()}>Yeniden dene</Button>
    </section>
  {:else}
    {#if ai.researchOnly}
      <p class="note">Not: {ai.model} yalnız araştırma lisanslıdır; kişisel deneme için uygundur. Önerilen: qwen2.5:7b.</p>
    {/if}
    {#if ai.error}<p class="error" role="alert">{ai.error}</p>{/if}
    <div class="cols">
      <section class="card summary" aria-label="Özet">
        <h2>Özetle</h2>
        {#if ai.docs.length}
          <div class="row">
            <select aria-label="Belge" value={ai.summaryDocId} onchange={(e) => (ai.summaryDocId = Number(e.currentTarget.value))}>
              {#each ai.docs as d (d.id)}<option value={d.id}>{d.title}</option>{/each}
            </select>
            {#if ai.busy === "summary"}
              <Button onclick={() => ai.stop()}>Durdur</Button>
            {:else}
              <Button variant="primary" disabled={!!ai.busy} onclick={() => ai.summarize()}>Özetle</Button>
            {/if}
          </div>
          {#if ai.busy === "summary" && ai.phase}<p class="phase">{ai.phase}</p>{/if}
          {#if ai.summary}
            <div class="text">{@render answer(ai.summary, (p) => ai.openSummaryPage(p))}</div>
          {/if}
          {#if ai.summarySaved}<p class="saved">Notlara kaydedildi.</p>{/if}
        {:else}
          <p class="msg">Bu derste belge yok.</p>
        {/if}
      </section>

      <section class="card chat" aria-label="Notlarla sohbet">
        <h2>Notlarla sohbet</h2>
        <div class="log" bind:this={log}>
          {#each ai.turns as t, i (i)}
            <div class="turn {t.role}">
              {#if t.role === "assistant"}
                {#if t.content}{@render answer(t.content, (p, title) => cite(p, t.hits, title))}{:else}<span class="phase">{ai.phase || "…"}</span>{/if}
                {#if t.hits?.length && t.content}
                  <details class="sources"><summary>Kaynaklar ({t.hits.length})</summary>
                    <ul>{#each t.hits as h, j (j)}<li>{h.chunk.title}{h.chunk.page != null ? `, s. ${h.chunk.page}` : ""}</li>{/each}</ul>
                  </details>
                {:else if t.hits && !t.hits.length && t.content}
                  <p class="phase">Bu soruyla eşleşen kaynak bulunamadı.</p>
                {/if}
              {:else}{t.content}{/if}
            </div>
          {:else}
            <p class="msg">Dersin PDF'leri, vurguların ve notların üzerinden soru sor. Yanıtlar [s. N] ile kaynağı gösterir; tıklayınca sayfa açılır.</p>
          {/each}
          {#if missing != null}<p class="phase">s. {missing} verilen kaynaklarda yok; model uydurmuş olabilir.</p>{/if}
        </div>
        <form class="ask" onsubmit={send}>
          <input bind:value={question} placeholder="Sorunu yaz…" aria-label="Soru" disabled={!!ai.busy} />
          {#if ai.busy === "chat"}
            <Button onclick={() => ai.stop()}>Durdur</Button>
          {:else}
            <button class="send" type="submit" disabled={!!ai.busy || !question.trim()}>Gönder</button>
          {/if}
        </form>
      </section>
    </div>
  {/if}
</main>

<style>
  .ai { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 16px 20px; gap: 12px; overflow: auto; }
  .head { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  h1 { font-size: 18px; font-weight: 600; margin: 0; flex: 1; }
  h2 { font-size: 15px; font-weight: 600; margin: 0 0 10px; }
  label { display: flex; align-items: center; gap: 8px; color: var(--text-2); }
  select, input {
    min-height: var(--hit); padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text); min-width: 0;
  }
  .cols { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 16px; min-height: 0; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; display: flex; flex-direction: column; min-height: 0; }
  .state { max-width: 520px; gap: 4px; align-items: flex-start; }
  .state a { color: var(--accent); }
  .state ol { margin: 4px 0 12px; padding-left: 20px; color: var(--text-2); }
  code { background: var(--surface-2); padding: 2px 6px; border-radius: 4px; }
  .row { display: flex; gap: 8px; }
  .row select { flex: 1; }
  .text { white-space: pre-wrap; line-height: 1.55; margin-top: 12px; overflow: auto; }
  .msg, .phase, .saved { color: var(--text-2); margin: 8px 0; }
  .note { margin: 0; padding: 8px 12px; border-radius: var(--radius-sm); background: var(--accent-soft); color: var(--text); font-size: 13px; }
  .error { margin: 0; color: var(--danger); }
  .log { flex: 1; overflow: auto; display: flex; flex-direction: column; gap: 10px; min-height: 160px; }
  .turn { white-space: pre-wrap; line-height: 1.55; padding: 10px 12px; border-radius: var(--radius); }
  .turn.user { align-self: flex-end; background: var(--accent-soft); max-width: 85%; }
  .turn.assistant { background: var(--surface-2); }
  .cite {
    border: 0; background: transparent; color: var(--accent); cursor: pointer; padding: 0 2px; font: inherit; font-weight: 600;
    min-height: 0;
  }
  .cite:hover { text-decoration: underline; }
  .sources { margin-top: 8px; color: var(--text-2); font-size: 13px; white-space: normal; }
  .sources summary { cursor: pointer; min-height: 28px; }
  .sources ul { margin: 4px 0 0; padding-left: 18px; }
  .ask { display: flex; gap: 8px; margin-top: 12px; }
  .ask input { flex: 1; }
  .send {
    min-height: var(--hit); padding: 0 16px; border-radius: var(--radius-sm); border: 1px solid var(--accent);
    background: var(--accent); color: var(--on-accent); cursor: pointer;
  }
  .send:disabled { opacity: 0.5; cursor: default; }
  @media (max-width: 860px) { .cols { grid-template-columns: 1fr; } }
</style>
