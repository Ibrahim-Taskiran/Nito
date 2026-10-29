// AI screen state: model choice, document summary and chat with course texts.
import { Bm25, type Hit } from "../core/ai/bm25";
import { buildCorpus } from "../core/ai/corpus";
import { isResearchOnly, OllamaDown, pickModel } from "../core/ai/ollama";
import { chatPrompt, cleanAnswer, resolveCitation, summaryPrompt, type ChatMessage } from "../core/ai/prompts";
import type { Document, Id } from "../core/types";
import { aiClient } from "./aiClient";
import type { Library } from "./library.svelte";
import { pageTexts } from "./pageText";

const MODEL_KEY = "nito.ai.model";
const TOP_K = 5;

export interface Turn {
  role: "user" | "assistant";
  content: string;
  /** Chunks the answer was built from; citations resolve against these. */
  hits?: Hit[];
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class Ai {
  status = $state<"checking" | "down" | "ready">("checking");
  models = $state<string[]>([]);
  model = $state<string | null>(null);
  /** null = all documents. */
  courseId = $state<Id | null>(null);
  docs = $state<Document[]>([]);
  summaryDocId = $state<Id | null>(null);
  summary = $state("");
  summarySaved = $state(false);
  turns = $state<Turn[]>([]);
  busy = $state<"summary" | "chat" | null>(null);
  /** What the busy task is doing right now (e.g. reading PDFs). */
  phase = $state("");
  error = $state<string | null>(null);

  researchOnly = $derived(this.model != null && isResearchOnly(this.model));
  private abort: AbortController | null = null;

  private static instances = new WeakMap<Library, Ai>();
  static for(lib: Library): Ai {
    let ai = Ai.instances.get(lib);
    if (!ai) Ai.instances.set(lib, (ai = new Ai(lib)));
    return ai;
  }

  private constructor(readonly lib: Library) {}

  /** First visit: find Ollama and load documents. Later visits: refresh documents, keep the chat. */
  async init(): Promise<void> {
    await Promise.all([this.status === "ready" ? null : this.checkOllama(), this.loadDocs()]);
  }

  private async loadDocs(): Promise<void> {
    const id = this.courseId;
    this.docs = await this.lib.repo.listDocuments(id == null ? { kind: "all" } : { kind: "course", courseId: id });
    if (!this.docs.some((d) => d.id === this.summaryDocId)) this.summaryDocId = this.docs[0]?.id ?? null;
  }

  async checkOllama(): Promise<void> {
    this.status = "checking";
    try {
      this.models = await aiClient.models();
      let saved: string | null = null;
      try { saved = localStorage.getItem(MODEL_KEY); } catch { /* storage off */ }
      this.model = pickModel(this.models, saved);
      this.status = "ready";
    } catch {
      this.status = "down";
    }
  }

  setModel(m: string): void {
    this.model = m;
    try { localStorage.setItem(MODEL_KEY, m); } catch { /* storage off */ }
  }

  async setCourse(id: Id | null): Promise<void> {
    this.courseId = id;
    this.turns = [];
    await this.loadDocs();
  }

  stop(): void {
    this.abort?.abort();
  }

  private async run(kind: "summary" | "chat", fn: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (this.busy || !this.model) return;
    this.busy = kind;
    this.error = null;
    this.abort = new AbortController();
    try {
      await fn(this.abort.signal);
    } catch (e) {
      if (e instanceof OllamaDown) this.status = "down";
      else if (!this.abort.signal.aborted) this.error = errText(e);
    } finally {
      this.busy = null;
      this.phase = "";
      this.abort = null;
    }
  }

  summarize(): Promise<void> {
    return this.run("summary", async (signal) => {
      const doc = this.docs.find((d) => d.id === this.summaryDocId);
      if (!doc) return;
      this.summary = "";
      this.summarySaved = false;
      this.phase = "PDF okunuyor…";
      const pages = await pageTexts(this.lib.platform, doc);
      if (!pages.some((p) => p.trim())) throw new Error("Bu PDF'te seçilebilir metin yok (taranmış olabilir).");
      this.phase = "Yazıyor…";
      const body = await aiClient.chat({
        model: this.model!,
        messages: summaryPrompt(doc.title, pages),
        signal,
        onToken: (t) => (this.summary += t),
      });
      await this.lib.repo.addNote({ documentId: doc.id, courseId: doc.courseId, kind: "ai", title: `Özet: ${doc.title}`, body: cleanAnswer(body) });
      this.summarySaved = true;
    });
  }

  /** Chunks of every document, highlight and note in the chosen course. */
  private async corpus(): Promise<Bm25> {
    const docs = await Promise.all(
      this.docs.map(async (doc) => ({
        doc,
        pages: await pageTexts(this.lib.platform, doc).catch(() => [] as string[]),
        annotations: await this.lib.repo.listAnnotations(doc.id),
      })),
    );
    const ids = new Set(this.docs.map((d) => d.id));
    const notes = (await this.lib.repo.listNotes()).filter(
      (n) => this.courseId == null || n.courseId === this.courseId || (n.documentId != null && ids.has(n.documentId)),
    );
    return new Bm25(buildCorpus({ docs, notes }));
  }

  ask(question: string): Promise<void> {
    const q = question.trim();
    if (!q) return Promise.resolve();
    return this.run("chat", async (signal) => {
      const history: ChatMessage[] = this.turns.map(({ role, content }) => ({ role, content }));
      this.turns.push({ role: "user", content: q });
      this.phase = "Kaynaklar taranıyor…";
      const hits = (await this.corpus()).search(q, TOP_K);
      this.turns.push({ role: "assistant", content: "", hits });
      const turn = this.turns[this.turns.length - 1];
      this.phase = "Yazıyor…";
      await aiClient.chat({
        model: this.model!,
        messages: chatPrompt(q, hits, history),
        signal,
        onToken: (t) => (turn.content += t),
      });
    });
  }

  async openSummaryPage(page: number): Promise<void> {
    const doc = this.docs.find((d) => d.id === this.summaryDocId);
    if (doc) await this.lib.open(doc, page);
  }

  /** Opens the cited page; false when the model cited a page it was not given. */
  async openCitation(page: number, hits: Hit[] = [], title?: string): Promise<boolean> {
    const chunk = resolveCitation(page, hits, title);
    const doc = chunk?.documentId != null ? await this.lib.repo.getDocument(chunk.documentId) : undefined;
    if (!doc) return false;
    await this.lib.open(doc, page);
    return true;
  }
}
