<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { Hit } from "../../core/ai/bm25";
  import { BUILTIN_MODELS, formatGb, modelName, type BuiltinModel } from "../../core/ai/builtin";
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
  let settings = $state(false);
  let deleting = $state<BuiltinModel | null>(null);
  // svelte-ignore state_referenced_locally
  let choice = $state<BuiltinModel>(ai.builtinModel);

  const size = (id: BuiltinModel) => ai.builtin?.models.find((m) => m.id === id)?.sizeBytes ?? 0;
  /** Bytes the chosen download needs (the engine itself is ~25 MB zipped, ~100 MB unpacked). */
  const need = $derived(ai.installed.includes(choice) ? 0 : size(choice) + (ai.builtin?.hasBinary ? 0 : 100 * 1024 ** 2));
  const lowDisk = $derived(!!ai.builtin?.freeBytes && need > 0 && ai.builtin.freeBytes < need);
  const pct = $derived(ai.progress?.total ? Math.round((ai.progress.received / ai.progress.total) * 100) : 0);
  const open = $derived(ai.status === "ready" || ai.status === "failed" || ai.status === "starting" || (ai.status === "installing" && settings));

  onMount(() => {
    void ai.init().then(() => (choice = ai.installed.length ? ai.builtinModel : ai.suggested));
  });


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

