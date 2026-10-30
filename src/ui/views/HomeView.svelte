<script lang="ts">
  import { ArrowRight, BookOpenText, CalendarDays, Clock, FileText, FolderOpen, Highlighter, Layers, Mic, Play, Plus, Timer, Zap } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { labelInfo } from "../../core/labels";
  import { readingProgress } from "../../core/library/browse";
  import { DAY_SHORT, formatMinutes, formatTime, greeting, kindColor, kindName, longDate, shortDate } from "../../core/plan/plan";
  import { formatTimestamp } from "../../core/recording";
  import type { Id } from "../../core/types";
  import Button from "../components/Button.svelte";
  import { Home } from "../home.svelte";
  import type { Library } from "../library.svelte";

  let { lib }: { lib: Library } = $props();
  // lib never changes for the app lifetime.
  // svelte-ignore state_referenced_locally
  const h = new Home(lib);
  onMount(() => void h.refresh());

  const courseName = (id: Id | null) => lib.courses.find((c) => c.id === id)?.name ?? null;
  const day = (iso: string) => shortDate(iso.slice(0, 10));
  const peak = $derived(Math.max(1, ...h.weekDays.map((d) => d.min)));
  const added = $derived([...lib.documents].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 3));
  const boxes = $derived([h.boxes[0], h.boxes[1], h.boxes[2], h.boxes[3] + h.boxes[4]]);

  function ago(iso: string | null): string {
    if (!iso) return "";
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (min < 1) return "Az önce";
    if (min < 60) return `${min} dk önce`;
    if (min < 24 * 60) return `${Math.floor(min / 60)} sa önce`;
    return day(iso);
  }
</script>

