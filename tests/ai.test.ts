import { describe, expect, it } from "vitest";
import { Bm25 } from "../src/core/ai/bm25";
import { buildCorpus } from "../src/core/ai/corpus";
import { chat, isResearchOnly, listModels, OllamaDown, pickModel, type Fetch } from "../src/core/ai/ollama";
import { chatPrompt, cleanAnswer, emphasis, parseCitations, resolveCitation, summaryPrompt } from "../src/core/ai/prompts";
import { chunkPages, fitPages, splitText, stem, tokenize, type Chunk } from "../src/core/ai/text";
import type { Document } from "../src/core/types";

describe("tokenize", () => {
  it("lowercases with Turkish rules and drops punctuation and stopwords", () => {
    expect(tokenize("İSTANBUL ve IĞDIR, Ağ katmanı!")).toEqual(["istanbul", "ığdır", "ağ", "katmanı"]);
    expect(tokenize("Bu bir TCP/IP örneği.")).toEqual(["tcp", "ıp", "örneği"]);
  });
  it("stems to the first five letters, keeps numbers", () => {
    expect(stem("katmanları")).toBe("katma");
    expect(stem("2026")).toBe("2026");
  });
});

describe("chunking", () => {
  it("keeps short text whole and splits long text with overlap at spaces", () => {
    expect(splitText("  kısa   metin ")).toEqual(["kısa metin"]);
    const words = Array.from({ length: 400 }, (_, i) => `kelime${i}`).join(" ");
    const parts = splitText(words, 800, 150);
    expect(parts.length).toBeGreaterThan(3);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(800);
    for (const p of parts) expect(p.split(" ").every((w) => /^kelime\d+$/.test(w))).toBe(true);
    // overlap: the last word of a chunk appears again in the next one
    const lastWord = parts[0].split(" ").at(-1)!;
    expect(parts[1].split(" ")).toContain(lastWord);
  });
  it("keeps page numbers and never crosses pages", () => {
    const c = chunkPages(7, "Ağlar", ["birinci sayfa", "", "üçüncü sayfa"]);
    expect(c.map((x) => [x.page, x.text])).toEqual([[1, "birinci sayfa"], [3, "üçüncü sayfa"]]);
    expect(c[0]).toMatchObject({ documentId: 7, title: "Ağlar", source: "pdf" });
  });
  it("fits pages into a budget with page labels", () => {
    const out = fitPages(["a".repeat(1000), "b".repeat(10), "c".repeat(1000)], 300);
    expect(out).toContain("[s. 2] bbbbbbbbbb");
    expect(out.replace(/\[s\. \d\] /g, "").replace(/\n/g, "").length).toBeLessThanOrEqual(300);
  });
});

const ch = (text: string, page = 1, title = "D"): Chunk => ({ documentId: 1, title, page, source: "pdf", text });

describe("bm25", () => {
  const idx = new Bm25([
    ch("TCP bağlantı yönelimli bir protokoldür, üçlü el sıkışma kullanır.", 1),
    ch("UDP bağlantısız çalışır ve başlığı küçüktür.", 2),
    ch("Fizik katmanı bitleri taşır.", 3),
  ]);
  it("ranks the matching chunk first and stems suffixes", () => {
    expect(idx.search("TCP el sıkışması nedir?")[0].chunk.page).toBe(1);
    expect(idx.search("UDP başlıkları")[0].chunk.page).toBe(2);
    expect(idx.search("katmanlar")[0].chunk.page).toBe(3);
  });
  it("returns nothing for unknown or stopword-only queries", () => {
    expect(idx.search("kuantum")).toEqual([]);
    expect(idx.search("ve ile bu")).toEqual([]);
  });
  it("rarer terms weigh more", () => {
    const i2 = new Bm25([ch("ağ ağ ağ"), ch("ağ yönlendirici"), ch("ağ")]);
    expect(i2.idf("yönle")).toBeGreaterThan(i2.idf("ağ"));
    expect(i2.search("ağ yönlendirici")[0].chunk.text).toBe("ağ yönlendirici");
  });
});

describe("corpus", () => {
  it("joins pages, highlights with comments and plain-text notes", () => {
    const doc = { id: 3, title: "Hafta 3" } as Document;
    const chunks = buildCorpus({
      docs: [{ doc, pages: ["sayfa bir"], annotations: [{ page: 1, text: "vurgu", comment: "önemli" } as never] }],
      notes: [{ documentId: 3, title: "", body: "<p>Not &amp; metni</p>" } as never],
    });
    expect(chunks.map((c) => [c.source, c.page, c.text])).toEqual([
      ["pdf", 1, "sayfa bir"],
      ["highlight", 1, "vurgu — Yorum: önemli"],
      ["note", null, "Not & metni"],
    ]);
    expect(chunks[2].title).toBe("Hafta 3");
  });
});

