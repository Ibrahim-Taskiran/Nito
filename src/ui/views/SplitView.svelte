<script lang="ts">
  import type { Document } from "../../core/types";
  import type { Library } from "../library.svelte";
  let { lib, docs }: { lib: Library; docs: [Document, Document] } = $props();
</script>

<!-- Placeholder; filled in Phase 2D. -->
<main class="placeholder">
  <p>{docs[0].title} · {docs[1].title}</p>
  <button onclick={() => (lib.split = null)}>Kapat</button>
</main>
