// AI screen state: engine (built-in llama.cpp or the user's Ollama), setup, summary and chat with course texts.
import { Bm25, type Hit } from "../core/ai/bm25";
import { suggestModel, type BuiltinModel } from "../core/ai/builtin";
import { buildCorpus } from "../core/ai/corpus";
import { EngineDown, openAiEngine, type Engine } from "../core/ai/engine";
import { isPermissive, listModels, ollamaEngine, pickModel } from "../core/ai/ollama";
import { chatPrompt, cleanAnswer, resolveCitation, summaryPrompt, type ChatMessage } from "../core/ai/prompts";
import type { Document, Id } from "../core/types";
import type { AiHost, AiStatus } from "../platform/ai";
import type { SetupProgress } from "../platform/transcriber";
import type { Library } from "./library.svelte";
import { pageTexts } from "./pageText";

const MODEL_KEY = "nito.ai.model";
const ENGINE_KEY = "nito.ai.engine";
const BUILTIN_KEY = "nito.ai.builtinModel";
const TOP_K = 5;

export interface Turn {
  role: "user" | "assistant";
  content: string;
  /** Chunks the answer was built from; citations resolve against these. */
  hits?: Hit[];
}

export type AiState =
  | "checking" // looking for engines
  | "setup" // built-in engine not downloaded yet: the setup card
  | "installing" // downloading
  | "starting" // llama-server is loading the model
  | "ready"
  | "down" // no built-in engine on this OS and Ollama is not running
  | "failed"; // the built-in engine did not start

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const load = (k: string) => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const save = (k: string, v: string) => {
  try { localStorage.setItem(k, v); } catch { /* storage off */ }
};

export class Ai {
  status = $state<AiState>("checking");
  /** Which engine answers: the built-in one unless the user picked a running Ollama. */
  engineKind = $state<"builtin" | "ollama">("builtin");
  builtin = $state<AiStatus | null>(null);
  builtinModel = $state<BuiltinModel>("fast");
  progress = $state<SetupProgress | null>(null);
  /** Why setup, start or a settings action failed (Turkish). */
  setupError = $state<string | null>(null);
  ollamaUp = $state(false);
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

  // Getters, not $derived: this object outlives the AiView that first creates it, and a derived owned by
  // an unmounted component stops updating.
  /** Ollama model whose licence does not allow commercial use (the user's own choice, shown as a note). */
  get restricted(): boolean {
    return this.engineKind === "ollama" && this.model != null && !isPermissive(this.model);
  }
  get suggested(): BuiltinModel {
    return suggestModel(this.builtin?.ramBytes ?? 0);
  }
  get installed(): BuiltinModel[] {
    return this.builtin?.models.filter((m) => m.installed).map((m) => m.id) ?? [];
  }
  get canAnswer(): boolean {
    return this.status === "ready" && (this.engineKind === "builtin" || this.model != null);
  }
  private engine: Engine | null = null;
  private abort: AbortController | null = null;

  private static instances = new WeakMap<Library, Ai>();
  static for(lib: Library): Ai {
    let ai = Ai.instances.get(lib);
    if (!ai) Ai.instances.set(lib, (ai = new Ai(lib)));
    return ai;
  }

  private constructor(readonly lib: Library) {}

  private get host(): AiHost {
    const h = this.lib.platform.ai;
    if (!h) throw new Error("Bu cihazda yapay zekâ yok.");
    return h;
  }

  /** First visit: find an engine and load documents. Later visits: refresh documents, keep the chat. */
  async init(): Promise<void> {
    await Promise.all([this.status === "checking" || this.status === "down" || this.status === "failed" ? this.connect() : null, this.loadDocs()]);
  }

  private async loadDocs(): Promise<void> {
    const id = this.courseId;
    this.docs = await this.lib.repo.listDocuments(id == null ? { kind: "all" } : { kind: "course", courseId: id });
    if (!this.docs.some((d) => d.id === this.summaryDocId)) this.summaryDocId = this.docs[0]?.id ?? null;
  }

  private async findOllama(): Promise<void> {
    try {
      this.models = await listModels(this.host.fetch);
      this.model = pickModel(this.models, load(MODEL_KEY));
      this.ollamaUp = true;
    } catch {
      this.models = [];
      this.ollamaUp = false;
    }
  }

  /** Picks the engine: Ollama only when the user chose it and it runs; else the built-in one. */
  async connect(): Promise<void> {
    this.status = "checking";
    this.setupError = null;
    const builtin = this.host.builtin;
    const [st] = await Promise.all([builtin ? builtin.status().catch(() => null) : null, this.findOllama()]);
    this.builtin = st;
    if (load(ENGINE_KEY) === "ollama" && this.ollamaUp) return this.useOllama();
    if (!builtin || !st?.supported) {
      if (this.ollamaUp) return this.useOllama();
      this.status = "down";
      return;
    }
    const saved = load(BUILTIN_KEY) as BuiltinModel | null;
    const pick = (saved && this.installed.includes(saved) ? saved : null) ?? st.running ?? this.installed[0];
    this.builtinModel = pick ?? this.suggested;
    if (st.hasBinary && pick) await this.startBuiltin(pick);
    else this.status = "setup";
  }

  private useOllama(): void {
    this.engineKind = "ollama";
    this.engine = this.model ? ollamaEngine(this.host.fetch, this.model) : null;
    this.status = "ready";
  }

