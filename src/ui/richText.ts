// Markdown-light to HTML for text boxes and sticky notes. KaTeX and highlight.js are imported only when a
// text uses math or a code block, so the reader bundle stays small.
import { renderMarkdown, richNeeds, type RichHooks } from "../core/markdown";

type Katex = typeof import("katex").default;
type Hljs = typeof import("highlight.js/lib/core").default;

let katex: Promise<Katex> | null = null;
let hljs: Promise<Hljs> | null = null;

function loadKatex(): Promise<Katex> {
  katex ??= Promise.all([import("katex"), import("katex/dist/katex.min.css")]).then(([m]) => m.default);
  return katex;
}

/** highlight.js core with a few languages students meet most. */
function loadHljs(): Promise<Hljs> {
  hljs ??= (async () => {
    const [core, ...langs] = await Promise.all([
      import("highlight.js/lib/core"),
      import("highlight.js/lib/languages/python"),
      import("highlight.js/lib/languages/java"),
      import("highlight.js/lib/languages/cpp"),
      import("highlight.js/lib/languages/c"),
      import("highlight.js/lib/languages/csharp"),
      import("highlight.js/lib/languages/javascript"),
      import("highlight.js/lib/languages/sql"),
      import("highlight.js/lib/languages/bash"),
    ]);
    const h = core.default;
    const names = ["python", "java", "cpp", "c", "csharp", "javascript", "sql", "bash"];
    langs.forEach((l, i) => h.registerLanguage(names[i], l.default));
    return h;
  })();
  return hljs;
}

/** Fast first paint: escaped text, math and code shown plainly. */
export const renderPlain = (src: string): string => renderMarkdown(src);

/** Full render with KaTeX and highlight.js (loaded on first use). */
export async function renderRich(src: string): Promise<string> {
  const need = richNeeds(src);
  if (!need.math && !need.code) return renderMarkdown(src);
  const [k, h] = await Promise.all([need.math ? loadKatex() : null, need.code ? loadHljs() : null]);
  const hooks: RichHooks = {};
  if (k) {
    hooks.math = (tex, display) =>
      // trust: false keeps \href, \url and HTML extensions off; errors show red source instead of throwing.
      k.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, strict: "ignore", maxSize: 20, maxExpand: 500 });
  }
  if (h) {
    hooks.code = (code, lang) => {
      if (lang && h.getLanguage(lang)) return h.highlight(code, { language: lang, ignoreIllegals: true }).value;
      if (!lang) return h.highlightAuto(code).value;
      return null;
    };
  }
  return renderMarkdown(src, hooks);
}
