<script lang="ts">
  import { ClipboardPaste, Copy, Globe, Hand, Lasso, Trash2, Undo2 } from "@lucide/svelte";
  import { INK_KINDS } from "../../core/ink";
  import { parseImageUrl } from "../../core/webImage";
  import type { FingerMode } from "../../core/touchInput";
  import MenuButton from "../components/MenuButton.svelte";
  import ToolButton from "../components/ToolButton.svelte";
  import type { Reader } from "../reader.svelte";
  import { clipboardImage, imageFrom, placeBytes } from "../webImages";

  /** Toolbar part for the pen round 2: select tool, undo, pen and touch settings, pictures from the web. */
  let { reader, current, sizeOf, mine, onnotice }: {
    reader: Reader;
    current: number;
    sizeOf: (page: number) => { w: number; h: number } | undefined;
    /** True when this reader has the focus (split view: only one pane takes keys and pastes). */
    mine: () => boolean;
    onnotice: (msg: string | null) => void;
  } = $props();

  const edit = $derived(reader.edit);
  const prefs = $derived(edit.prefs);
  const sel = $derived(reader.inkTool === "select" ? edit.selection : null);
  let url = $state("");
  let busy = $state(false);

  const FINGER: { mode: FingerMode; name: string; hint: string }[] = [
    { mode: "auto", name: "Otomatik", hint: "Kalem görülünce parmak yalnız kaydırır" },
    { mode: "pen-only", name: "Yalnız kalemle çiz", hint: "Parmak kaydırır ve yakınlaştırır" },
    { mode: "finger", name: "Parmakla da çiz", hint: "Kalemi olmayan cihazlar için" },
  ];

  const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]");

  async function run(task: () => Promise<unknown>) {
    onnotice(null);
    busy = true;
    try {
      await task();
    } catch (e) {
      onnotice(e instanceof Error ? e.message : String(e));
    } finally {
      busy = false;
    }
  }

  async function pasteHere(page = current, at?: { x: number; y: number }) {
    const sz = sizeOf(page);
    if (!sz) return;
    await run(async () => {
      let bytes: Uint8Array | null = null;
      try {
        bytes = await clipboardImage();
      } catch { /* clipboard read refused: fall back to copied ink */ }
      if (bytes) await placeBytes(reader, page, sz, bytes, at);
      else if (!(await edit.paste(page))) throw new Error("Panoda resim ya da kopyalanmış çizim yok.");
    });
  }

  async function fromLink(close: () => void) {
    const u = parseImageUrl(url);
    if (!u) {
      onnotice("Geçerli bir resim bağlantısı yazın (https://…).");
      return;
    }
    const sz = sizeOf(current);
    if (!sz) return;
    await run(async () => {
      await placeBytes(reader, current, sz, await reader.lib.platform.fetchImage(u));
      url = "";
      close();
    });
  }

  function onKey(e: KeyboardEvent) {
    if (!mine() || typing(e.target) || e.defaultPrevented) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === "z" && !e.shiftKey && edit.canUndo) {
      e.preventDefault();
      void edit.undo();
    } else if (mod && k === "c" && sel) {
      e.preventDefault();
      edit.copy();
    } else if ((e.key === "Delete" || e.key === "Backspace") && sel) {
      e.preventDefault();
      void edit.remove();
    } else if (e.key === "Escape" && (sel || edit.pasteMenu)) {
      e.preventDefault(); // the reader must not close
      edit.clear();
      edit.pasteMenu = null;
    }
  }

  /** Ctrl+V: a picture on the clipboard goes on the page; otherwise copied strokes are pasted. */
  function onPaste(e: ClipboardEvent) {
    const sz = sizeOf(current);
    if (!mine() || typing(e.target) || !e.clipboardData || !sz) return;
    const dt = e.clipboardData;
    const hasImage = [...dt.items].some((i) => i.kind === "file" && i.type.startsWith("image/")) || /<img\b/i.test(dt.getData("text/html"));
    if (hasImage) {
      e.preventDefault();
      void run(async () => {
        const bytes = await imageFrom(dt, reader);
        if (bytes) await placeBytes(reader, current, sz, bytes);
      });
    } else if (edit.clipReady) {
      e.preventDefault();
      void run(() => edit.paste(current));
    }
  }

  function onDocDown(e: PointerEvent) {
    if (edit.pasteMenu && !(e.target as HTMLElement).closest?.(".paste-menu")) edit.pasteMenu = null;
  }
</script>

<svelte:window onkeydown={onKey} onpaste={onPaste} onpointerdown={onDocDown} />

<ToolButton label="Seç" title="Kement: çizimleri, resimleri ve notları seç; taşı, büyüt, sil" pressed={reader.inkTool === "select"}
  onclick={() => reader.setTool("select")}><Lasso size={18} /></ToolButton>
