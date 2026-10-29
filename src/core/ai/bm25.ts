// BM25 ranking over chunks. Pure; build once per course, query many times.
import { terms, type Chunk } from "./text";

export interface Hit {
  chunk: Chunk;
  score: number;
}

export class Bm25 {
  private readonly tf: Map<string, number>[];
  private readonly df = new Map<string, number>();
  private readonly len: number[];
  private readonly avg: number;

  constructor(readonly chunks: Chunk[], private readonly k1 = 1.2, private readonly b = 0.75) {
    this.tf = chunks.map((c) => {
      const m = new Map<string, number>();
      for (const t of terms(`${c.title} ${c.text}`)) m.set(t, (m.get(t) ?? 0) + 1);
      for (const t of m.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return m;
    });
    this.len = this.tf.map((m) => [...m.values()].reduce((a, b) => a + b, 0));
    this.avg = this.len.reduce((a, b) => a + b, 0) / (this.len.length || 1) || 1;
  }

  idf(term: string): number {
    const n = this.chunks.length;
    const df = this.df.get(term) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  /** Top-k chunks with a positive score, best first. */
  search(query: string, k = 5): Hit[] {
    const q = [...new Set(terms(query))];
    if (!q.length) return [];
    const hits: Hit[] = [];
    this.tf.forEach((m, i) => {
      let score = 0;
      for (const t of q) {
        const f = m.get(t);
        if (!f) continue;
        score += (this.idf(t) * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * this.len[i]) / this.avg));
      }
      if (score > 0) hits.push({ chunk: this.chunks[i], score });
    });
    return hits.sort((a, b) => b.score - a.score).slice(0, k);
  }
}
