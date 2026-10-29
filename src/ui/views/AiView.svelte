<script lang="ts">
  import type { Library } from "../library.svelte";
  let { lib }: { lib: Library } = $props();
</script>

<!-- Placeholder; filled in Phase 2. -->
<main class="placeholder" data-count={lib.counts.all}>
  <h1>Yapay zekâ</h1>
  <p>Yakında.</p>
</main>

<style>
  .placeholder { flex: 1; padding: 24px; }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
  p { color: var(--text-2); }
</style>