describe("prompts", () => {
  it("summary prompt carries title and labelled pages", () => {
    const m = summaryPrompt("Ağlar", ["giriş", "son"]);
    expect(m[0].role).toBe("system");
    expect(m[1].content).toContain("Belge: Ağlar");
    expect(m[1].content).toContain("[s. 2] son");
  });
  it("chat prompt lists sources with pages and ends with the question", () => {
    const hits = [{ chunk: ch("TCP metni", 4, "Hafta 3"), score: 2 }];
    const m = chatPrompt("TCP nedir?", hits, [{ role: "user", content: "eski" }]);
    expect(m[0].content).toContain("(1) Hafta 3, s. 4\nTCP metni");
    expect(m[0].content).toContain("[s. N]");
    expect(m.at(-1)).toEqual({ role: "user", content: "TCP nedir?" });
    expect(m).toHaveLength(3);
  });
  it("parses citations in several spellings", () => {
    expect(parseCitations("TCP güvenilir [s. 4]. UDP değil [S.2, 3]")).toEqual([
      { text: "TCP güvenilir " }, { page: 4, label: "s. 4" }, { text: ". UDP değil " },
      { page: 2, label: "s. 2" }, { page: 3, label: "s. 3" },
    ]);
    expect(parseCitations("kaynak yok [1]")).toEqual([{ text: "kaynak yok [1]" }]);
    expect(parseCitations("el sıkışma [Hafta 5: Tasima, s. 1].")).toEqual([
      { text: "el sıkışma " }, { page: 1, label: "s. 1", title: "Hafta 5: Tasima" }, { text: "." },
    ]);
  });
  it("resolves a citation to the retrieved chunk", () => {
    const hits = [{ chunk: ch("x", 4, "A"), score: 1 }, { chunk: ch("y", 4, "B"), score: 0.5 }];
    expect(resolveCitation(4, hits)?.title).toBe("A");
    expect(resolveCitation(4, hits, "B")?.title).toBe("B");
    // two documents among the hits: an unretrieved page is ambiguous
    expect(resolveCitation(9, [{ chunk: { ...ch("x", 4, "A"), documentId: 1 }, score: 1 }, { chunk: { ...ch("y", 4, "B"), documentId: 2 }, score: 1 }])).toBeNull();
    // one document: open that document at the cited page
    expect(resolveCitation(9, hits)).toMatchObject({ title: "A", page: 9 });
    expect(resolveCitation(1, [])).toBeNull();
  });
});

const stream = (lines: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const all = new TextEncoder().encode(lines.join("\n"));
      // split mid-line to test buffering
      c.enqueue(all.slice(0, 7));
      c.enqueue(all.slice(7));
      c.close();
    },
  });

describe("ollama client", () => {
  it("lists models and picks a permissive default", async () => {
    const f: Fetch = async () => new Response(JSON.stringify({ models: [{ name: "qwen2.5:3b" }, { name: "llama3.2:3b" }] }));
    const models = await listModels(f);
    expect(models).toEqual(["llama3.2:3b", "qwen2.5:3b"]);
    expect(pickModel(models, null)).toBe("llama3.2:3b");
    expect(pickModel(models, "qwen2.5:3b")).toBe("qwen2.5:3b");
    expect(pickModel([...models, "qwen2.5:7b"], null)).toBe("qwen2.5:7b");
    expect(pickModel(["qwen2.5:3b"], null)).toBe("qwen2.5:3b");
    expect(pickModel([], null)).toBeNull();
    expect(isResearchOnly("qwen2.5:3b")).toBe(true);
    expect(isResearchOnly("qwen2.5:7b")).toBe(false);
  });
  it("reports Ollama down on network error", async () => {
    const f: Fetch = async () => { throw new TypeError("Failed to fetch"); };
    await expect(listModels(f)).rejects.toBeInstanceOf(OllamaDown);
    await expect(chat(f, { model: "m", messages: [] })).rejects.toBeInstanceOf(OllamaDown);
  });
  it("streams tokens from NDJSON", async () => {
    let sent: { stream: boolean; model: string } | null = null;
    const f: Fetch = async (_u, init) => {
      sent = JSON.parse(String(init?.body));
      return new Response(stream([
        JSON.stringify({ message: { content: "Mer" }, done: false }),
        JSON.stringify({ message: { content: "haba" }, done: false }),
        JSON.stringify({ message: { content: "" }, done: true }),
      ]));
    };
    const tokens: string[] = [];
    const out = await chat(f, { model: "m", messages: [{ role: "user", content: "selam" }], onToken: (t) => tokens.push(t) });
    expect(out).toBe("Merhaba");
    expect(tokens).toEqual(["Mer", "haba"]);
    expect(sent).toMatchObject({ stream: true, model: "m" });
  });
  it("surfaces model errors", async () => {
    const f: Fetch = async () => new Response(stream([JSON.stringify({ error: "model not found" })]));
    await expect(chat(f, { model: "x", messages: [] })).rejects.toThrow("model not found");
  });
});

describe("cleanAnswer", () => {
  it("drops a wrapping code fence, also mid-stream", () => {
    expect(cleanAnswer("```markdown\n## Özet\nmetin\n```")).toBe("## Özet\nmetin");
    expect(cleanAnswer("```markdown\n## Öz")).toBe("## Öz");
    expect(cleanAnswer("düz metin")).toBe("düz metin");
    expect(cleanAnswer("Başlık\n\n```markdown\n## x\n``` \n")).toBe("Başlık\n\n## x");
  });
});

describe("emphasis", () => {
  it("turns headings and **bold** into strong runs", () => {
    expect(emphasis("## Ana fikirler\n- **TCP**: güvenilir")).toEqual([
      { text: "Ana fikirler", strong: true }, { text: "\n- ", strong: false },
      { text: "TCP", strong: true }, { text: ": güvenilir", strong: false },
    ]);
  });
});
