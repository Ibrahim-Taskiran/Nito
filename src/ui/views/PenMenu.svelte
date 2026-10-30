<script lang="ts">
  import { Highlighter, Pen, Pencil } from "@lucide/svelte";
  import { INK_KINDS, type InkKind } from "../../core/ink";
  import MenuButton from "../components/MenuButton.svelte";
  import ToolButton from "../components/ToolButton.svelte";
  import type { InkSize, Reader } from "../reader.svelte";

  /** "Kalem" group: opening it takes up the last pen (black ballpoint at first); the panel picks kind, colour and width. */
  let { reader }: { reader: Reader } = $props();

  const KINDS = [
    { kind: "pen", icon: Pen },
    { kind: "pencil", icon: Pencil },
    { kind: "highlighter", icon: Highlighter },
  ] as const;

  const on = $derived(reader.inkTool === reader.inkKind);
  const info = $derived(INK_KINDS[reader.inkKind]);
  const colorName = $derived(info.colors.find((c) => c.color === reader.inkColor)?.name ?? "Özel renk");
  const Icon = $derived(KINDS.find((k) => k.kind === reader.inkKind)!.icon);

  function pick(kind: InkKind) {
    if (reader.inkTool !== kind) reader.setTool(kind);
  }

  function putDown(close: () => void) {
    if (on) reader.setTool(reader.inkKind);
    close();
  }
</script>

<MenuButton label="Kalem" title="{info.name} · {colorName}" pressed={on} onopen={() => on || reader.setTool(reader.inkKind)}>
  {#snippet icon()}<i class="ic" aria-hidden="true"><Icon size={18} /><b style:background={reader.inkColor}></b></i>{/snippet}
  {#snippet children(close)}
    <div class="kinds" role="group" aria-label="Kalem türü">
      {#each KINDS as k (k.kind)}
        <ToolButton label={INK_KINDS[k.kind].name} pressed={reader.inkTool === k.kind} onclick={() => pick(k.kind)}><k.icon size={18} /></ToolButton>
      {/each}
    </div>
    <div class="swatches" role="group" aria-label="{info.name} rengi">
      {#each info.colors as c (c.color)}
        <button class="swatch" aria-label="Renk: {c.name}" title={c.name} aria-pressed={reader.inkColor === c.color}
          onclick={() => reader.setInkColor(c.color)}><span style:background={c.color}></span></button>
      {/each}
      <label class="swatch custom" title="Özel renk">
        <span></span>
        <input type="color" aria-label="Özel renk" value={reader.inkColor} oninput={(e) => reader.setInkColor(e.currentTarget.value)} />
      </label>
    </div>
    <label class="item width">
      <span>Kalınlık</span>
      <input class="range" type="range" min="0" max="2" step="1" aria-label="Kalınlık" value={reader.inkSizes[reader.inkKind]}
        oninput={(e) => reader.setInkSize(Number(e.currentTarget.value) as InkSize)} />
    </label>
    <button class="item" disabled={!on} onclick={() => putDown(close)}>Kalemi bırak</button>
  {/snippet}
</MenuButton>

<style>
  .ic { position: relative; display: inline-grid; place-items: center; font-style: normal; }
  .ic b { position: absolute; right: -3px; bottom: -3px; width: 9px; height: 9px; border-radius: 50%; box-shadow: 0 0 0 1.5px var(--surface); }
  .kinds { display: flex; gap: 2px; padding: 2px 2px 4px; border-bottom: 1px solid var(--border); margin-bottom: 4px; }
  .swatches { display: grid; grid-template-columns: repeat(6, var(--hit)); justify-content: start; padding: 0 2px; }
  .swatch {
    width: var(--hit); height: var(--hit); display: grid; place-items: center; border: 0; border-radius: 50%;
    background: transparent; cursor: pointer; position: relative; padding: 0; touch-action: manipulation;
  }
  .swatch span { width: 24px; height: 24px; border-radius: 50%; box-shadow: 0 0 0 1px var(--border); }
  .swatch[aria-pressed="true"] span { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent-strong); }
  .swatch.custom span { background: conic-gradient(#e74c3c, #f1c40f, #2ecc71, #1abc9c, #3498db, #9b59b6, #e74c3c); }
  .swatch.custom input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
  .width { color: var(--text-2); }
  .width .range { flex: 1; width: auto; height: var(--hit); }
</style>
