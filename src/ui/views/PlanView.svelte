<script lang="ts">
  import { ChevronLeft, ChevronRight, ExternalLink, Plus, Repeat } from "@lucide/svelte";
  import { onMount } from "svelte";
  import {
    DAY_NAMES, DAY_SHORT, PLAN_KINDS, formatMinutes, formatTime, kindColor, kindName, shortDate, weekLabel, weekdayIndex,
    type Occurrence,
  } from "../../core/plan/plan";
  import type { Id } from "../../core/types";
  import Button from "../components/Button.svelte";
  import Dialog from "../components/Dialog.svelte";
  import IconButton from "../components/IconButton.svelte";
  import type { Library } from "../library.svelte";
  import { Plan, type PlanDraft } from "../plan.svelte";

  let { lib }: { lib: Library } = $props();
  // lib never changes for the app lifetime.
  // svelte-ignore state_referenced_locally
  const plan = new Plan(lib);

  let narrow = $state(false);
  onMount(() => {
    void plan.refresh();
    const mq = matchMedia("(max-width: 1000px)");
    const set = () => (narrow = mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  });

  // ---- dialog
  let draft = $state<PlanDraft | null>(null);
  let editing = $state<Occurrence | null>(null);
  let error = $state("");
  const openNew = (day: string) => {
    editing = null;
    error = "";
    draft = plan.draftFor(day);
  };
  const openEdit = (o: Occurrence) => {
    editing = o;
    error = "";
    draft = plan.draftFor(o.day, o);
  };
  const close = () => (draft = null);
  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim()) return void (error = "Başlık yaz.");
    if (!draft.day) return void (error = "Gün seç.");
    await plan.save(draft, editing);
    close();
  };
  /** Touch-friendly fallback for dragging: moves the occurrence the dialog was opened from. */
  const moveTo = async (e: Event) => {
    const to = (e.currentTarget as HTMLSelectElement).value;
    if (editing && to) await plan.move(editing, to);
    close();
  };
  const remove = async () => {
    if (editing) await plan.remove(editing.item.id);
    close();
  };
  const docsForCourse = $derived(draft?.courseId == null ? plan.docs : plan.docs.filter((d) => d.courseId === draft?.courseId));
  const courseName = (id: Id | null) => (id == null ? "Genel" : (lib.courses.find((c) => c.id === id)?.name ?? "Genel"));
  const onCourse = (e: Event) => {
    if (!draft) return;
    const v = (e.currentTarget as HTMLSelectElement).value;
    draft.courseId = v === "" ? null : Number(v);
    if (draft.documentId != null && !docsForCourse.some((d) => d.id === draft?.documentId)) draft.documentId = null;
  };
  const onDoc = (e: Event) => {
    if (!draft) return;
    const v = (e.currentTarget as HTMLSelectElement).value;
    draft.documentId = v === "" ? null : Number(v);
    const d = plan.docs.find((x) => x.id === draft?.documentId);
    if (d && draft.courseId == null) draft.courseId = d.courseId;
    if (d && !draft.title.trim()) draft.title = d.title;
  };

  // ---- drag to another day (pointer events; works with mouse, pen and touch)
  let drag = $state<{ o: Occurrence; x0: number; y0: number; dx: number; dy: number; moving: boolean; over: string | null } | null>(null);
  let suppressClick = false;
  /** Day column under the pointer. The dragged card's own column can show up under the card, so other days win. */
  const dayAt = (x: number, y: number, from: string) => {
    const days = document.elementsFromPoint(x, y).flatMap((el) => (el instanceof HTMLElement && el.dataset.day ? [el.dataset.day] : []));
    return days.find((d) => d !== from) ?? days[0] ?? null;
  };
  const onDown = (e: PointerEvent, o: Occurrence) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("input, label, a, .open")) return;
    drag = { o, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, moving: false, over: null };
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    drag.dx = e.clientX - drag.x0;
    drag.dy = e.clientY - drag.y0;
    if (!drag.moving && Math.hypot(drag.dx, drag.dy) > 6) {
      drag.moving = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (drag.moving) drag.over = dayAt(e.clientX, e.clientY, drag.o.day);
  };
  const onUp = async (e: PointerEvent) => {
    const d = drag;
    drag = null;
    if (!d?.moving) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    const to = dayAt(e.clientX, e.clientY, d.o.day);
    if (to) await plan.move(d.o, to);
  };
  const onItemClick = (o: Occurrence) => {
    if (!suppressClick) openEdit(o);
  };

  const dayTotal = (day: string) => plan.on(day).reduce((s, o) => s + o.item.durationMin, 0);