{#snippet progressRow()}
  <div class="progress" role="status" aria-live="polite">
    <p class="phase">
      {ai.progress?.stage === "binary" ? "Yapay zekâ motoru indiriliyor" : `${modelName(ai.builtinModel)} model indiriliyor`}
      {#if ai.progress?.total}· {formatGb(ai.progress.received)} / {formatGb(ai.progress.total)} ({pct}%){:else}…{/if}
    </p>
    <div class="bar" aria-hidden="true"><div style:width="{pct}%"></div></div>
    <Button onclick={() => ai.cancelInstall()}>İptal</Button>
  </div>
{/snippet}

{#snippet modelChoice()}
  <fieldset class="choices" disabled={ai.status === "installing"}>
    <legend>Model boyutu</legend>
    {#each BUILTIN_MODELS as m (m.id)}
      <label class="choice" class:on={choice === m.id}>
        <input type="radio" name="ai-model" value={m.id} bind:group={choice} />
        <span class="ctext">
          <span><strong>{m.name}</strong> · {formatGb(size(m.id))}</span>
          {#if m.id === ai.suggested}<span class="badge">Bu bilgisayar için önerilen</span>{/if}
          <span class="detail">{m.detail}. {m.ramGb} GB RAM ile rahat çalışır.</span>
        </span>
      </label>
    {/each}
  </fieldset>
  <p class="disk" class:warn={lowDisk}>
    {#if need}Gereken alan: {formatGb(need)}{/if}{#if ai.builtin?.freeBytes}{need ? " · " : ""}Boş alan: {formatGb(ai.builtin.freeBytes)}{/if}
    {#if lowDisk}<br />Diskte yeterli yer yok. Biraz yer açıp yeniden dene.{/if}
  </p>
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
    {#if open}
      <Button variant="ghost" onclick={() => (settings = !settings)}>{settings ? "Ayarları kapat" : "Yapay zekâ ayarları"}</Button>
    {/if}
  </header>

  {#if settings && open}
    <section class="card settings" aria-label="Yapay zekâ ayarları">
      <h2>Yapay zekâ ayarları</h2>
      {#if ai.ollamaUp}
        <fieldset class="engines">
          <legend>Motor</legend>
          <label class="choice" class:on={ai.engineKind === "builtin"}>
            <input type="radio" name="ai-engine" checked={ai.engineKind === "builtin"} onchange={() => ai.useEngine("builtin")} /> Nito'nun yapay zekâsı
          </label>
          <label class="choice" class:on={ai.engineKind === "ollama"}>
            <input type="radio" name="ai-engine" checked={ai.engineKind === "ollama"} onchange={() => ai.useEngine("ollama")} /> Bilgisayardaki Ollama
          </label>
        </fieldset>
      {/if}
      {#if ai.engineKind === "ollama"}
        <label>Ollama modeli
          <select value={ai.model ?? ""} onchange={(e) => ai.setModel(e.currentTarget.value)}>
            {#if !ai.model}<option value="" disabled>Seç…</option>{/if}
            {#each ai.models as m (m)}<option value={m}>{m}</option>{/each}
          </select>
        </label>
      {:else}
        <ul class="models">
          {#each BUILTIN_MODELS as m (m.id)}
            {@const has = ai.installed.includes(m.id)}
            {@const active = ai.builtinModel === m.id && ai.status === "ready"}
            <li>
              <span class="ctext"><span><strong>{m.name}</strong> · {formatGb(size(m.id))}</span>
                <span class="detail">{active ? "Kullanılıyor" : has ? "İndirildi" : "İndirilmedi"} · {m.detail}</span>
              </span>
              {#if deleting === m.id}
                <span class="confirm">Silinsin mi?
                  <Button variant="danger" onclick={() => { deleting = null; void ai.removeModel(m.id); }}>Evet, sil</Button>
                  <Button onclick={() => (deleting = null)}>Vazgeç</Button>
                </span>
              {:else}
                {#if has && !active}<Button disabled={ai.status === "installing" || ai.status === "starting"} onclick={() => ai.switchModel(m.id)}>Kullan</Button>{/if}
                {#if !has}<Button disabled={ai.status === "installing"} onclick={() => ai.switchModel(m.id)}>İndir</Button>{/if}
                {#if has}<Button variant="ghost" disabled={ai.status === "installing"} onclick={() => (deleting = m.id)}>Sil</Button>{/if}
              {/if}
            </li>
          {/each}
        </ul>
        {#if ai.status === "installing"}{@render progressRow()}{/if}
        {#if ai.builtin?.freeBytes}<p class="disk">Boş alan: {formatGb(ai.builtin.freeBytes)}</p>{/if}
      {/if}
      {#if ai.setupError && ai.status !== "failed"}<p class="error" role="alert">{ai.setupError}</p>{/if}
    </section>
  {/if}

  {#if ai.status === "checking"}
    <p class="msg">Yapay zekâ hazırlanıyor…</p>
  {:else if ai.status === "setup" || (ai.status === "installing" && !settings)}
    <section class="card state" aria-label="Yapay zekâyı kur">
      <h2>Yapay zekâyı kur</h2>
      <p>Özet ve notlarla sohbet bu bilgisayarda çalışır; belgelerin dışarı gönderilmez. Bir kez indirmen yeterli, sonra internetsiz de çalışır.</p>
      {@render modelChoice()}
      {#if ai.status === "installing"}
        {@render progressRow()}
      {:else}
        <Button variant="primary" disabled={lowDisk} onclick={() => ai.install(choice)}>İndir ve kur</Button>
      {/if}
      {#if ai.setupError}<p class="error" role="alert">{ai.setupError}</p>{/if}
    </section>
  {:else if ai.status === "starting" && !settings}
    <p class="msg" role="status">{modelName(ai.builtinModel)} model yükleniyor…</p>
  {:else if ai.status === "failed"}
    <section class="card state" role="alert">
      <h2>Yapay zekâ başlatılamadı</h2>
      <p>{ai.setupError}</p>
      <p class="detail">Bilgisayarda yeterli boş bellek olmayabilir. Diğer programları kapatıp yeniden dene ya da ayarlardan "Hızlı" modele geç.</p>
      <Button variant="primary" onclick={() => ai.connect()}>Yeniden dene</Button>
    </section>
  {:else if ai.status === "down"}
    <section class="card state" role="status">
      <h2>Ollama çalışmıyor</h2>
      <p>Bu sistemde Nito'nun yapay zekâsı yok; bilgisayarındaki ücretsiz Ollama kullanılabilir. Veriler dışarı gönderilmez.</p>
      <ol>
        <li>Ollama kurulu değilse <a href="https://ollama.com/download" target="_blank" rel="noreferrer">ollama.com/download</a> adresinden kur.</li>
        <li>Bir terminalde şunu çalıştır: <code>ollama serve</code></li>
      </ol>
      <Button variant="primary" onclick={() => ai.connect()}>Yeniden dene</Button>
    </section>
  {:else if ai.status !== "ready"}
    <p class="msg">Yapay zekâ hazırlanıyor…</p>
  {:else if ai.engineKind === "ollama" && !ai.model}
    <section class="card state" role="status">
      <h2>Uygun Ollama modeli yok</h2>
      <p>"Yapay zekâ ayarları"ndan bir model seç ya da bir terminalde önerilen modeli indir: <code>ollama pull qwen2.5:7b</code></p>
      <Button variant="primary" onclick={() => ai.connect()}>Yeniden dene</Button>
    </section>
  {:else}
    {#if ai.restricted}
      <p class="note">Not: {ai.model} ticari kullanıma açık lisanslı değil ya da sohbet modeli değil; kişisel deneme için uygundur. Önerilen: qwen2.5:7b.</p>
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
              <Button variant="primary" disabled={!!ai.busy || !ai.canAnswer} onclick={() => ai.summarize()}>Özetle</Button>
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
            <button class="send" type="submit" disabled={!!ai.busy || !ai.canAnswer || !question.trim()}>Gönder</button>
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
  .state { max-width: 560px; gap: 4px; align-items: flex-start; }
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
  .settings { gap: 10px; flex: none; }
  fieldset { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  legend { color: var(--text-2); margin-bottom: 6px; padding: 0; }
  .choice {
    display: flex; align-items: flex-start; gap: 10px; min-height: var(--hit); padding: 10px 12px; cursor: pointer;
    border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text);
  }
  .choice.on { border-color: var(--accent); background: var(--accent-soft); }
  .choice input { width: 20px; height: 20px; margin: 2px 0 0; min-height: 0; accent-color: var(--accent); }
  .engines { flex-direction: row; flex-wrap: wrap; }
  .ctext { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .detail { color: var(--text-2); font-size: 13px; }
  .badge { align-self: flex-start; font-size: 12px; padding: 1px 8px; border-radius: 999px; background: var(--accent); color: var(--on-accent); }
  .disk { color: var(--text-2); font-size: 13px; margin: 8px 0; }
  .disk.warn { color: var(--danger); }
  .progress { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; width: 100%; margin: 4px 0; }
  .progress .phase { flex-basis: 100%; margin: 0; }
  .bar { flex: 1 1 200px; height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
  .bar div { height: 100%; background: var(--accent); transition: width 0.3s; }
  .models { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .models li { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 0; border-bottom: 1px solid var(--border); }
  .confirm { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .state .choices { width: 100%; margin: 8px 0 0; }
  @media (max-width: 860px) { .cols { grid-template-columns: 1fr; } }
</style>
