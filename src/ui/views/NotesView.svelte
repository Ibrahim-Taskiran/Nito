<script lang="ts">
  import { onMount } from "svelte";
  import { renderMarkdown } from "../../core/notes/markdown";
  import type { Note, NoteKind } from "../../core/types";
  import Button from "../components/Button.svelte";
  import type { Library } from "../library.svelte";
  import { KIND_NAMES, NO_COURSE_NAME, notesFor, type CourseFilter } from "../notes.svelte";
  import { watcherFor } from "../watcher.svelte";
  import WatchFolders from "./WatchFolders.svelte";

  let { lib }: { lib: Library } = $props();

  // svelte-ignore state_referenced_locally
  const notes = notesFor(lib);
  // svelte-ignore state_referenced_locally
  const watcher = watcherFor(lib);
  let editing = $state(false);
  let watchOpen = $state(false);

  const kinds: (NoteKind | "all")[] = ["all", "live", "digest", "free"];
  const n = $derived(notes.selected);
  const html = $derived(n ? renderMarkdown(n.body) : "");

  onMount(() => void notes.refresh());

  const parseCourse = (v: string): CourseFilter => (v === "all" || v === "none" ? v : Number(v));

  async function setCourse(v: string) {
    notes.courseFilter = parseCourse(v);
    await notes.refresh();
  }

  async function setKind(v: string) {
    notes.kindFilter = v as NoteKind | "all";
    await notes.refresh();
  }

  async function open(note: Note) {
    editing = false;
    await notes.select(note.id);
    editing = notes.selected?.kind === "free" && !notes.selected.body;
  }

  async function newNote() {
    await notes.newFree();
    editing = true;
  }

  /** Back-links (nito://annotation/<id>) open the reader; other in-app links do nothing. */
  function onBodyClick(e: MouseEvent) {
    const a = (e.target as Element).closest("a");
    if (!a) return;
    const id = a.dataset.annotation;
    if (id) {
      e.preventDefault();
      void notes.openAnnotation(Number(id));
    } else if (!/^(https?:|mailto:)/.test(a.getAttribute("href") ?? "")) {
      e.preventDefault();
    }
  }

  const courseLabel = (id: number | null) => notes.courseName(id);
  const date = (iso: string) => new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
</script>