</script>

{#snippet item(o: Occurrence)}
  {@const dragging = drag?.moving && drag.o.item.id === o.item.id && drag.o.day === o.day}
  <li
    class="item"
    class:done={o.done}
    class:dragging
    style:--kind={kindColor(o.item.kind)}
    style:transform={dragging && drag ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined}
    onpointerdown={(e) => onDown(e, o)}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={() => (drag = null)}
    data-testid="plan-item"
  >
    <label class="tick"><input type="checkbox" checked={o.done} onchange={() => plan.toggle(o)} aria-label="{o.item.title} tamamlandı" /></label>
    <button class="body" onclick={() => onItemClick(o)} aria-label="{o.item.title} düzenle">
      <span class="title">{o.item.title}</span>
      <span class="meta">
        {o.item.startMin != null ? `${formatTime(o.item.startMin)} · ` : ""}{formatMinutes(o.item.durationMin)}
        {#if o.item.repeatWeekly}<Repeat size={12} aria-label="Her hafta" />{/if}
      </span>
      <span class="meta">{kindName(o.item.kind)}{o.item.courseId != null ? ` · ${courseName(o.item.courseId)}` : ""}</span>
    </button>
    {#if o.item.documentId != null}
      <button class="open" onclick={() => plan.openDocument(o.item.documentId!)} title="Belgeyi aç">
        <ExternalLink size={12} aria-hidden={true} /> Aç
      </button>
    {/if}
  </li>
{/snippet}

{#snippet dayList(day: string)}
  <ul class="items">
    {#each plan.on(day) as o (o.item.id)}{@render item(o)}{/each}
  </ul>
  <button class="add" onclick={() => openNew(day)} aria-label="{DAY_NAMES[weekdayIndex(day)]} için ekle">
    <Plus size={14} aria-hidden={true} /> Ekle
  </button>
{/snippet}

<main class="plan">
  <header class="top">
    <h1>Program</h1>
    <div class="nav">
      <IconButton label="Önceki hafta" onclick={() => plan.goWeek(-1)}><ChevronLeft size={18} /></IconButton>
      <span class="week" data-testid="week-label">{weekLabel(plan.monday)}</span>
      <IconButton label="Sonraki hafta" onclick={() => plan.goWeek(1)}><ChevronRight size={18} /></IconButton>
      <Button variant="ghost" disabled={plan.isThisWeek} onclick={() => plan.thisWeek()}>Bu hafta</Button>
    </div>
    <Button variant="primary" onclick={() => openNew(plan.today)}><Plus size={16} aria-hidden={true} /> Plan ekle</Button>
  </header>

  <div class="week-grid" class:list={narrow}>
      {#each plan.days as day, i (day)}
        <section class="col" class:today={day === plan.today} class:over={drag?.moving && drag.over === day} data-day={day} aria-label={DAY_NAMES[i]}>
          <div class="colhead">
            <span class="dname">{DAY_NAMES[i]}</span>
            <span class="ddate">{shortDate(day)}{#if day === plan.today}{" · Bugün"}{/if}</span>
            {#if dayTotal(day)}<span class="dtotal">{formatMinutes(dayTotal(day))}</span>{/if}
          </div>
          {@render dayList(day)}
        </section>
      {/each}
    </div>

  <section class="totals" aria-labelledby="totals-h">
    <h2 id="totals-h">Haftalık toplam</h2>
    {#if plan.totals.length}
      <ul>
        {#each plan.totals as t (t.courseId ?? 0)}
          <li>
            <div class="line"><span class="name">{courseName(t.courseId)}</span><span class="muted">{formatMinutes(t.doneMin)} / {formatMinutes(t.plannedMin)}</span></div>
            <span class="bar" aria-hidden="true"><span style:width="{t.plannedMin ? (100 * t.doneMin) / t.plannedMin : 0}%"></span></span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted">Bu hafta için plan yok. Bir güne "Ekle" ile başla; ders saatlerini "Her hafta tekrarla" ile bir kez gir.</p>
    {/if}
  </section>
</main>

{#if draft}
  <Dialog title={editing ? "Planı düzenle" : "Plan ekle"}>
    <form class="form" onsubmit={(e) => { e.preventDefault(); void save(); }}>
      <label class="full">Başlık <input bind:value={draft.title} placeholder="Örn. Hafta 5 tekrarı" /></label>
      <label>Ders
        <select value={draft.courseId ?? ""} onchange={onCourse}>
          <option value="">Genel</option>
          {#each lib.courses as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </select>
      </label>
      <label>Tür
        <select bind:value={draft.kind}>
          {#each PLAN_KINDS as k (k.key)}<option value={k.key}>{k.name}</option>{/each}
        </select>
      </label>
      <label class="full">Belge (isteğe bağlı)
        <select value={draft.documentId ?? ""} onchange={onDoc}>
          <option value="">Yok</option>
          {#each docsForCourse as d (d.id)}<option value={d.id}>{d.title}</option>{/each}
        </select>
      </label>
      <label>Gün <input type="date" bind:value={draft.day} /></label>
      <label>Saat <input type="time" bind:value={draft.time} /></label>
      <label>Süre (dk) <input type="number" min="5" step="5" bind:value={draft.durationMin} /></label>
      <label class="checkrow"><input type="checkbox" bind:checked={draft.repeatWeekly} /> Her hafta tekrarla</label>
      {#if editing}
        <label class="full">Başka güne taşı
          <select value="" onchange={moveTo} data-testid="move-day">
            <option value="" disabled>Gün seç</option>
            {#each plan.days as d, i (d)}<option value={d} disabled={d === editing.day}>{DAY_NAMES[i]} · {shortDate(d)}</option>{/each}
          </select>
        </label>
      {/if}
      {#if error}<p class="error full" role="alert">{error}</p>{/if}
      <div class="actions full">
        {#if editing}
          <button type="button" class="danger" onclick={remove}>Sil</button>
          {#if editing.item.documentId != null}
            <Button onclick={() => { const id = editing!.item.documentId!; close(); void plan.openDocument(id); }}>Aç</Button>
          {/if}
        {/if}
        <span class="spacer"></span>
        <Button onclick={close}>İptal</Button>
        <button type="submit" class="primary">Kaydet</button>
      </div>
    </form>
  </Dialog>
{/if}

<style>
  .plan { flex: 1; min-width: 0; overflow: auto; padding: 8px 28px 40px; display: flex; flex-direction: column; gap: 20px; }
  .top { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  h1 { font-size: 30px; line-height: 38px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
  h2 { font-size: 18px; line-height: 26px; font-weight: 700; margin: 0 0 14px; }
  .nav {
    display: flex; align-items: center; gap: 2px; flex-wrap: wrap; padding: 3px; margin-right: auto;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); box-shadow: var(--shadow-1);
  }
  .week { font: 600 14px/1 var(--font-label); font-variant-numeric: tabular-nums; min-width: 180px; text-align: center; }
  .muted { color: var(--text-2); font-size: 13px; font-weight: 400; }

  .week-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 12px; align-items: stretch; }
  .col {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px;
    min-height: 320px; display: flex; flex-direction: column; gap: 8px; min-width: 0; box-shadow: var(--shadow-1);
    transition: border-color 0.12s, background 0.12s;
  }
  .col.today { border-color: var(--accent-strong); box-shadow: 0 0 0 1px var(--accent-strong), var(--shadow-2); }
  .col.over { background: var(--accent-soft); border-color: var(--accent); }
  .colhead { display: grid; gap: 2px; padding: 4px 4px 10px; border-bottom: 1px solid var(--border); }
  .dname { font: 600 12px/16px var(--font-label); letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-2); }
  .col.today .dname { color: var(--accent-strong); }
  .ddate { font-size: 16px; font-weight: 700; color: var(--text); }
  .dtotal { color: var(--text-2); font: 600 12px/16px var(--font-label); }

  .items { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .item {
    position: relative; display: grid; grid-template-columns: auto 1fr; align-items: start; gap: 6px; padding: 8px 8px 8px 10px;
    background: var(--surface-2); border-radius: var(--radius-sm); border-left: 4px solid var(--kind);
    touch-action: none; user-select: none; cursor: grab;
  }
  .item.dragging { z-index: 5; cursor: grabbing; box-shadow: 0 8px 24px rgb(0 0 0 / 0.2); opacity: 0.95; }
  .tick { display: grid; place-items: center; width: 40px; height: 40px; margin: -10px -6px -10px -10px; cursor: pointer; }
  .tick input { margin: 0; width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer; }
  .body { display: grid; gap: 1px; min-width: 0; min-height: 40px; align-content: start; padding: 0; border: 0; background: transparent; text-align: left; cursor: inherit; }
  .title { font-weight: 600; font-size: 13px; overflow-wrap: anywhere; }
  .item.done .title { text-decoration: line-through; color: var(--text-2); }
  .meta { color: var(--text-2); font-size: 12px; display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .open {
    grid-column: 2; justify-self: start; display: inline-flex; align-items: center; gap: 4px; min-height: 40px; padding: 0 12px; font-size: 12px;
    border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--accent); cursor: pointer;
  }
  .add {
    margin-top: auto; display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-height: var(--hit);
    border: 1px dashed var(--dash); border-radius: var(--radius-sm); background: transparent; color: var(--text-2); cursor: pointer;
    font: 600 13px/1 var(--font-label);
  }
  .add:hover { color: var(--accent-strong); border-color: var(--accent); background: var(--surface-2); }

  .week-grid.list { grid-template-columns: 1fr; }
  .week-grid.list .col { min-height: 0; }
  .week-grid.list .items { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }

  .totals { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow-1); }
  .totals ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); column-gap: 24px; }
  .totals li { display: grid; gap: 4px; }
  .totals p { margin: 0; }
  .line { display: flex; justify-content: space-between; gap: 8px; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .bar { height: 8px; border-radius: var(--pill); background: var(--surface-3); overflow: hidden; }
  .bar span { display: block; height: 100%; border-radius: inherit; background: var(--accent-strong); }

  .form { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
  .form label { display: grid; gap: 4px; font-size: 13px; color: var(--text-2); }
  .full { grid-column: 1 / -1; }
  .form input:not([type="checkbox"]), .form select {
    min-height: var(--hit); padding: 0 10px; border-radius: var(--radius-sm); border: 1px solid var(--border);
    background: var(--surface); color: var(--text); font: inherit; width: 100%;
  }
  .checkrow { display: flex !important; align-items: center; gap: 8px; align-self: end; min-height: var(--hit); color: var(--text) !important; }
  .checkrow input { width: 18px; height: 18px; accent-color: var(--accent); margin: 0; }
  .error { color: var(--danger); margin: 0; font-size: 13px; }
  .actions { display: flex; gap: 8px; align-items: center; margin-top: 6px; flex-wrap: wrap; }
  .spacer { flex: 1; }
  .primary, .danger { min-height: var(--hit); padding: 0 16px; border-radius: var(--radius-sm); cursor: pointer; font: inherit; }
  .primary { background: var(--accent-strong); border: 1px solid var(--accent-strong); color: var(--on-accent); font: 600 14px/1 var(--font-label); }
  .primary:hover { filter: brightness(1.08); }
  .danger { background: transparent; border: 1px solid var(--border); color: var(--danger); }
  .danger:hover { background: var(--surface-2); }
  @media (max-width: 719px) { .plan { padding: 8px 16px 32px; } h1 { font-size: 24px; } .form { grid-template-columns: 1fr; } }
</style>
