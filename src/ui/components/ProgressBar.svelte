<script lang="ts">
  let { value, max }: { value: number; max: number } = $props();
</script>

<div class="track" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
  <div class="fill" style:width="{max ? (value / max) * 100 : 0}%"></div>
</div>

<style>
  .track { height: 6px; border-radius: var(--pill); background: var(--surface-3); overflow: hidden; }
  .fill { height: 100%; border-radius: inherit; background: var(--accent-strong); transition: width 0.15s; }
</style>
