<script lang="ts">
  import { BookOpen, Play } from "@lucide/svelte";
  import { readingProgress } from "../../core/library/browse";
  import { READ_STATUS_NAMES } from "../../core/labels";
  import Button from "../components/Button.svelte";
  import type { Library } from "../library.svelte";
  import Cover from "./library/Cover.svelte";
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
    {#key d.id}<div class="cover"><Cover storage={lib.platform.storage} doc={d} /></div>{/key}
    <h2>{d.title}</h2>
    <p class="sub">{[course?.name ?? "Derssiz", d.week != null ? `Hafta ${d.week}` : null].filter(Boolean).join(" · ")}</p>

    <div class="progress">
      <div class="bar" aria-hidden="true"><i style:width="{p.ratio * 100}%"></i></div>
      <span>{p.label}{#if d.lastPage && d.pageCount && d.readStatus !== "read"} · s. {d.lastPage}/{d.pageCount}{/if}</span>
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
      <dt>Son açılma</dt><dd>{ago(d.lastOpenedAt)}</dd>
      <dt>Eklendi</dt><dd>{date(d.addedAt)}</dd>
    </dl>
  {:else}
    <p class="hint">Ayrıntı için bir belge seçin.</p>
  {/if}
</aside>

<style>
  .detail { width: 300px; flex: none; border-left: 1px solid var(--border); background: var(--surface); padding: 20px; overflow-y: auto; }
  .cover { width: 168px; margin: 0 auto 16px; box-shadow: 0 6px 20px rgb(0 0 0 / 0.1); border-radius: var(--radius-sm); }
  h2 { font-size: 16px; font-weight: 600; margin: 0 0 4px; overflow-wrap: anywhere; line-height: 1.35; }
  .sub { margin: 0 0 14px; color: var(--text-2); font-size: 13px; }
  .progress { display: grid; gap: 6px; font-size: 12px; color: var(--text-2); }
  .bar { height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--accent); }
  .actions { display: grid; gap: 8px; margin: 16px 0; }
  .actions :global(.btn) { justify-content: center; width: 100%; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 0 0 16px; }
  .stats div { background: var(--surface-2); border-radius: var(--radius-sm); padding: 8px 4px; text-align: center; }
  .stats dt { font-size: 11px; color: var(--text-2); }
  .stats dd { margin: 2px 0 0; font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .facts { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; margin: 0; font-size: 13px; }
  .facts dt { color: var(--text-2); }
  .facts dd { margin: 0; }
  .hint { color: var(--text-2); }
  @media (max-width: 1023px) { .detail { display: none; } }
</style>
