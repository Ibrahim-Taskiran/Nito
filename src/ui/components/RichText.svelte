<script lang="ts">
  import { renderPlain, renderRich } from "../richText";

  /** Markdown-light text. The HTML is escaped by core/markdown; only KaTeX and highlight.js add markup. */
  let { src }: { src: string } = $props();

  let html = $state("");

  $effect(() => {
    const s = src;
    html = renderPlain(s);
    let live = true;
    renderRich(s).then((h) => live && (html = h)).catch((e) => console.warn("Not biçimlenemedi:", e));
    return () => (live = false);
  });
</script>

<div class="rich">{@html html}</div>

<style>
  .rich { font-size: 13px; line-height: 1.45; color: inherit; overflow-wrap: anywhere; }
  .rich :global(p), .rich :global(ul), .rich :global(ol), .rich :global(pre) { margin: 0 0 6px; }
  .rich :global(:last-child) { margin-bottom: 0; }
  .rich :global(ul), .rich :global(ol) { padding-left: 18px; }
  .rich :global(h3), .rich :global(h4), .rich :global(h5) { margin: 0 0 4px; font-size: 14px; }
  .rich :global(code) { font: 12px/1.4 ui-monospace, "Cascadia Mono", Consolas, monospace; }
  .rich :global(:not(pre) > code) { background: rgb(0 0 0 / 0.06); padding: 0 3px; border-radius: 4px; }
  .rich :global(pre) { background: #f5f6f8; color: #24292f; padding: 6px 8px; border-radius: 6px; overflow: auto; }
  .rich :global(.math-block) { overflow-x: auto; overflow-y: hidden; margin: 0 0 6px; }
  .rich :global(.katex-display) { margin: 2px 0; }
  /* highlight.js tokens: a quiet light theme (notes sit on white paper). */
  .rich :global(.hljs-keyword), .rich :global(.hljs-built_in), .rich :global(.hljs-type) { color: #8a3ab9; }
  .rich :global(.hljs-string), .rich :global(.hljs-regexp) { color: #1e7a3c; }
  .rich :global(.hljs-number), .rich :global(.hljs-literal) { color: #b35900; }
  .rich :global(.hljs-comment) { color: #6e7781; font-style: italic; }
  .rich :global(.hljs-title), .rich :global(.hljs-function) { color: #2f5fa5; }
  .rich :global(.hljs-meta), .rich :global(.hljs-attr), .rich :global(.hljs-variable) { color: #9a4a00; }
</style>
