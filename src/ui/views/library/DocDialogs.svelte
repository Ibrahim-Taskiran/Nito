<script lang="ts">
  import { onMount } from "svelte";
  import { parseWeek } from "../../../core/library/browse";
  import type { Document } from "../../../core/types";
  import Button from "../../components/Button.svelte";
  import Dialog from "../../components/Dialog.svelte";
  import type { Library } from "../../library.svelte";
  import type { DocAction } from "./DocMenu.svelte";

  /** Rename / move / week / delete dialogs for one document. */
  let { lib, kind, doc, onclose }: { lib: Library; kind: DocAction; doc: Document; onclose: () => void } = $props();

  const NEW = "new";
  // svelte-ignore state_referenced_locally
  let title = $state(doc.title);
  // svelte-ignore state_referenced_locally
  let course = $state<string>(doc.courseId == null ? "" : String(doc.courseId));
  let courseName = $state("");
  // svelte-ignore state_referenced_locally
  let week = $state(doc.week == null ? "" : String(doc.week));
  let error = $state("");
  let busy = $state(false);
  let box: HTMLDivElement;

  const HEADINGS: Record<DocAction, string> = {
    rename: "Yeniden adlandır",
    move: "Derse taşı",
    week: "Hafta değiştir",
    delete: "Belge silinsin mi?",
  };

  onMount(() => {
    const f = box.querySelector<HTMLInputElement | HTMLSelectElement>("input, select");
    f?.focus();
    if (f instanceof HTMLInputElement) f.select();
  });

  async function submit() {
    if (busy) return;
    error = "";
    try {
      if (kind === "rename") {
        if (!title.trim()) return void (error = "Ad boş olamaz.");
        await go(() => lib.rename(doc, title));
      } else if (kind === "move") {
        if (course === NEW && !courseName.trim()) return void (error = "Yeni dersin adını yazın.");
        await go(() => lib.moveToCourse(doc, course === NEW ? courseName : course ? Number(course) : null));
      } else if (kind === "week") {
        const w = parseWeek(week);
        if (w === undefined) return void (error = "1 ile 99 arasında bir hafta girin ya da boş bırakın.");
        await go(() => lib.setWeek(doc, w));
      } else {
        await go(() => lib.remove(doc));
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      busy = false;
    }
  }

  async function go(f: () => Promise<void>) {
    busy = true;
    await f();
    onclose();
  }

  const onkeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") onclose();
    else if (e.key === "Enter" && kind !== "delete" && (e.target as HTMLElement).tagName === "INPUT") submit();
  };
</script>

<svelte:window {onkeydown} />
<Dialog title={HEADINGS[kind]}>
  <div class="body" bind:this={box}>
    {#if kind === "rename"}
      <label>Belge adı <input bind:value={title} maxlength="200" /></label>
    {:else if kind === "move"}
      <label>Ders
        <select bind:value={course}>
          <option value="">Ders yok</option>
          {#each lib.courses as c (c.id)}<option value={String(c.id)}>{c.name}</option>{/each}
          <option value={NEW}>+ Yeni ders…</option>
        </select>
      </label>
      {#if course === NEW}
        <label>Yeni ders adı <input bind:value={courseName} maxlength="80" placeholder="ör. Veri Yapıları" /></label>
      {/if}
    {:else if kind === "week"}
      <label>Hafta <input bind:value={week} inputmode="numeric" placeholder="Boş: haftasız" /></label>
    {:else}
      <p>“{doc.title}” silinecek. Bu belgedeki vurgular, notlar ve ses kayıtları da silinir. Bu işlem geri alınamaz.</p>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </div>
  {#snippet actions()}
    <Button onclick={onclose}>Vazgeç</Button>
    <Button variant={kind === "delete" ? "danger" : "primary"} disabled={busy} onclick={submit}>{kind === "delete" ? "Sil" : "Kaydet"}</Button>
  {/snippet}
</Dialog>

<style>
  .body { display: grid; gap: 12px; }
  label { display: grid; gap: 6px; color: var(--text-2); font-size: 13px; }
  input, select {
    min-height: var(--hit); padding: 0 12px; border-radius: var(--radius-sm); border: 1px solid var(--border);
    background: var(--surface); color: var(--text); font: inherit; font-size: 14px;
  }
  input:focus, select:focus { outline: 2px solid var(--accent); outline-offset: -1px; border-color: transparent; }
  p { margin: 0; line-height: 1.5; }
  .error { color: var(--danger); font-size: 13px; }
</style>