<main class="home">
  <header class="hero">
    <h1>{greeting(h.hour)}</h1>
    <p class="date">
      <span><CalendarDays size={16} aria-hidden={true} /> {longDate(h.today)}</span>
      {#if h.nextExam}
        <span class="exam"><Timer size={15} aria-hidden={true} /> {h.nextExam.title}: {h.nextExam.days ? `${h.nextExam.days} gün kaldı` : "bugün"}</span>
      {/if}
    </p>
  </header>

  <section aria-labelledby="h-continue">
    <div class="sechead">
      <h2 id="h-continue" class="big"><BookOpenText size={22} aria-hidden={true} /> Kaldığın yerden devam et</h2>
      {#if h.recent.length}<span class="n-eyebrow">Son açılanlar</span>{/if}
    </div>
    {#if h.recent.length}
      <ul class="recent">
        {#each h.recent as r (r.doc.id)}
          {@const st = lib.stats.get(r.doc.id)}
          {@const ratio = r.lastPage && r.pageCount ? Math.min(1, r.lastPage / r.pageCount) : 0}
          <li class="n-card resume">
            <div class="tags">
              <span class="n-badge">PDF{#if r.doc.week != null} · Hafta {r.doc.week}{/if}</span>
              {#if r.lastOpenedAt}<span class="when"><Clock size={14} aria-hidden={true} /> {ago(r.lastOpenedAt)}</span>{/if}
            </div>
            <div class="what">
              <span class="pageTile" aria-hidden="true"><FileText size={22} />{#if r.lastPage}<small>S. {r.lastPage}{r.pageCount ? `/${r.pageCount}` : ""}</small>{/if}</span>
              <span class="text">
                <span class="title lg">{r.doc.title}</span>
                <span class="muted">{courseName(r.doc.courseId) ?? "Derssiz"}</span>
              </span>
            </div>
            <div class="prog">
              <span class="n-label">Okuma ilerlemesi</span>
              <span class="n-label">{r.lastPage && r.pageCount ? `%${Math.round(ratio * 100)} · ${r.lastPage} / ${r.pageCount} sayfa` : "Başlanmadı"}</span>
              <span class="bar" aria-hidden="true"><span style:width="{ratio * 100}%"></span></span>
            </div>
            <div class="foot">
              <span class="facts">
                {#if st?.highlights}<span><i class="n-dot" style:background="var(--amber)"></i>{st.highlights} vurgu</span>{/if}
                {#if st?.notes}<span><i class="n-dot" style:background="var(--violet)"></i>{st.notes} not</span>{/if}
              </span>
              <Button variant="primary" onclick={() => lib.open(r.doc, r.lastPage)}><Play size={16} aria-hidden={true} /> Devam et</Button>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="n-card pad">
        <p class="muted">Henüz bir belge açmadın. Kütüphaneden bir PDF seçince burada kaldığın sayfadan devam edersin.</p>
        <Button onclick={() => lib.setFilter({ kind: "all" })}>Kütüphaneye git</Button>
      </div>
    {/if}
  </section>

  <div class="grid">
    <section class="n-card pad col" aria-labelledby="h-plan">
      <div class="head">
        <h2 id="h-plan"><CalendarDays size={20} aria-hidden={true} /> Bugünün planı</h2>
        <button class="link" onclick={() => (lib.section = "plan")}>Program <ArrowRight size={15} aria-hidden={true} /></button>
      </div>
      {#if h.todayPlan.length}
        <ul class="list">
          {#each h.todayPlan as o (o.item.id)}
            <li class="plan" class:done={o.done}>
              <label class="check">
                <input type="checkbox" checked={o.done} onchange={() => h.toggle(o)} />
                <span class="kind" style:background={kindColor(o.item.kind)} aria-hidden="true"></span>
                <span class="text">
                  <span class="title">{o.item.title}</span>
                  <span class="muted">{kindName(o.item.kind)}{courseName(o.item.courseId) ? ` · ${courseName(o.item.courseId)}` : ""} · {formatMinutes(o.item.durationMin)}</span>
                </span>
                {#if o.item.startMin != null}<span class="time">{formatTime(o.item.startMin)}</span>{/if}
              </label>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">Bugün için plan yok. Haftanı planlamak birkaç dakika sürer.</p>
      {/if}
      <button class="dashed" onclick={() => (lib.section = "plan")}><Plus size={16} aria-hidden={true} /> Programa ekle</button>
    </section>

    <section class="n-card pad col" aria-labelledby="h-due">
      <h2 id="h-due"><Layers size={20} aria-hidden={true} /> Tekrar zamanı gelen kartlar</h2>
      <div class="metric"><strong data-testid="home-due">{h.dueCount}</strong><span class="muted">kart bugün seni bekliyor</span></div>
      <p class="muted">Tanım ve Soru vurguları kart olur; unuttukça daha sık gelir.</p>
      <div class="boxes" aria-label="Leitner kutuları">
        {#each boxes as n, i (i)}
          <span class="box"><small>Kutu {i < 3 ? i + 1 : "4-5"}</small><b>{n}</b></span>
        {/each}
      </div>
      {#if h.dueCount}
        <Button variant="primary" onclick={() => (lib.section = "study")}><Zap size={16} aria-hidden={true} /> Tekrar et</Button>
      {/if}
    </section>

    <section class="n-card pad col" aria-labelledby="h-week">
      <h2 id="h-week"><Clock size={20} aria-hidden={true} /> Bu hafta</h2>
      <div class="metric"><strong>{formatMinutes(h.week.doneMin)}</strong>{#if h.week.plannedMin}<span class="muted">/ {formatMinutes(h.week.plannedMin)} plan</span>{/if}</div>
      <div class="chart" aria-hidden="true">
        {#each h.weekDays as d, i (d.day)}
          <span class="day" class:today={d.day === h.today}>
            <i style:height="{Math.max(6, (d.min / peak) * 100)}%" class:empty={!d.min}></i>
            <small>{DAY_SHORT[i]}</small>
          </span>
        {/each}
      </div>
      <div class="stats"><span><b>{h.week.highlights}</b> yeni vurgu</span><span>Plandan tamamlanan süre</span></div>
    </section>

    <section class="n-card pad col" aria-labelledby="h-hl">
      <h2 id="h-hl"><Highlighter size={20} aria-hidden={true} /> Son vurgular</h2>
      {#if h.highlights.length}
        <ul class="list">
          {#each h.highlights as x (x.annotation.id)}
            {@const l = labelInfo(x.annotation.label)}
            <li>
              <button class="row" style:--c={l.color} onclick={() => lib.open(x.doc, x.annotation.page)}>
                <span class="text">
                  <span class="title">{x.annotation.text || "(metinsiz vurgu)"}</span>
                  <span class="muted"><i class="n-dot" style:background={l.color}></i> {l.name} · s. {x.annotation.page}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">Okurken metni seçip etiketlediğinde vurguların burada görünür.</p>
      {/if}
    </section>
  </div>

  <div class="grid two">
    <section aria-labelledby="h-added">
      <div class="sechead">
        <h2 id="h-added" class="big"><FolderOpen size={22} aria-hidden={true} /> Son eklenenler</h2>
        <span class="n-badge">{lib.counts.all} belge</span>
      </div>
      <ul class="added">
        {#each added as d (d.id)}
          {@const p = readingProgress(d)}
          <li class="n-card doc">
            <span class="n-icon-tile"><FileText size={22} /></span>
            <span class="text">
              <span class="n-eyebrow">{[courseName(d.courseId) ?? "Derssiz", d.week != null ? `Hafta ${d.week}` : null].filter(Boolean).join(" · ")}</span>
              <span class="title">{d.title}</span>
              <span class="muted">{p.label}{d.pageCount ? ` · ${d.pageCount} sayfa` : ""}</span>
            </span>
            <button class="go" aria-label="{d.title} belgesini göster" onclick={() => lib.setFilter({ kind: "all" }).then(() => (lib.selectedId = d.id))}><ArrowRight size={18} /></button>
          </li>
        {/each}
      </ul>
    </section>

    <section aria-labelledby="h-rec">
      <div class="sechead"><h2 id="h-rec" class="big"><Mic size={22} aria-hidden={true} /> Son kayıtlar</h2></div>
      <div class="n-card pad">
        {#if h.recordings.length}
          <ul class="list">
            {#each h.recordings as x (x.recording.id)}
              <li>
                <button class="row" onclick={() => lib.open(x.doc)}>
                  <span class="n-icon-tile sm"><Mic size={18} /></span>
                  <span class="text">
                    <span class="title">{x.doc.title}</span>
                    <span class="muted">{day(x.recording.startedAt)} · {formatTimestamp(x.recording.durationSeconds)}</span>
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted">Derste kayıt aldığında son kayıtların burada olur.</p>
        {/if}
      </div>
    </section>
  </div>
</main>

<style>
  .home { flex: 1; min-width: 0; overflow: auto; padding: 12px 28px 40px; display: grid; gap: 28px; align-content: start; }
  .hero { display: grid; gap: 6px; }
  h1 { font-size: 34px; line-height: 42px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
  .date { margin: 0; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; color: var(--text-2); font: 600 14px/20px var(--font-label); }
  .date span { display: inline-flex; align-items: center; gap: 6px; }
  .exam { padding: 4px 12px; border-radius: var(--pill); background: var(--danger-soft); color: var(--danger); }
  h2 { font-size: 18px; line-height: 26px; font-weight: 700; margin: 0; display: flex; align-items: center; gap: 10px; letter-spacing: -0.01em; }
  h2 :global(svg) { color: var(--text-2); flex: none; }
  h2.big { font-size: 22px; line-height: 30px; }
  .sechead { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .link {
    display: inline-flex; align-items: center; gap: 4px; border: 0; background: transparent; color: var(--accent-strong); cursor: pointer;
    min-height: var(--hit); padding: 0 8px; font: 600 13px/1 var(--font-label); border-radius: var(--radius-sm); flex: none;
  }
  .link:hover { background: var(--surface-2); }
  .pad { padding: 20px; min-width: 0; }
  .col { display: flex; flex-direction: column; gap: 14px; }
  .col > :global(.btn) { justify-content: center; margin-top: auto; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 18px; align-items: stretch; }
  .grid.two { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: start; }
  .muted { color: var(--text-2); font-size: 13px; }
  p.muted { margin: 0; }
  .pad > p.muted + :global(.btn) { margin-top: 14px; }
  ul { list-style: none; margin: 0; padding: 0; }
  .list { display: grid; gap: 6px; }
  .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; font-weight: 600; }
  .title.lg { font-size: 20px; line-height: 28px; font-weight: 700; letter-spacing: -0.01em; }
  .text { display: grid; min-width: 0; flex: 1; gap: 1px; }

  .recent { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 18px; }
  .resume { padding: 20px 22px; display: grid; gap: 16px; min-width: 0; }
  .tags { display: flex; align-items: center; gap: 12px; }
  .when { display: inline-flex; align-items: center; gap: 4px; color: var(--text-2); font: 600 12px/1 var(--font-label); }
  .what { display: flex; gap: 14px; align-items: center; min-width: 0; }
  .pageTile {
    width: 64px; height: 64px; flex: none; display: grid; place-items: center; align-content: center; gap: 4px; border-radius: var(--radius-sm);
    background: var(--accent-soft); color: var(--accent-strong);
  }
  .pageTile small { font: 600 11px/1 var(--font-label); }
  .prog { display: grid; grid-template-columns: 1fr auto; gap: 8px; color: var(--text-2); }
  .prog .n-label:last-of-type { color: var(--text); }
  .bar { grid-column: 1 / -1; height: 8px; border-radius: var(--pill); background: var(--surface-3); overflow: hidden; }
  .bar span { display: block; height: 100%; border-radius: inherit; background: var(--accent-strong); }
  .foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .facts { display: flex; gap: 14px; font: 600 12px/1 var(--font-label); color: var(--text-2); }
  .facts span { display: inline-flex; align-items: center; gap: 6px; }

  .check { display: flex; align-items: center; gap: 10px; min-height: var(--hit); padding: 8px 10px; border-radius: var(--radius-sm); cursor: pointer; background: var(--surface-2); }
  .check:hover { background: var(--surface-3); }
  .check input { width: 18px; height: 18px; flex: none; margin: 0; }
  .time { font: 600 12px/1 var(--font-label); padding: 5px 8px; border-radius: var(--radius-xs); background: var(--surface); color: var(--text); flex: none; }
  .plan.done .title { text-decoration: line-through; color: var(--text-2); }
  .kind { width: 4px; align-self: stretch; border-radius: 2px; flex: none; }
  .dashed {
    margin-top: auto; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: var(--hit);
    border: 1px dashed var(--dash); border-radius: var(--radius-sm); background: transparent; color: var(--accent-strong); cursor: pointer;
    font: 600 13px/1 var(--font-label);
  }
  .dashed:hover { background: var(--surface-2); }

  .metric { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .metric strong { font-size: 40px; line-height: 44px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .boxes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .box { display: grid; justify-items: center; gap: 4px; padding: 10px 4px; border-radius: var(--radius-sm); background: var(--surface-2); }
  .box small { font: 600 11px/1 var(--font-label); color: var(--text-2); }
  .box b { font-size: 20px; font-variant-numeric: tabular-nums; }
  .box:nth-child(1) b { color: var(--coral); }
  .box:nth-child(2) b { color: var(--amber); }
  .box:nth-child(3) b, .box:nth-child(4) b { color: var(--emerald); }

  .chart { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; height: 120px; align-items: end; }
  .day { display: grid; grid-template-rows: 1fr auto; gap: 6px; height: 100%; justify-items: center; }
  .day i { align-self: end; width: 100%; max-width: 28px; border-radius: 6px 6px 3px 3px; background: var(--accent); opacity: 0.55; }
  .day i.empty { background: var(--surface-3); opacity: 1; }
  .day.today i:not(.empty) { background: var(--accent-strong); opacity: 1; }
  .day small { font: 600 11px/1 var(--font-label); color: var(--text-2); }
  .day.today small { color: var(--accent-strong); }
  .stats { margin-top: auto; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; font: 600 12px/16px var(--font-label); color: var(--text-2); }
  .stats b { color: var(--text); }

  .row {
    width: 100%; display: flex; align-items: center; gap: 12px; min-height: var(--hit); padding: 8px 10px; text-align: left;
    border: 0; border-radius: var(--radius-sm); background: transparent; cursor: pointer;
  }
  .row[style] { background: color-mix(in srgb, var(--c) 12%, var(--surface)); }
  .row:hover { background: var(--surface-2); }
  .row .muted { display: inline-flex; align-items: center; gap: 6px; }
  .n-icon-tile.sm { width: 36px; height: 36px; }

  .added { display: grid; gap: 10px; }
  .doc { display: flex; align-items: center; gap: 14px; padding: 12px 12px 12px 14px; min-width: 0; }
  .go {
    width: var(--hit); height: var(--hit); flex: none; display: grid; place-items: center; border-radius: var(--radius-sm); border: 0;
    background: var(--surface-2); color: var(--accent-strong); cursor: pointer;
  }
  .go:hover { background: var(--accent-soft); }
  @media (max-width: 719px) {
    .home { padding: 8px 16px 32px; gap: 22px; }
    h1 { font-size: 28px; line-height: 36px; }
    .recent { grid-template-columns: 1fr; }
    .grid.two { grid-template-columns: 1fr; }
  }
</style>
