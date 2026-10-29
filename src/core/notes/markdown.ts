// Tiny, safe Markdown renderer for notes: headings, lists, quotes, rules, bold/italic/code, links.
// All text is HTML-escaped; only http(s), mailto and nito:// links survive.

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** Backslash-escapes characters that would start inline Markdown. */
export const escapeMd = (s: string): string => s.replace(/[\\`*_[\]]/g, "\\$&");

const ANNOTATION_LINK = /^nito:\/\/annotation\/(\d+)$/;

export const annotationLink = (id: number): string => `nito://annotation/${id}`;

/** "nito://annotation/12" -> 12, anything else -> null. */
export function parseAnnotationLink(href: string): number | null {
  const m = href.match(ANNOTATION_LINK);
  return m ? Number(m[1]) : null;
}

function link(text: string, url: string): string {
  const label = inline(text);
  const id = parseAnnotationLink(url);
  if (id !== null) return `<a href="${escapeHtml(url)}" data-annotation="${id}">${label}</a>`;
  if (/^(https?:|mailto:)/i.test(url)) return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  return label;
}

/** Inline Markdown -> HTML. */
export function inline(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const rest = src.slice(i);
    if (c === "\\" && i + 1 < src.length && /[\\`*_[\]()#>!-]/.test(src[i + 1])) {
      out += escapeHtml(src[i + 1]);
      i += 2;
      continue;
    }
    if (c === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i) {
        out += `<code>${escapeHtml(src.slice(i + 1, end))}</code>`;
        i = end + 1;
        continue;
      }
    }
    if (c === "[") {
      const m = rest.match(/^\[((?:\\.|[^\]\\])*)\]\(([^)\s]*)\)/);
      if (m) {
        out += link(m[1], m[2]);
        i += m[0].length;
        continue;
      }
    }
    if (c === "*" || c === "_") {
      const mark = rest.startsWith(c + c) ? c + c : c;
      const end = findClose(src, i + mark.length, mark);
      if (end > i + mark.length) {
        const tag = mark.length === 2 ? "strong" : "em";
        out += `<${tag}>${inline(src.slice(i + mark.length, end))}</${tag}>`;
        i = end + mark.length;
        continue;
      }
    }
    out += escapeHtml(c);
    i++;
  }
  return out;
}

/** Index of the closing mark, skipping backslash escapes; -1 when missing. */
function findClose(src: string, from: number, mark: string): number {
  for (let j = from; j < src.length; j++) {
    if (src[j] === "\\") j++;
    else if (src.startsWith(mark, j) && (mark.length === 2 || src[j + 1] !== mark)) return j;
  }
  return -1;
}

/** Block Markdown -> HTML. */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  const take = (re: RegExp): string[] => {
    const got: string[] = [];
    while (i < lines.length && re.test(lines[i])) got.push(lines[i++].replace(re, ""));
    return got;
  };
  while (i < lines.length) {
    const line = lines[i];
    let m: RegExpMatchArray | null;
    if (!line.trim()) {
      i++;
    } else if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      out.push(`<h${m[1].length}>${inline(m[2].trim())}</h${m[1].length}>`);
      i++;
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push("<hr>");
      i++;
    } else if (/^>/.test(line)) {
      out.push(`<blockquote>${take(/^> ?/).map(inline).join("<br>")}</blockquote>`);
    } else if (/^\s*[-*+]\s+/.test(line)) {
      out.push(`<ul>${take(/^\s*[-*+]\s+/).map((t) => `<li>${inline(t)}</li>`).join("")}</ul>`);
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      out.push(`<ol>${take(/^\s*\d+[.)]\s+/).map((t) => `<li>${inline(t)}</li>`).join("")}</ol>`);
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i])) para.push(lines[i++].trim());
      out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    }
  }
  return out.join("\n");
}
