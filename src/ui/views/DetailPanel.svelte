<script lang="ts">
  import { BookOpen, BookOpenText, Clock, Play } from "@lucide/svelte";
  import { readingProgress } from "../../core/library/browse";
  import { READ_STATUS_NAMES } from "../../core/labels";
  import Button from "../components/Button.svelte";
  import type { Library } from "../library.svelte";
  let { lib }: { lib: Library } = $props();
  const d = $derived(lib.selected);
  const course = $derived(d && lib.courses.find((c) => c.id === d.courseId));
  const st = $derived(d ? lib.stats.get(d.id) : undefined);
  const p = $derived(d ? readingProgress(d) : null);
  const resumable = $derived(!!d?.lastPage && d.lastPage > 1);

  const date = (iso: string) => new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  function ago(iso: string | null): string {
    if (!iso) return "Hiç açılmadı";
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days <= 0) return "Bugün";
    if (days === 1) return "Dün";
    if (days < 7) return `${days} gün önce`;
    return date(iso);
  }
</script>

<aside class="detail" aria-label="Belge ayrıntısı">
  {#if d && p}
    <div class="n-eyebrow">Ayrıntılar</div>
    <h2>{d.title}</h2>
    <p class="sub">{[course?.name ?? "Derssiz", d.week != null ? `Hafta ${d.week}` : null].filter(Boolean).join(" · ")}</p>

    <div class="progress">
      <svg class="ring" viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="15.5" class="track" />
        <circle cx="18" cy="18" r="15.5" class="val" stroke-dasharray="{p.ratio * 97.4} 97.4" />
      </svg>
      <span class="pct">%{Math.round(p.ratio * 100)}</span>
      <div class="ptext">
        <span class="n-label">{p.label}</span>
        <span class="muted"><BookOpenText size={15} aria-hidden="true" />{#if d.lastPage && d.pageCount}Sayfa {d.lastPage} / {d.pageCount}{:else}{d.pageCount ?? "—"} sayfa{/if}</span>
        <span class="muted"><Clock size={15} aria-hidden="true" />Son açılma: {ago(d.lastOpenedAt)}</span>
      </div>
    </div>

    <div class="actions">
      {#if resumable}
        <Button variant="primary" onclick={() => lib.resume(d)}><Play size={16} />Kaldığın yerden devam et (s. {d.lastPage})</Button>
        <Button onclick={() => lib.open(d)}>Baştan aç</Button>
      {:else}
        <Button variant="primary" onclick={() => lib.open(d)}><BookOpen size={16} />Aç</Button>
      {/if}
    </div>

    <dl class="stats">
      <div><dt>Sayfa</dt><dd>{d.pageCount ?? "—"}</dd></div>
      <div><dt>Vurgu</dt><dd>{st?.highlights ?? 0}</dd></div>
      <div><dt>Kayıt</dt><dd>{st?.recordings ?? 0}</dd></div>
      <div><dt>Not</dt><dd>{st?.notes ?? 0}</dd></div>
    </dl>

    <dl class="facts">
      <dt>Durum</dt><dd>{READ_STATUS_NAMES[d.readStatus]}</dd>
      <dt>Eklendi</dt><dd>{date(d.addedAt)}</dd>
    </dl>
  {:else}
    <div class="n-empty"><BookOpen size={28} aria-hidden="true" /><p>Ayrıntı için bir belge seçin.</p></div>
  {/if}
</aside>

<style>
  .detail {
    width: 330px; flex: none; margin: 8px 28px 28px 0; align-self: flex-start; max-height: calc(100% - 36px); overflow-y: auto;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-2); padding: 24px;
  }
  h2 { font-size: 22px; line-height: 30px; font-weight: 700; margin: 6px 0 4px; overflow-wrap: anywhere; letter-spacing: -0.01em; }
  .sub { margin: 0 0 16px; color: var(--text-2); font-size: 13px; }
  .progress {
    position: relative; display: flex; align-items: center; gap: 16px; padding: 16px; border-radius: var(--radius);
    background: var(--surface-2);
  }
  .ring { width: 76px; height: 76px; flex: none; transform: rotate(-90deg); }
  .ring circle { fill: none; stroke-width: 3.2; }
  .ring .track { stroke: var(--surface-3); }
  .ring .val { stroke: var(--accent-strong); stroke-linecap: round; }
  .pct { position: absolute; left: 16px; width: 76px; text-align: center; font: 700 15px/1 var(--font-label); }
  .ptext { display: grid; gap: 6px; min-width: 0; }
  .muted { display: inline-flex; align-items: center; gap: 6px; color: var(--text-2); font-size: 13px; }
  .actions { display: grid; gap: 8px; margin: 16px 0; }
  .actions :global(.btn) { justify-content: center; width: 100%; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 0 0 16px; }
  .stats div { background: var(--surface-2); border-radius: var(--radius-sm); padding: 10px 4px; text-align: center; }
  .stats dt { font: 600 11px/14px var(--font-label); color: var(--text-2); }
  .stats dd { margin: 4px 0 0; font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .facts { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; margin: 0; font-size: 13px; }
  .facts dt { color: var(--text-2); }
  .facts dd { margin: 0; }
  @media (max-width: 1023px) { .detail { display: none; } }
</style>
