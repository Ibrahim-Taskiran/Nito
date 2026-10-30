<script lang="ts">
  /** Circular progress with the percentage in the middle. */
  let { ratio, size = 64 }: { ratio: number; size?: number } = $props();
</script>

<span class="ring" style:width="{size}px" style:height="{size}px">
  <svg viewBox="0 0 36 36" aria-hidden="true">
    <circle cx="18" cy="18" r="15.5" class="track" />
    {#if ratio > 0}<circle cx="18" cy="18" r="15.5" class="val" stroke-dasharray="{Math.min(1, ratio) * 97.4} 97.4" />{/if}
  </svg>
  <span class="pct">%{Math.round(ratio * 100)}</span>
</span>

<style>
  .ring { position: relative; flex: none; display: grid; place-items: center; }
  svg { position: absolute; inset: 0; transform: rotate(-90deg); }
  circle { fill: none; stroke-width: 3.4; }
  .track { stroke: var(--surface-3); }
  .val { stroke: var(--accent-strong); stroke-linecap: round; }
  .pct { font: 700 14px/1 var(--font-label); font-variant-numeric: tabular-nums; }
</style>
