<script lang="ts">
  import { FileText } from "@lucide/svelte";
  import type { Document } from "../../../core/types";
  import type { Storage } from "../../../platform/types";
  import { thumbnail } from "../../thumbs";

  /** First-page cover; rendered only once it scrolls into view. */
  let { storage, doc }: { storage: Storage; doc: Document } = $props();
  let el: HTMLDivElement;
  let src = $state<string | null>(null);
  let failed = $state(false);

  $effect(() => {
    const d = doc;
    let alive = true;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      thumbnail(storage, d).then((u) => {
        if (!alive) return;
        src = u;
        failed = !u;
      });
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
    };
  });
</script>

<div class="cover" bind:this={el}>
  {#if src}
    <img {src} alt="" draggable="false" />
  {:else}
    <span class="ph" class:failed><FileText size={28} strokeWidth={1.5} /></span>
  {/if}
</div>

<style>
  .cover {
    aspect-ratio: 3 / 4; width: 100%; overflow: hidden; border-radius: var(--radius-sm);
    background: var(--surface-2); display: grid; place-items: center; border: 1px solid var(--border);
  }
  img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
  .ph { color: var(--text-2); opacity: 0.6; }
  .ph:not(.failed) { animation: pulse 1.6s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.3; } }
  @media (prefers-reduced-motion: reduce) { .ph:not(.failed) { animation: none; } }
</style>
