<script lang="ts">
  import { AlarmClock, Pause, Play, RotateCcw, Timer, X } from "@lucide/svelte";
  import { formatClock, parseMinutes } from "../../core/timer";
  import ToolButton from "../components/ToolButton.svelte";
  import { studyTimer as t } from "../timer.svelte";

  const PRESETS = [5, 10, 25, 45, 60];
  let open = $state(false);
  let tab = $state<"watch" | "alarm">("watch");
  let custom = $state("");
  let root = $state<HTMLElement>();

  const label = $derived(
    t.alarmRunning ? formatClock(t.alarmMs) : t.watchRunning || t.watchMs ? formatClock(t.watchMs) : "Süre",
  );
  const customMinutes = $derived(parseMinutes(custom));

  function onDocDown(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
</script>

<svelte:document onpointerdown={onDocDown} />

<div class="timer" bind:this={root}>
  <ToolButton {label} title="Kronometre ve alarm" pressed={open || t.watchRunning || t.alarmRunning} onclick={() => (open = !open)}>
    {#if t.alarmRunning}<AlarmClock size={18} />{:else}<Timer size={18} />{/if}
  </ToolButton>

  {#if open}
    <div class="panel" role="dialog" aria-label="Kronometre ve alarm">
      <div class="head">
        <div class="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "watch"} onclick={() => (tab = "watch")}>Kronometre</button>
          <button role="tab" aria-selected={tab === "alarm"} onclick={() => (tab = "alarm")}>Alarm</button>
        </div>
        <button class="icon" aria-label="Kapat" onclick={() => (open = false)}><X size={18} /></button>
      </div>

      {#if tab === "watch"}
        <output class="big" aria-label="Geçen süre">{formatClock(t.watchMs)}</output>
        <div class="row">
          <button class="main" onclick={() => t.toggleWatch()}>
            {#if t.watchRunning}<Pause size={18} /> Duraklat{:else}<Play size={18} /> {t.watchMs ? "Sürdür" : "Başlat"}{/if}
          </button>
          <button class="ghost" disabled={!t.watchMs} onclick={() => t.resetWatch()}><RotateCcw size={18} /> Sıfırla</button>
        </div>
        <p class="hint">Uygulama kapanana ya da durdurana kadar sayar; okuyucuyu kapatsan da devam eder.</p>
      {:else if t.alarm}
        <output class="big" aria-label="Kalan süre">{formatClock(t.alarmMs)}</output>
        <div class="row">
          <button class="main" onclick={() => t.toggleAlarm()}>
            {#if t.alarmRunning}<Pause size={18} /> Duraklat{:else}<Play size={18} /> Sürdür{/if}
          </button>
          <button class="ghost" onclick={() => t.cancelAlarm()}><X size={18} /> İptal</button>
        </div>
      {:else}
        <p class="hint">Kaç dakika sonra çalsın?</p>
        <div class="chips">
          {#each PRESETS as m (m)}
            <button class="chip" onclick={() => t.startAlarm(m)}>{m} dk</button>
          {/each}
        </div>
        <div class="row">
          <input type="text" inputmode="decimal" placeholder="Dakika" aria-label="Dakika" bind:value={custom}
            onkeydown={(e) => e.key === "Enter" && customMinutes && t.startAlarm(customMinutes)} />
          <button class="main" disabled={!customMinutes} onclick={() => customMinutes && t.startAlarm(customMinutes)}>
            <AlarmClock size={18} /> Kur
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .timer { position: relative; flex: none; }
  .timer :global(.tool span) { font-variant-numeric: tabular-nums; }
  .panel {
    position: absolute; top: calc(100% + 6px); right: 0; z-index: 30; width: 320px; display: grid; gap: 14px; padding: 16px;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-3);
  }
  .head { display: flex; align-items: center; gap: 8px; }
  .tabs { display: flex; flex: 1; background: var(--surface-3); border-radius: var(--radius-sm); padding: 4px; }
  .tabs button {
    flex: 1; min-height: 36px; border: 0; border-radius: 8px; background: transparent; color: var(--text-2); cursor: pointer;
    font: 600 13px/1 var(--font-label);
  }
  .tabs button[aria-selected="true"] { background: var(--surface); color: var(--accent-strong); box-shadow: var(--shadow-1); }
  .icon {
    width: var(--hit); height: var(--hit); flex: none; display: grid; place-items: center; border: 0; border-radius: 8px;
    background: transparent; color: var(--text-2); cursor: pointer;
  }
  .big { font-size: 44px; font-weight: 700; letter-spacing: -0.02em; text-align: center; font-variant-numeric: tabular-nums; line-height: 1.2; }
  .row { display: flex; gap: 8px; }
  .row > * { flex: 1; }
  .main, .ghost, .chip {
    min-height: var(--hit); display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 12px;
    border-radius: var(--radius-sm); cursor: pointer; font: 600 14px/1 var(--font-label); touch-action: manipulation;
  }
  .main { border: 0; background: var(--accent-strong); color: var(--on-accent); }
  .ghost, .chip { border: 1px solid var(--border); background: var(--surface); color: var(--text); }
  .main:disabled, .ghost:disabled { opacity: 0.45; cursor: default; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { flex: 1 0 calc(33% - 8px); }
  input {
    min-height: var(--hit); min-width: 0; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface-2); color: var(--text); font: inherit;
  }
  .hint { margin: 0; color: var(--text-2); font-size: 13px; }
  @media (max-width: 600px) {
    .panel {
      position: fixed; top: auto; left: 0; right: 0; bottom: 0; width: auto; border-radius: 16px 16px 0 0;
      padding: 16px 16px max(16px, env(safe-area-inset-bottom));
    }
  }
</style>