  private async startBuiltin(model: BuiltinModel): Promise<void> {
    this.engineKind = "builtin";
    this.builtinModel = model;
    this.status = "starting";
    this.setupError = null;
    try {
      this.engine = openAiEngine(this.host.fetch, await this.host.builtin!.start(model));
      save(BUILTIN_KEY, model);
      this.status = "ready";
    } catch (e) {
      this.engine = null;
      this.setupError = errText(e);
      this.status = "failed";
    }
  }

  /** Downloads the engine and `model`, then starts it. */
  async install(model: BuiltinModel): Promise<void> {
    const builtin = this.host.builtin;
    if (!builtin || this.status === "installing") return;
    const had = this.status === "ready" ? this.engine : null;
    const before = { kind: this.engineKind, model: this.builtinModel };
    this.status = "installing";
    this.setupError = null;
    this.progress = null;
    this.builtinModel = model;
    try {
      this.builtin = await builtin.setup(model, (p) => (this.progress = p));
    } catch (e) {
      this.setupError = errText(e);
      this.builtin = await builtin.status().catch(() => this.builtin);
      // A failed or cancelled extra download keeps the engine that already worked.
      if (had) {
        this.engineKind = before.kind;
        this.builtinModel = before.model;
        this.status = "ready";
      } else this.status = "setup";
      return;
    } finally {
      this.progress = null;
    }
    save(ENGINE_KEY, "builtin");
    await this.startBuiltin(model);
  }

  cancelInstall(): Promise<void> {
    return this.host.builtin?.cancelSetup() ?? Promise.resolve();
  }

  /** Settings: run another downloaded model, or download it first. */
  async switchModel(model: BuiltinModel): Promise<void> {
    if (this.installed.includes(model)) {
      save(ENGINE_KEY, "builtin");
      await this.startBuiltin(model);
    } else await this.install(model);
  }

  /** Settings: delete a downloaded model; falls back to the other one or to the setup card. */
  async removeModel(model: BuiltinModel): Promise<void> {
    const builtin = this.host.builtin;
    if (!builtin) return;
    this.setupError = null;
    try {
      this.builtin = await builtin.remove(model);
    } catch (e) {
      this.setupError = errText(e);
      return;
    }
    if (this.engineKind === "builtin" && this.builtinModel === model) {
      this.engine = null;
      const other = this.installed[0];
      if (other) await this.startBuiltin(other);
      else {
        this.builtinModel = this.suggested;
        this.status = "setup";
      }
    }
  }

  /** Settings: answer with the user's running Ollama, or go back to the built-in engine. */
  async useEngine(kind: "builtin" | "ollama"): Promise<void> {
    this.setupError = null;
    if (kind === "ollama") {
      await this.findOllama();
      if (!this.ollamaUp) {
        this.setupError = "Ollama çalışmıyor.";
        return;
      }
      save(ENGINE_KEY, "ollama");
      await this.host.builtin?.stop().catch(() => {});
      this.useOllama();
      return;
    }
    save(ENGINE_KEY, "builtin");
    const pick = this.installed.includes(this.builtinModel) ? this.builtinModel : this.installed[0];
    if (pick) await this.startBuiltin(pick);
    else this.status = "setup";
  }

  setModel(m: string): void {
    this.model = m;
    save(MODEL_KEY, m);
    if (this.engineKind === "ollama") this.engine = ollamaEngine(this.host.fetch, m);
  }

  async setCourse(id: Id | null): Promise<void> {
    this.courseId = id;
    this.turns = [];
    await this.loadDocs();
  }

  stop(): void {
    this.abort?.abort();
  }

  private async run(kind: "summary" | "chat", fn: (engine: Engine, signal: AbortSignal) => Promise<void>): Promise<void> {
    const engine = this.engine;
    if (this.busy || !engine) return;
    this.busy = kind;
    this.error = null;
    this.abort = new AbortController();
    try {
      await fn(engine, this.abort.signal);
    } catch (e) {
      if (e instanceof EngineDown) {
        if (engine.kind === "builtin") {
          // The built-in server stopped (sleep, crash): start it again for the next try.
          this.error = "Yapay zekâ motoru durmuştu; yeniden başlatıldı. Lütfen tekrar dene.";
          void this.startBuiltin(this.builtinModel);
        } else this.status = "down";
      } else if (!this.abort.signal.aborted) this.error = errText(e);
    } finally {
      this.busy = null;
      this.phase = "";
      this.abort = null;
    }
  }

  summarize(): Promise<void> {
    return this.run("summary", async (engine, signal) => {
      const doc = this.docs.find((d) => d.id === this.summaryDocId);
      if (!doc) return;
      this.summary = "";
      this.summarySaved = false;
      this.phase = "PDF okunuyor…";
      const pages = await pageTexts(this.lib.platform, doc);
      if (!pages.some((p) => p.trim())) throw new Error("Bu PDF'te seçilebilir metin yok (taranmış olabilir).");
      this.phase = "Yazıyor…";
      const body = await engine.chat({
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
    return this.run("chat", async (engine, signal) => {
      const history: ChatMessage[] = this.turns.map(({ role, content }) => ({ role, content }));
      this.turns.push({ role: "user", content: q });
      this.phase = "Kaynaklar taranıyor…";
      const hits = (await this.corpus()).search(q, TOP_K);
      this.turns.push({ role: "assistant", content: "", hits });
      const turn = this.turns[this.turns.length - 1];
      this.phase = "Yazıyor…";
      await engine.chat({
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