<ToolButton label="Geri al" title="Geri al (Ctrl+Z)" disabled={!edit.canUndo} onclick={() => edit.undo()}><Undo2 size={18} /></ToolButton>
<MenuButton label="Kalem ve dokunma" title="Kalem ve dokunma ayarları">
  {#snippet icon()}<Hand size={18} />{/snippet}
  {#snippet children()}
    <p class="hint">Parmakla dokunma (bu cihazda saklanır)</p>
    {#each FINGER as f (f.mode)}
      <label class="item" title={f.hint}>
        <input type="radio" name="finger-{reader.doc.id}" checked={prefs.finger === f.mode} onchange={() => edit.setPrefs({ finger: f.mode })} />
        <span>{f.name}<small>{f.hint}</small></span>
      </label>
    {/each}
    <label class="item slider">
      <span>Dokunma hassasiyeti</span>
      <input type="range" min="0" max="1" step="0.1" aria-label="Dokunma hassasiyeti" value={prefs.sensitivity}
        oninput={(e) => edit.setPrefs({ sensitivity: Number(e.currentTarget.value) })} />
    </label>
    <p class="hint">Düşük: avuç ve kısa dokunuşlar daha çok yok sayılır.</p>
    <label class="item"><input type="checkbox" checked={prefs.shapeHold} onchange={(e) => edit.setPrefs({ shapeHold: e.currentTarget.checked })} />
      <span>Şekil düzelt<small>Çizginin sonunda kalemi bir an tutun</small></span></label>
    <label class="item"><input type="checkbox" checked={prefs.shapeAuto} onchange={(e) => edit.setPrefs({ shapeAuto: e.currentTarget.checked })} />
      <span>Otomatik düzelt<small>Çok düzgün şekiller tutmadan düzelir</small></span></label>
  {/snippet}
</MenuButton>
<MenuButton label="Web resmi" title="Panodan ya da bağlantıdan resim ekle">
  {#snippet icon()}<Globe size={18} />{/snippet}
  {#snippet children(close)}
    <button class="item" disabled={busy} onclick={() => { close(); void pasteHere(); }}><ClipboardPaste size={16} />Panodan yapıştır</button>
    <p class="hint">Tarayıcıdan bir resmi sayfaya sürükleyebilir ya da Ctrl+V ile yapıştırabilirsiniz.</p>
    <form class="link" onsubmit={(e) => { e.preventDefault(); void fromLink(close); }}>
      <input type="url" inputmode="url" placeholder="https://…/resim.png" aria-label="Resim bağlantısı" bind:value={url} />
      <button class="item" type="submit" disabled={busy || !url.trim()}>Bağlantıdan resim ekle</button>
    </form>
  {/snippet}
</MenuButton>
{#if sel}
  <span class="sep" aria-hidden="true"></span>
  <ToolButton label="Kopyala" title="Seçimi kopyala (Ctrl+C)" onclick={() => edit.copy()}><Copy size={18} /></ToolButton>
  <ToolButton label="Yapıştır" title="Kopyalananı yapıştır (Ctrl+V)" disabled={!edit.clipReady} onclick={() => run(() => edit.paste(current))}>
    <ClipboardPaste size={18} />
  </ToolButton>
  <ToolButton label="Seçimi sil" title="Seçimi sil (Delete)" onclick={() => edit.remove()}><Trash2 size={18} /></ToolButton>
  {#if sel.strokes.length}
    <div class="swatches" role="group" aria-label="Seçimin rengi">
      {#each INK_KINDS.pen.colors.slice(0, 6) as c (c.color)}
        <button class="swatch" aria-label="Seçim rengi: {c.name}" title={c.name} onclick={() => edit.recolor(c.color)}><span style:background={c.color}></span></button>
      {/each}
    </div>
  {/if}
{/if}

{#if edit.lastShape}
  <div class="toast" role="status">
    <span>{edit.lastShape.name} düzeltildi</span>
    <button onclick={() => edit.undo()}>Geri al</button>
  </div>
{/if}
{#if edit.pasteMenu}
  {@const m = edit.pasteMenu}
  <div class="paste-menu" role="menu" style:left="{m.x}px" style:top="{m.y}px">
    <button role="menuitem" onclick={() => { edit.pasteMenu = null; void pasteHere(m.page, m.at); }}><ClipboardPaste size={16} />Yapıştır</button>
  </div>
{/if}

<style>
  .item small { display: block; color: var(--text-2); font-size: 11px; }
  .item span { display: flex; flex-direction: column; }
  .slider { flex-wrap: wrap; }
  .slider input { width: 100%; height: var(--hit); accent-color: var(--accent); }
  .link { display: flex; flex-direction: column; gap: 4px; padding: 4px 6px; }
  .link input { min-height: var(--hit); padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); font: inherit; }
  .sep { width: 1px; height: 24px; background: var(--border); margin: 0 6px; }
  .swatches { display: flex; flex-wrap: wrap; align-items: center; }
  .swatch { width: var(--hit); height: var(--hit); border: 0; background: transparent; display: grid; place-items: center; cursor: pointer; }
  .swatch span { width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--border); }
  .toast {
    position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 50; display: flex; align-items: center; gap: 8px;
    padding: 4px 4px 4px 14px; border-radius: var(--radius); background: var(--surface); border: 1px solid var(--border);
    box-shadow: 0 8px 28px rgb(0 0 0 / 0.16); font-size: 13px;
  }
  .toast button, .paste-menu button {
    min-height: var(--hit); padding: 0 12px; border: 0; border-radius: var(--radius-sm); background: var(--accent-soft); color: var(--accent);
    font: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
  }
  .paste-menu {
    position: fixed; z-index: 50; transform: translate(-50%, calc(-100% - 12px)); padding: 4px; border-radius: var(--radius);
    background: var(--surface); border: 1px solid var(--border); box-shadow: 0 8px 28px rgb(0 0 0 / 0.16);
  }
</style>
