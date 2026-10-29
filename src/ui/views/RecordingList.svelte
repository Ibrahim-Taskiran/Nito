<script lang="ts">
  import type { Reader } from "../reader.svelte";
  let { reader }: { reader: Reader } = $props();
</script>

<!-- Placeholder; recordings and transcripts of this document (Phase 2C). -->
<div hidden data-doc={reader.doc.id}></div>
