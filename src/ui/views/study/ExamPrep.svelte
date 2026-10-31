<script lang="ts">
  import { FLAGS, FlagRepo, examItems, examWeeks, flagInfo, type ExamItem, type ExamKind } from "../../../core/exam/flags";
  import { labelInfo } from "../../../core/labels";
  import type { Document, Id } from "../../../core/types";
  import type { Library } from "../../library.svelte";
  import { openPdf, type PDFDocumentProxy } from "../../pdf";

  /** "Sınav hazırlığı": flagged pages and Sınav highlights of a course; tap opens the reader at that page. */
  let { lib, courseId }: { lib: Library; courseId: Id | null } = $props();

  // lib never changes for the app lifetime.
  // svelte-ignore state_referenced_locally
  const repo = new FlagRepo(lib.repo.db);
  let all = $state.raw<ExamItem[]>([]);
  let loaded = $state(false);
  let kind = $state<ExamKind | null>(null);
  let week = $state<number | null>(null);

  $effect(() => {
    const id = courseId;
    void Promise.all([repo.listWithDocs(id), repo.examHighlights(id)]).then(([f, h]) => {
      all = examItems(f, h);
      loaded = true;
    });
  });

  const weeks = $derived(examWeeks(all));
  const items = $derived(examItems(
    all.flatMap((i) => i.flags.map((k) => ({ doc: i.doc, page: i.page, kind: k }))),
    all.flatMap((i) => i.highlights.map((ann) => ({ doc: i.doc, ann }))),
    { kind, week: weeks.includes(week ?? -1) ? week : null },
  ));
  const counts = $derived(Object.fromEntries([
    ...FLAGS.map((f) => [f.key, all.filter((i) => i.flags.includes(f.key)).length]),
    ["exam", all.filter((i) => i.highlights.length).length],
  ]) as Record<ExamKind, number>);
  const chips: { key: ExamKind | null; name: string; color?: string }[] = [
    { key: null, name: "Tümü" },
    ...FLAGS.map((f) => ({ key: f.key, name: f.name, color: f.color })),
    { key: "exam", name: `${labelInfo("exam").name} vurgusu`, color: labelInfo("exam").color },
  ];

  // Page previews: one open PDF per document, at most two renders at once, freed with the view.
  const pdfs = new Map<Id, Promise<PDFDocumentProxy>>();
  let running = 0;
  const queue: (() => void)[] = [];
  const PREVIEW_W = 120;

  function pdfOf(d: Document): Promise<PDFDocumentProxy> {
    let p = pdfs.get(d.id);
    if (!p) pdfs.set(d.id, (p = lib.platform.storage.read(d.filePath).then(openPdf)));
    return p;
  }

  $effect(() => () => {
    for (const p of pdfs.values()) void p.then((pdf) => pdf.loadingTask.destroy(), () => {});
  });

  function preview(canvas: HTMLCanvasElement, it: { doc: Document; page: number }) {
    let alive = true;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      if (running >= 2) await new Promise<void>((r) => queue.push(r));
      running++;
      try {
        const pdf = await pdfOf(it.doc);
        if (!alive || it.page > pdf.numPages) return;
        const page = await pdf.getPage(it.page);
        const vp = page.getViewport({ scale: (PREVIEW_W * Math.min(2, window.devicePixelRatio || 1)) / page.getViewport({ scale: 1 }).width });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        await page.render({ canvas, viewport: vp }).promise;
        canvas.dataset.drawn = "";
      } catch { /* missing file: the grey box stays */ } finally {
        running--;
        queue.shift()?.();
      }
    }, { rootMargin: "200px" });
    io.observe(canvas);
    return { destroy: () => { alive = false; io.disconnect(); } };
  }
</script>

