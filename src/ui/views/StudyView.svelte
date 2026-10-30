<script lang="ts">
  import { onMount } from "svelte";
  import { groupByWeek } from "../../core/week";
  import Button from "../components/Button.svelte";
  import ProgressBar from "../components/ProgressBar.svelte";
  import type { Library } from "../library.svelte";
  import { Study } from "../study.svelte";
  import QuizPanel from "./study/QuizPanel.svelte";
  import ExamPrep from "./study/ExamPrep.svelte";
  import ReviewPanel from "./study/ReviewPanel.svelte";

  let { lib }: { lib: Library } = $props();
  // lib never changes for the app lifetime.
  // svelte-ignore state_referenced_locally
  const st = new Study(lib);
  onMount(() => void st.refresh());

  const unreadWeeks = $derived(groupByWeek(st.unread));
  const docWeeks = $derived(groupByWeek(st.docs));
  const progress = $derived(st.courseId == null ? st.progress : st.progress.filter((p) => p.courseId === st.courseId));

  const onCourse = (e: Event) => {
    const v = (e.currentTarget as HTMLSelectElement).value;
    st.setCourse(v === "" ? null : Number(v));
  };
</script>

<main class="study">
  <header class="top">
    <h1>Çalışma Merkezi</h1>
    <label class="filter">
      <span>Ders</span>
      <select value={st.courseId ?? ""} onchange={onCourse} aria-label="Ders filtresi">
        <option value="">Tüm dersler</option>
        {#each lib.courses as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
      </select>
    </label>
  </header>
  {#if st.message}
    <div class="message" role="status">
      <span>{st.message}</span>
      <Button variant="ghost" onclick={() => (st.message = null)}>Kapat</Button>
    </div>
  {/if}

  <div class="grid">
    <section class="card wide">
      {#if st.session}
        <ReviewPanel {st} />
      {:else if st.quiz}
        <QuizPanel {st} />
      {:else}
        <h2>Kartlar</h2>
        <div class="stats">
          <div><strong data-testid="due-count">{st.due.length}</strong><span>bugün tekrar</span></div>
          <div><strong>{st.cards.length}</strong><span>toplam kart</span></div>
        </div>
        <p class="muted">Tanım ve Soru vurguların kart olur. Bildiğin kart sonraki kutuya geçer (1, 2, 4, 8, 16 gün); bilemediğin kart 1. kutuya döner.</p>
        <div class="row">
          <Button variant="primary" disabled={!st.due.length} onclick={() => st.startReview()}>Tekrar et</Button>
          <Button disabled={!st.quizable} onclick={() => st.startQuiz()}>Test çöz</Button>
        </div>
      {/if}
    </section>

    <section class="card">
      <h2>Ders ilerlemesi</h2>
      {#each progress as p (p.courseId ?? "none")}
        <div class="progress">
          <div class="line"><span class="name">{p.name}</span><span class="muted">{p.read}/{p.total} okundu</span></div>
          <ProgressBar value={p.read} max={p.total} />
          <div class="row end">
            <Button variant="ghost" disabled={st.busy || !p.total} onclick={() => st.exportPack(p)}>Paketi dışa aktar</Button>
          </div>
        </div>
      {:else}
        <p class="muted">Henüz ders yok.</p>
      {/each}
    </section>

    <section class="card wide" aria-label="Sınav hazırlığı">
      {#key st.courseId}<ExamPrep {lib} courseId={st.courseId} />{/key}
    </section>

    <section class="card">
      <h2>Okunmamış PDF'ler</h2>
      {#each unreadWeeks as g (g.label)}
        <h3>{g.label}</h3>
        {#each g.items as d (d.id)}
          <button class="doc" onclick={() => lib.open(d)}>{d.title}</button>
        {/each}
      {:else}
        <p class="muted">Hepsini açmışsın.</p>
      {/each}
    </section>

    <section class="card">
      <h2>Cornell notları</h2>
      <p class="muted">Soru ve tanımlar ipucu sütununa, vurgular sayfa sırasıyla not sütununa yazılır. Not, Notlar bölümüne kaydedilir.</p>
      {#each docWeeks as g (g.label)}
        <h3>{g.label}</h3>
        {#each g.items as d (d.id)}
          <div class="docrow">
            <span class="name">{d.title}</span>
            <Button variant="ghost" onclick={() => st.cornell(d)}><span class="sr">{d.title}: </span>Cornell notu oluştur</Button>
          </div>
        {/each}
      {/each}
    </section>
  </div>
</main>

<style>
  .study { flex: 1; min-width: 0; overflow: auto; padding: 20px 24px 32px; }
  .top { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
  h1 { font-size: 18px; font-weight: 600; margin: 0; flex: 1; }
  h2 { font-size: 15px; font-weight: 600; margin: 0 0 8px; }
  h3 { font-size: 12px; font-weight: 600; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.04em; margin: 12px 0 4px; }
  .filter { display: flex; align-items: center; gap: 8px; color: var(--text-2); }
  select {
    min-height: var(--hit); padding: 0 10px; border-radius: var(--radius-sm); border: 1px solid var(--border);
    background: var(--surface); color: var(--text); font: inherit;
  }
  .message {
    display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 16px;
    padding: 0 0 0 12px; border-radius: var(--radius-sm); background: var(--accent-soft);
  }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; align-items: start; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; min-width: 0; }
  .wide { grid-column: 1 / -1; }
  .stats { display: flex; gap: 32px; margin: 4px 0 8px; }
  .stats div { display: grid; }
  .stats strong { font-size: 28px; font-weight: 600; line-height: 1.1; }
  .stats span, .muted { color: var(--text-2); font-size: 13px; }
  p.muted { margin: 0 0 12px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .end { justify-content: flex-end; }
  .progress { display: grid; gap: 6px; padding: 8px 0; border-top: 1px solid var(--border); }
  .progress:first-of-type { border-top: 0; }
  .line { display: flex; justify-content: space-between; gap: 8px; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .doc {
    display: block; width: 100%; text-align: left; min-height: var(--hit); padding: 0 8px; border: 0;
    border-radius: var(--radius-sm); background: transparent; cursor: pointer;
  }
  .doc:hover { background: var(--surface-2); }
  .docrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
