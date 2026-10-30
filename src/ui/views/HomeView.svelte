<script lang="ts">
  import { CalendarDays, Clock, GraduationCap, Highlighter, Layers, Mic, Play } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { labelInfo } from "../../core/labels";
  import { formatMinutes, formatTime, greeting, kindColor, kindName, longDate, shortDate } from "../../core/plan/plan";
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
</script>

<main class="home">
  <header class="top">
    <h1>{greeting(h.hour)}</h1>
    <p class="date">{longDate(h.today)}</p>
  </header>

  <div class="grid">
    <section class="card wide" aria-labelledby="h-continue">
      <h2 id="h-continue">Kaldığın yerden devam et</h2>
      {#if h.recent.length}
        <ul class="recent">
          {#each h.recent as r (r.doc.id)}
            <li>
              <button class="tile" onclick={() => lib.open(r.doc, r.lastPage)}>
                <span class="title">{r.doc.title}</span>
                <span class="muted">
                  {courseName(r.doc.courseId) ?? "Derssiz"}{r.lastPage ? ` · s. ${r.lastPage}${r.pageCount ? `/${r.pageCount}` : ""}` : ""}
                </span>
                {#if r.lastPage && r.pageCount}
                  <span class="bar" aria-hidden="true"><span style:width="{Math.min(100, (100 * r.lastPage) / r.pageCount)}%"></span></span>
                {/if}
                <span class="go"><Play size={14} aria-hidden={true} /> Devam et</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">Henüz bir belge açmadın. Kütüphaneden bir PDF seçince burada kaldığın sayfadan devam edersin.</p>
        <Button onclick={() => lib.setFilter({ kind: "all" })}>Kütüphaneye git</Button>
      {/if}
    </section>

    <section class="card" aria-labelledby="h-plan">
      <div class="head">
        <h2 id="h-plan"><CalendarDays size={16} aria-hidden={true} /> Bugünün planı</h2>
        <button class="link" onclick={() => (lib.section = "plan")}>Program</button>
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
                  <span class="muted">
                    {o.item.startMin != null ? `${formatTime(o.item.startMin)} · ` : ""}{formatMinutes(o.item.durationMin)} · {kindName(o.item.kind)}{courseName(o.item.courseId) ? ` · ${courseName(o.item.courseId)}` : ""}
                  </span>
                </span>
              </label>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">Bugün için plan yok. Haftanı planlamak birkaç dakika sürer.</p>
        <Button onclick={() => (lib.section = "plan")}>Programa ekle</Button>
      {/if}
    </section>

    <section class="card" aria-labelledby="h-due">
      <h2 id="h-due"><Layers size={16} aria-hidden={true} /> Tekrar zamanı gelen kartlar</h2>
      <div class="big"><strong data-testid="home-due">{h.dueCount}</strong><span class="muted">kart bugün seni bekliyor</span></div>
      {#if h.dueCount}
        <Button variant="primary" onclick={() => (lib.section = "study")}><GraduationCap size={16} aria-hidden={true} /> Çalışma Merkezi'ne git</Button>
      {:else}
        <p class="muted">Tanım ve Soru vurguları kart olur. Şimdilik tekrar edecek kart yok.</p>
      {/if}
    </section>

    <section class="card" aria-labelledby="h-week">
      <h2 id="h-week"><Clock size={16} aria-hidden={true} /> Bu hafta</h2>
      <div class="stats">
        <div><strong>{formatMinutes(h.week.doneMin)}</strong><span class="muted">çalışıldı{h.week.plannedMin ? ` / ${formatMinutes(h.week.plannedMin)} plan` : ""}</span></div>
        <div><strong>{h.week.highlights}</strong><span class="muted">yeni vurgu</span></div>
      </div>
    </section>

    <section class="card" aria-labelledby="h-hl">
      <h2 id="h-hl"><Highlighter size={16} aria-hidden={true} /> Son vurgular</h2>
      {#if h.highlights.length}
        <ul class="list">
          {#each h.highlights as x (x.annotation.id)}
            <li>
              <button class="row" onclick={() => lib.open(x.doc, x.annotation.page)}>
                <span class="dot" style:background={labelInfo(x.annotation.label).color} aria-hidden="true"></span>
                <span class="text">
                  <span class="title">{x.annotation.text || "(metinsiz vurgu)"}</span>
                  <span class="muted">{labelInfo(x.annotation.label).name} · {x.doc.title} · s. {x.annotation.page}</span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">Okurken metni seçip etiketlediğinde vurguların burada görünür.</p>
      {/if}
    </section>

    <section class="card" aria-labelledby="h-rec">
      <h2 id="h-rec"><Mic size={16} aria-hidden={true} /> Son kayıtlar</h2>
      {#if h.recordings.length}
        <ul class="list">
          {#each h.recordings as x (x.recording.id)}
            <li>
              <button class="row" onclick={() => lib.open(x.doc)}>
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
    </section>
  </div>
</main>

<style>
  .home { flex: 1; min-width: 0; overflow: auto; padding: 24px 24px 32px; }
  .top { margin-bottom: 20px; }
  h1 { font-size: 22px; font-weight: 600; margin: 0; }
  .date { margin: 2px 0 0; color: var(--text-2); }
  h2 { font-size: 15px; font-weight: 600; margin: 0 0 10px; display: flex; align-items: center; gap: 8px; }
  h2 :global(svg) { color: var(--text-2); }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .link { border: 0; background: transparent; color: var(--accent); cursor: pointer; padding: 4px; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; align-items: start; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; min-width: 0; }
  .wide { grid-column: 1 / -1; }
  .muted { color: var(--text-2); font-size: 13px; }
  p.muted { margin: 0 0 12px; }
  ul { list-style: none; margin: 0; padding: 0; }
  .list { display: grid; gap: 2px; }
  .recent { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .tile {
    width: 100%; height: 100%; display: grid; gap: 4px; align-content: start; text-align: left; padding: 12px;
    border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); cursor: pointer;
  }
  .tile:hover { border-color: var(--accent); background: var(--surface-2); }
  .go { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-size: 13px; margin-top: 4px; }
  .bar { height: 4px; border-radius: 2px; background: var(--surface-2); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--accent); }
  .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .text { display: grid; min-width: 0; }
  .row {
    width: 100%; display: flex; align-items: center; gap: 10px; min-height: var(--hit); padding: 6px 8px; text-align: left;
    border: 0; border-radius: var(--radius-sm); background: transparent; cursor: pointer;
  }
  .row:hover { background: var(--surface-2); }
  .check { display: flex; align-items: center; gap: 10px; min-height: var(--hit); padding: 4px 8px; border-radius: var(--radius-sm); cursor: pointer; }
  .check:hover { background: var(--surface-2); }
  .check input { width: 18px; height: 18px; accent-color: var(--accent); flex: none; margin: 0; }
  .plan.done .title { text-decoration: line-through; color: var(--text-2); }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  .kind { width: 4px; align-self: stretch; border-radius: 2px; flex: none; }
  .big { display: flex; align-items: baseline; gap: 10px; margin: 0 0 12px; }
  .big strong, .stats strong { font-size: 28px; font-weight: 600; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .stats { display: flex; gap: 32px; flex-wrap: wrap; }
  .stats div { display: grid; }
  .stats strong { font-size: 22px; }
  @media (max-width: 640px) { .home { padding: 16px; } }
</style>