<h2>Sınav hazırlığı</h2>
<p class="muted">Okurken sayfaya koyduğun işaretler (Hoca vurguladı, Sınav adayı, Anlaşılmadı) ve Sınav etiketli vurguların burada toplanır. Sayfaya dokununca okuyucuda açılır.</p>
<div class="filters">
  <div class="chips" role="group" aria-label="İşaret türü">
    {#each chips as c (c.key ?? "all")}
      <button class="chip" aria-pressed={kind === c.key} onclick={() => (kind = c.key)}>
        {#if c.color}<span class="dot" style:background={c.color}></span>{/if}{c.name}
        {#if c.key}<span class="n">{counts[c.key]}</span>{/if}
      </button>
    {/each}
  </div>
  {#if weeks.length}
    <label class="week">Hafta
      <select aria-label="Hafta filtresi" value={week ?? ""} onchange={(e) => (week = e.currentTarget.value ? Number(e.currentTarget.value) : null)}>
        <option value="">Tüm haftalar</option>
        {#each weeks as w (w)}<option value={w}>Hafta {w}</option>{/each}
      </select>
    </label>
  {/if}
</div>

{#if !loaded}
  <p class="muted">Yükleniyor…</p>
{:else if !items.length}
  <p class="muted">{all.length ? "Bu filtreyle sayfa yok." : "Henüz işaretli sayfa yok. Okuyucuda “İşaretle” ile bir sayfayı işaretleyebilirsin."}</p>
{:else}
  <ul class="pages" aria-label="Sınav sayfaları">
    {#each items as it (`${it.doc.id}:${it.page}`)}
      <li>
        <button class="item" onclick={() => lib.open(it.doc, it.page)} aria-label="{it.doc.title}, sayfa {it.page}">
          <canvas use:preview={it} width="0" height="0" aria-hidden="true"></canvas>
          <span class="info">
            <span class="title">{it.doc.title}</span>
            <span class="muted">{it.doc.week != null ? `Hafta ${it.doc.week} · ` : ""}s. {it.page}</span>
            <span class="tags">
              {#each it.flags as k (k)}<span class="tag"><span class="dot" style:background={flagInfo(k).color}></span>{flagInfo(k).name}</span>{/each}
            </span>
            {#each it.highlights as h (h.id)}
              <span class="hl"><span class="dot" style:background={labelInfo("exam").color}></span>{h.text || "(metinsiz vurgu)"}{h.comment ? ` · ${h.comment}` : ""}</span>
            {/each}
          </span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  h2 { font-size: 18px; line-height: 26px; font-weight: 700; margin: 0 0 4px; }
  .muted { color: var(--text-2); font-size: 13px; }
  p.muted { margin: 0 0 12px; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; margin-bottom: 12px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    min-height: var(--hit); padding: 0 14px; border: 1px solid var(--border); border-radius: var(--pill); background: var(--surface-2);
    color: var(--text); cursor: pointer; display: inline-flex; align-items: center; gap: 8px; font: 600 13px/1 var(--font-label);
    touch-action: manipulation;
  }
  .chip:hover { background: var(--surface-3); }
  .chip[aria-pressed="true"] { border-color: transparent; background: var(--accent-strong); color: var(--on-accent); }
  .n { color: var(--text-2); font-variant-numeric: tabular-nums; padding: 2px 7px; border-radius: var(--pill); background: var(--surface); font-size: 11px; }
  .chip[aria-pressed="true"] .n { background: rgb(255 255 255 / 0.18); color: inherit; }
  .week { display: flex; align-items: center; gap: 8px; color: var(--text-2); }
  select {
    min-height: var(--hit); padding: 0 10px; border-radius: var(--radius-sm); border: 1px solid var(--border);
    background: var(--surface); color: var(--text); font: inherit;
  }
  .pages { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
  .item {
    width: 100%; display: flex; gap: 12px; align-items: flex-start; text-align: left; padding: 12px; min-height: var(--hit);
    border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-2); color: var(--text);
    cursor: pointer; font: inherit; touch-action: manipulation;
  }
  .item:hover { background: var(--surface-2); }
  canvas { width: 120px; aspect-ratio: 595 / 842; flex: none; background: var(--surface-2); border-radius: 2px; box-shadow: 0 0 0 1px var(--border); }
  canvas:global([data-drawn]) { aspect-ratio: auto; background: #fff; }
  .info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .tag { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 1px 8px; border-radius: 999px; background: var(--surface-2); }
  .hl { font-size: 13px; display: flex; gap: 6px; align-items: baseline; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; display: inline-block; }
</style>