<main class="notes">
  <header class="toolbar">
    <h1 class="page">Notlar</h1>
    <span class="n-badge">{notes.notes.length} not</span>
    <span class="grow"></span>
    <label class="field">
      <span>Ders</span>
      <select aria-label="Ders" value={String(notes.courseFilter)} onchange={(e) => setCourse(e.currentTarget.value)}>
        <option value="all">Tüm dersler</option>
        {#each lib.courses as c (c.id)}<option value={String(c.id)}>{c.name}</option>{/each}
        <option value="none">{NO_COURSE_NAME}</option>
      </select>
    </label>
    <label class="field">
      <span>Tür</span>
      <select aria-label="Tür" value={notes.kindFilter} onchange={(e) => setKind(e.currentTarget.value)}>
        {#each kinds as k (k)}<option value={k}>{k === "all" ? "Tümü" : KIND_NAMES[k]}</option>{/each}
      </select>
    </label>
    <Button onclick={() => (watchOpen = true)}>Klasör izle</Button>
    <Button variant="primary" onclick={newNote}>Yeni not</Button>
  </header>

  <div class="actions">
    <label class="field">
      <span>Belge</span>
      <select aria-label="Belge" value={notes.documentId == null ? "" : String(notes.documentId)}
        onchange={(e) => (notes.documentId = Number(e.currentTarget.value) || null)} disabled={!notes.documents.length}>
        {#each notes.documents as d (d.id)}<option value={String(d.id)}>{d.title}</option>{/each}
      </select>
    </label>
    <Button onclick={() => notes.refreshLive()} disabled={notes.documentId == null}>Canlı notu güncelle</Button>
    <span class="sep"></span>
    <Button onclick={() => notes.makeDigest()} disabled={notes.courseFilter === "all"}>Renk özeti oluştur</Button>
    {#if notes.courseFilter === "all"}<span class="hint">Renk özeti için bir ders seç.</span>{/if}
  </div>

  <div class="body">
    <nav class="list" aria-label="Not listesi">
      {#each notes.notes as note (note.id)}
        <button class="item" class:active={note.id === notes.selectedId} onclick={() => open(note)}>
          <span class="title">{note.title || "Adsız not"}</span>
          <span class="meta">{KIND_NAMES[note.kind] ?? note.kind} · {courseLabel(note.courseId)}</span>
        </button>
      {:else}
        <p class="empty">Bu süzgeçte not yok. Bir belge seçip “Canlı notu güncelle” ile vurgularından not oluşturabilirsin.</p>
      {/each}
    </nav>

    <section class="viewer" aria-label="Not">
      {#if n}
        {#key n.id}
          <header class="vhead">
            {#if n.kind === "free" && editing}
              <input class="title-input" aria-label="Not başlığı" value={n.title}
                onblur={(e) => notes.save(n.id, { title: e.currentTarget.value.trim() || "Adsız not" })} />
            {:else}
              <h1>{n.title}</h1>
            {/if}
            <span class="meta">{KIND_NAMES[n.kind] ?? n.kind} · {courseLabel(n.courseId)} · {date(n.updatedAt)}</span>
            <div class="row">
              {#if n.kind === "free"}
                <Button variant="ghost" onclick={() => (editing = !editing)}>{editing ? "Görüntüle" : "Düzenle"}</Button>
                <Button variant="ghost" onclick={() => notes.remove(n.id)}>Sil</Button>
              {/if}
              <Button onclick={() => notes.exportNote(n)}>Markdown olarak dışa aktar</Button>
            </div>
          </header>
          {#if notes.message}<p class="status" role="status">{notes.message}</p>{/if}
          {#if n.kind === "free" && editing}
            <textarea class="editor" aria-label="Not metni" value={n.body} placeholder="Markdown yazabilirsin: # başlık, - madde, **kalın**, *eğik*, > alıntı"
              onblur={(e) => notes.save(n.id, { body: e.currentTarget.value })}></textarea>
          {:else}
            <!-- Links inside are real <a> elements, so keyboard users activate them with Enter (click event). -->
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
            <article class="md" onclick={onBodyClick}>
              {@html html}
              {#if !n.body.trim()}<p class="empty">Boş not. “Düzenle” ile yazmaya başla.</p>{/if}
            </article>
          {/if}
        {/key}
      {:else}
        <p class="empty center">Soldan bir not seç ya da yeni bir not oluştur.</p>
      {/if}
    </section>
  </div>
</main>

{#if watchOpen}<WatchFolders {watcher} web={lib.platform.name === "web"} onclose={() => (watchOpen = false)} />{/if}

<style>
  .notes { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; padding: 8px 28px 28px; }
  .toolbar, .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .page { font-size: 30px; line-height: 38px; font-weight: 700; letter-spacing: -0.02em; margin: 0; }
  .actions { padding: 8px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-1); }
  .grow { flex: 1; }
  .sep { width: 1px; align-self: stretch; background: var(--border); margin: 4px 4px; }
  .field { display: flex; align-items: center; gap: 8px; color: var(--text-2); font: 600 12px/1 var(--font-label); letter-spacing: 0.04em; text-transform: uppercase; }
  select {
    min-height: var(--hit); max-width: 260px; padding: 0 8px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--text); font: 500 14px/1 var(--font); text-transform: none; letter-spacing: 0;
  }
  .hint { color: var(--text-2); font-size: 13px; }
  .body {
    flex: 1; display: flex; min-height: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
    box-shadow: var(--shadow-1); overflow: hidden;
  }
  .list { width: 300px; flex: none; overflow-y: auto; padding: 10px; border-right: 1px solid var(--border); background: var(--surface-2); display: flex; flex-direction: column; gap: 4px; }
  .item {
    min-height: var(--hit); padding: 8px 12px; border: 0; border-radius: var(--radius-sm); background: transparent; cursor: pointer;
    text-align: left; display: flex; flex-direction: column; gap: 2px;
  }
  .item:hover { background: var(--surface-3); }
  .item.active { background: var(--surface); box-shadow: var(--shadow-1); }
  .item.active .title { color: var(--accent-strong); }
  .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { color: var(--text-2); font-size: 12px; }
  .viewer { flex: 1; min-width: 0; overflow-y: auto; padding: 24px 32px; display: flex; flex-direction: column; gap: 12px; }
  .vhead { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; }
  .vhead h1, .title-input { flex: 1 1 100%; margin: 0; font-size: 24px; line-height: 32px; font-weight: 700; letter-spacing: -0.01em; }
  .title-input, .editor {
    border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); padding: 8px 12px;
  }
  .title-input { min-height: var(--hit); }
  .vhead .row { margin-left: auto; display: flex; gap: 4px; }
  .editor { flex: 1; min-height: 320px; resize: vertical; font: inherit; line-height: 1.6; }
  .status { margin: 0; padding: 8px 12px; border-radius: var(--radius-sm); background: var(--surface-2); color: var(--text-2); font-size: 13px; overflow-wrap: anywhere; }
  .empty { color: var(--text-2); padding: 12px; margin: 0; }
  .center { margin: auto; text-align: center; }
  .md { max-width: 760px; line-height: 1.6; }
  .md :global(h1) { font-size: 20px; margin: 0 0 12px; }
  .md :global(h2) { font-size: 16px; margin: 24px 0 8px; }
  .md :global(h3) { font-size: 14px; margin: 18px 0 6px; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.04em; }
  .md :global(h4) { font-size: 14px; margin: 14px 0 6px; }
  .md :global(blockquote) { margin: 8px 0; padding: 10px 16px; border-left: 4px solid var(--accent); background: var(--surface-2); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
  .md :global(a) { color: var(--accent); }
  .md :global(code) { background: var(--surface-2); padding: 1px 4px; border-radius: 4px; }
  .md :global(hr) { border: 0; border-top: 1px solid var(--border); }
  @media (max-width: 719px) {
    .notes { padding: 8px 12px 16px; }
    .page { font-size: 24px; }
    .body { flex-direction: column; overflow: auto; }
    .list { width: auto; max-height: 40%; border-right: 0; border-bottom: 1px solid var(--border); }
    .viewer { padding: 16px; overflow: visible; }
  }
</style>
