// Markdown-light for text boxes and sticky notes: paragraphs, # headings, - / 1. lists, **bold**, *italic*,
// `code`, $inline$ and $$display$$ LaTeX, ``` fenced code. Everything is HTML-escaped; only the math and code
// hooks may return markup (KaTeX and highlight.js output, which escape their own input).

export interface RichHooks {
  /** LaTeX to HTML. Missing: the source is shown as escaped code. */
  math?: (tex: string, display: boolean) => string;
  /** Code to highlighted HTML (already escaped). Missing or null: plain escaped code. */
  code?: (code: string, lang: string) => string | null;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Only letters, digits and a few signs, so a language name is safe in a class attribute. */
const safeLang = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9+#_-]/g, "").slice(0, 20);

/** What a text needs, so the UI loads KaTeX / highlight.js only when used. */
export function richNeeds(src: string): { math: boolean; code: boolean } {
  return { math: /\$[^$\n]|\$\$/.test(src.replace(/\\\$/g, "")), code: /^\s*```/m.test(src) };
}

function mathHtml(tex: string, display: boolean, hooks: RichHooks): string {
  if (hooks.math) return hooks.math(tex, display);
  return `<code class="math">${escapeHtml(tex)}</code>`;
}

/** Bold and italic on already-escaped text (only fixed tags are added). */
function emphasis(s: string): string {
  return s
    .replace(/\*\*(?=\S)(.+?\S)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?![*\w])/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?![_\w])/g, "$1<em>$2</em>");
}

/** One line of inline text: code spans and math first (kept verbatim), then emphasis on the rest. */
export function inline(src: string, hooks: RichHooks = {}): string {
  const re = /(`+)([\s\S]*?[^`])\1(?!`)|\$\$([^$]+?)\$\$|(?<![\\\w])\$(?=[^\s$])([^$\n]*?[^\s\\$])\$(?!\w)/g;
  let out = "";
  let last = 0;
  for (const m of src.matchAll(re)) {
    out += emphasis(escapeHtml(src.slice(last, m.index).replace(/\\\$/g, "$")));
    if (m[1]) out += `<code>${escapeHtml(m[2].trim() || m[2])}</code>`;
    else if (m[3] !== undefined) out += mathHtml(m[3], true, hooks);
    else out += mathHtml(m[4], false, hooks);
    last = m.index + m[0].length;
  }
  return out + emphasis(escapeHtml(src.slice(last).replace(/\\\$/g, "$")));
}

/** Whole text to HTML. */
export function renderMarkdown(src: string, hooks: RichHooks = {}): string {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map((l) => inline(l, hooks)).join("<br>")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i, hooks)}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  const flush = () => {
    flushPara();
    flushList();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*(`{3,}|~{3,})\s*([^`\s]*)\s*$/.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      const close = new RegExp(`^\\s*${fence[1][0] === "`" ? "`" : "~"}{${fence[1].length},}\\s*$`);
      while (++i < lines.length && !close.test(lines[i])) body.push(lines[i]);
      const code = body.join("\n");
      const lang = safeLang(fence[2]);
      const html = hooks.code?.(code, lang) ?? escapeHtml(code);
      out.push(`<pre><code class="hljs${lang ? ` language-${lang}` : ""}">${html}</code></pre>`);
      continue;
    }
    const mathOpen = /^\s*\$\$(.*)$/.exec(line);
    if (mathOpen) {
      // $$ … $$ on one line, or across lines until a line ending in $$.
      const rest = mathOpen[1];
      const oneLine = /^(.*?)\$\$\s*$/.exec(rest);
      if (oneLine && oneLine[1].trim()) {
        flush();
        out.push(`<div class="math-block">${mathHtml(oneLine[1], true, hooks)}</div>`);
        continue;
      }
      if (!oneLine) {
        const body = [rest];
        let j = i;
        while (++j < lines.length && !/\$\$\s*$/.test(lines[j])) body.push(lines[j]);
        if (j < lines.length) {
          flush();
          body.push(lines[j].replace(/\$\$\s*$/, ""));
          out.push(`<div class="math-block">${mathHtml(body.join("\n").trim(), true, hooks)}</div>`);
          i = j;
          continue;
        }
      }
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const n = heading[1].length + 2; // # -> h3: notes are small, page headings would shout
      out.push(`<h${n}>${inline(heading[2], hooks)}</h${n}>`);
      continue;
    }
    const item = /^\s*(?:([-*+])|(\d{1,3})[.)])\s+(.*)$/.exec(line);
    if (item) {
      flushPara();
      const tag = item[1] ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push(item[3]);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    flushList();
    para.push(line);
  }
  flush();
  return out.join("");
}
