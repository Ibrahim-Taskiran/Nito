<script lang="ts">
  import { ArrowRight, BookOpen, Clock, FileText, Layers, ListChecks, Package, Play } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { BOX_INTERVALS } from "../../core/study/cards";
  import { formatStudyTime } from "../../core/study/studyTime";
  import { groupByWeek } from "../../core/week";
  import Button from "../components/Button.svelte";
  import ProgressBar from "../components/ProgressBar.svelte";
  import Ring from "../components/Ring.svelte";
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
  const boxes = $derived(BOX_INTERVALS.map((days, i) => ({ days, n: st.cards.filter((c) => c.box === i + 1).length })));
  const peak = $derived(Math.max(1, ...boxes.map((b) => b.n)));
  const totalTime = $derived([...st.times.values()].reduce((a, b) => a + b, 0));

  const onCourse = (e: Event) => {
    const v = (e.currentTarget as HTMLSelectElement).value;
    st.setCourse(v === "" ? null : Number(v));
  };
</script>

<main class="study">
  <header class="top">
    <div class="titles">
      <span class="n-eyebrow">Çalışma alanı</span>
      <h1>Çalışma Merkezi</h1>
    </div>
    <label class="filter">
      <span class="n-eyebrow">Ders</span>
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

  <section class="n-card hero">
    {#if st.session}
      <ReviewPanel {st} />
    {:else if st.quiz}
      <QuizPanel {st} />
    {:else}
      <div class="cardsInfo">
        <div class="htitle">
          <span class="n-icon-tile"><Layers size={22} /></span>
          <div>
            <h2>Kartlar</h2>
            <p class="muted">Tanım ve Soru vurguların kart olur. Bildiğin kart sonraki kutuya geçer (1, 2, 4, 8, 16 gün); bilemediğin kart 1. kutuya döner.</p>
          </div>
        </div>
        <div class="tiles">
          <div class="tile"><span class="n-eyebrow">Bugün bekleyen</span><strong data-testid="due-count">{st.due.length}</strong><span class="muted">bugün tekrar</span></div>
          <div class="tile"><span class="n-eyebrow">Toplam havuz</span><strong>{st.cards.length}</strong><span class="muted">toplam kart</span></div>
          <div class="tile"><span class="n-eyebrow">Teste uygun</span><strong>{st.quizable}</strong><span class="muted">cevaplı kart</span></div>
        </div>
      </div>
      <div class="boxes">
        <div class="bhead"><span class="n-label">Kutu dağılımı</span><span class="muted">Leitner</span></div>
        <div class="bgrid">
          {#each boxes as b, i (i)}
            <div class="box">
              <span class="n-label">{i + 1}. kutu</span>
              <strong>{b.n}</strong>
              <span class="muted">{b.days === 1 ? "her gün" : `${b.days} gün`}</span>
              <span class="mini" aria-hidden="true"><i style:width="{(b.n / peak) * 100}%"></i></span>
            </div>
          {/each}
        </div>
        <div class="row">
          <Button variant="primary" disabled={!st.due.length} onclick={() => st.startReview()}><Play size={16} aria-hidden="true" />Tekrar et</Button>
          <Button disabled={!st.quizable} onclick={() => st.startQuiz()}><ListChecks size={16} aria-hidden="true" />Test çöz</Button>
        </div>
      </div>
    {/if}
  </section>

  <section aria-labelledby="h-progress">
    <div class="sechead">
      <div><h2 id="h-progress">Ders ilerlemesi</h2><p class="muted">Okunan belgeler, çalışma süresi ve dışa aktarılabilir paketler</p></div>
    </div>
    <div class="courses">
      {#each progress as p (p.courseId ?? "none")}
        {@const ratio = p.total ? p.read / p.total : 0}
        <article class="n-card course">
          <div class="chead">
            <span class="n-badge">{p.name}</span>
            <span class="muted"><BookOpen size={15} aria-hidden="true" /> {p.read} / {p.total} PDF</span>
          </div>
          <div class="cbody">
            <Ring {ratio} size={60} />
            <div class="ctext">
              <span class="n-label">{p.read}/{p.total} okundu</span>
              <ProgressBar value={p.read} max={p.total} />
              {#if p.studyMs > 0}<span class="muted"><Clock size={14} aria-hidden="true" /> Çalışma süresi: {formatStudyTime(p.studyMs)}</span>{/if}
            </div>
          </div>
          <div class="row end">
            <Button variant="ghost" disabled={st.busy || !p.total} onclick={() => st.exportPack(p)}><Package size={16} aria-hidden="true" />Paketi dışa aktar</Button>
          </div>
        </article>
      {:else}
        <p class="muted">Henüz ders yok.</p>
      {/each}
    </div>
  </section>

  <section class="n-card pad" aria-label="Sınav hazırlığı">
    {#key st.courseId}<ExamPrep {lib} courseId={st.courseId} />{/key}
  </section>

  <div class="grid">
    <section class="n-card pad" aria-label="Çalışma süresi">
      <div class="sechead tight">
        <h2><Clock size={20} aria-hidden="true" /> Çalışma süresi</h2>
        {#if totalTime}<span class="n-badge">{formatStudyTime(totalTime)}</span>{/if}
      </div>
      {#each st.timed as d (d.id)}
        <div class="docrow" data-testid="study-time">
          <span class="name">{d.title}</span>
          <span class="time">{formatStudyTime(st.times.get(d.id) ?? 0)}</span>
        </div>
      {:else}
        <p class="muted">Okuyucudaki kronometre çalışırken açık olan PDF'e süre yazılır.</p>
      {/each}
    </section>

    <section class="n-card pad">
      <h2><FileText size={20} aria-hidden="true" /> Okunmamış PDF'ler</h2>
      {#each unreadWeeks as g (g.label)}
        <h3 class="n-eyebrow">{g.label}</h3>
        {#each g.items as d (d.id)}
          <button class="doc" onclick={() => lib.open(d)}><span class="name">{d.title}</span><ArrowRight size={16} aria-hidden="true" /></button>
        {/each}
      {:else}
        <p class="muted">Hepsini açmışsın.</p>
      {/each}
    </section>

    <section class="n-card pad">
      <h2><BookOpen size={20} aria-hidden="true" /> Cornell notları</h2>
      <p class="muted">Soru ve tanımlar ipucu sütununa, vurgular sayfa sırasıyla not sütununa yazılır. Not, Notlar bölümüne kaydedilir.</p>
      {#each docWeeks as g (g.label)}
        <h3 class="n-eyebrow">{g.label}</h3>
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
  .study { flex: 1; min-width: 0; overflow: auto; padding: 8px 28px 40px; display: grid; gap: 24px; align-content: start; }
  .top { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
  .titles { flex: 1; display: grid; gap: 2px; }
  h1 { font-size: 30px; line-height: 38px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
  h2 { font-size: 18px; line-height: 26px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 10px; }
  h2 :global(svg) { color: var(--text-2); }
  h3 { margin: 14px 0 6px; }
  .filter { display: flex; align-items: center; gap: 10px; }
  select {
    min-height: var(--hit); padding: 0 12px; border-radius: var(--radius-sm); border: 1px solid var(--border);
    background: var(--surface); color: var(--text); font: 600 14px/1 var(--font-label); box-shadow: var(--shadow-1);
  }
  .message {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 0 0 0 14px; border-radius: var(--radius-sm); background: var(--accent-soft);
  }
  .muted { color: var(--text-2); font-size: 13px; display: inline-flex; align-items: center; gap: 6px; }
  p.muted { display: block; margin: 4px 0 0; }
  .pad { padding: 22px; min-width: 0; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .end { justify-content: flex-end; }
  .sechead { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
  .sechead.tight { margin-bottom: 8px; }

  .hero { padding: 26px; display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 24px; }
  .hero > :global(.panel) { grid-column: 1 / -1; }
  .cardsInfo { display: grid; gap: 20px; align-content: start; }
  .htitle { display: flex; gap: 14px; align-items: flex-start; }
  .htitle h2 { font-size: 22px; line-height: 30px; }
  .tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .tile { display: grid; gap: 4px; padding: 14px 16px; border-radius: var(--radius); background: var(--surface-2); }
  .tile strong { font-size: 32px; line-height: 38px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .boxes { display: grid; gap: 14px; padding: 18px; border-radius: var(--radius); background: var(--surface-2); align-content: start; }
  .bhead { display: flex; justify-content: space-between; align-items: center; }
  .bgrid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
  .box { display: grid; justify-items: center; gap: 4px; padding: 12px 6px; border-radius: var(--radius-sm); background: var(--surface); box-shadow: var(--shadow-1); text-align: center; }
  .box strong { font-size: 22px; line-height: 28px; font-variant-numeric: tabular-nums; }
  .box .muted { font-size: 11px; }
  .mini { width: 80%; height: 4px; border-radius: var(--pill); background: var(--surface-3); overflow: hidden; }
  .mini i { display: block; height: 100%; background: var(--accent-strong); border-radius: inherit; }
  .boxes .row :global(.btn) { flex: 1; justify-content: center; }

  .courses { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px; }
  .course { padding: 20px; display: grid; gap: 14px; min-width: 0; }
  .chead { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .chead .n-badge { overflow: hidden; text-overflow: ellipsis; max-width: 60%; }
  .cbody { display: flex; align-items: center; gap: 14px; padding: 12px; border-radius: var(--radius); background: var(--surface-2); }
  .ctext { flex: 1; display: grid; gap: 6px; min-width: 0; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 18px; align-items: start; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
  .doc {
    width: 100%; display: flex; align-items: center; gap: 8px; text-align: left; min-height: var(--hit); padding: 0 12px; border: 0;
    border-radius: var(--radius-sm); background: var(--surface-2); cursor: pointer; margin-top: 6px; color: var(--text);
  }
  .doc :global(svg) { color: var(--text-2); flex: none; }
  .doc:hover { background: var(--surface-3); }
  .time {
    flex: none; font: 600 13px/1 var(--font-label); font-variant-numeric: tabular-nums; padding: 6px 10px; border-radius: var(--pill);
    background: var(--accent-soft); color: var(--accent-strong);
  }
  .docrow {
    display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: var(--hit);
    padding: 2px 4px 2px 12px; margin-top: 6px; border-radius: var(--radius-sm); background: var(--surface-2);
  }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @media (max-width: 980px) { .hero { grid-template-columns: 1fr; } }
  @media (max-width: 719px) {
    .study { padding: 8px 16px 32px; gap: 18px; }
    h1 { font-size: 24px; line-height: 32px; }
    .hero { padding: 18px; }
    .tiles { grid-template-columns: 1fr 1fr; }
    .bgrid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
