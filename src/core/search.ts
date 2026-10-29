// Text search across PDF pages. Case- and accent-insensitive, Turkish aware (I, ı, İ, i all match).

export interface SearchHit {
  page: number;
  /** Character offset in that page's text. */
  index: number;
}

/** One UTF-16 unit in, one out, so offsets in the folded text are offsets in the original. */
function foldUnit(c: string): string {
  if (/\s/.test(c)) return " ";
  const l = c.toLocaleLowerCase("tr");
  if (l.length !== 1) return c;
  if (l === "ı") return "i";
  return l.normalize("NFD")[0] ?? l;
}

export function fold(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) out += foldUnit(text[i]);
  return out;
}

/** Folded query with whitespace runs collapsed; empty when there is nothing to look for. */
export const foldQuery = (q: string): string => fold(q.trim()).replace(/ +/g, " ");

function offsets(folded: string, q: string): number[] {
  const out: number[] = [];
  for (let at = folded.indexOf(q); at >= 0; at = folded.indexOf(q, at + q.length)) out.push(at);
  return out;
}

/** Every occurrence of `query` in each page text (pages are 1-based), in reading order. */
export function findHits(pages: readonly string[], query: string): SearchHit[] {
  const q = foldQuery(query);
  if (!q) return [];
  return pages.flatMap((text, i) => offsets(fold(text), q).map((index) => ({ page: i + 1, index })));
}

/** Hit counts per page, for the page list. */
export function hitsPerPage(hits: readonly SearchHit[]): { page: number; count: number }[] {
  const m = new Map<number, number>();
  for (const h of hits) m.set(h.page, (m.get(h.page) ?? 0) + 1);
  return [...m].map(([page, count]) => ({ page, count }));
}

/** Index of the first hit on or after `page`, so a new search starts where the reader is. */
export function firstHitFrom(hits: readonly SearchHit[], page: number): number {
  const i = hits.findIndex((h) => h.page >= page);
  return i < 0 ? 0 : i;
}

/** Offsets of the query inside one short string (a text-layer span), for on-page highlights. */
export function matchesIn(text: string, query: string): number[] {
  const q = foldQuery(query);
  return q ? offsets(fold(text), q) : [];
}
