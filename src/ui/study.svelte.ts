// Study Center state: review session, quiz, Cornell notes and course pack export.
import { dueCards, isoDay, review, type Card } from "../core/study/cards";
import { asciiName, buildCoursePack } from "../core/study/pack";
import { buildQuiz, score, type QuizQuestion } from "../core/study/quiz";
import { StudyRepo, type CourseProgress, type DocHighlight } from "../core/study/studyRepo";
import type { Document, Id } from "../core/types";
import type { Library } from "./library.svelte";

interface Session {
  queue: Card[];
  index: number;
  revealed: boolean;
  right: number;
}

interface Quiz {
  questions: QuizQuestion[];
  index: number;
  picks: (number | null)[];
}

export class Study {
  readonly repo: StudyRepo;
  /** null = all courses. */
  courseId = $state<Id | null>(null);
  today = $state(isoDay(new Date()));
  cards = $state<Card[]>([]);
  exam = $state<DocHighlight[]>([]);
  docs = $state<Document[]>([]);
  progress = $state<CourseProgress[]>([]);
  session = $state<Session | null>(null);
  quiz = $state<Quiz | null>(null);
  /** One-line status after an action (note created, pack saved). */
  message = $state<string | null>(null);
  busy = $state(false);

  due = $derived(dueCards(this.cards, this.today));
  unread = $derived(this.docs.filter((d) => d.readStatus === "unread"));
  quizable = $derived(this.cards.filter((c) => c.hasAnswer).length);
  card = $derived(this.session?.queue[this.session.index] ?? null);
  question = $derived(this.quiz?.questions[this.quiz.index] ?? null);
  quizScore = $derived(this.quiz ? score(this.quiz.questions, this.quiz.picks) : null);

  constructor(readonly lib: Library) {
    this.repo = new StudyRepo(lib.platform.db);
  }

  async refresh(): Promise<void> {
    this.today = isoDay(new Date());
    [this.cards, this.exam, this.docs, this.progress] = await Promise.all([
      this.repo.listCards(this.courseId, this.today),
      this.repo.examHighlights(this.courseId),
      this.repo.documents(this.courseId),
      this.repo.courseProgress(),
    ]);
  }

  async setCourse(id: Id | null): Promise<void> {
    this.courseId = id;
    this.session = null;
    this.quiz = null;
    await this.refresh();
  }

  docTitle(id: Id): string {
    return this.docs.find((d) => d.id === id)?.title ?? "";
  }

  // ---- review session
  startReview(): void {
    this.quiz = null;
    this.session = { queue: [...this.due], index: 0, revealed: false, right: 0 };
  }

  reveal(): void {
    if (this.session) this.session.revealed = true;
  }

  async answer(correct: boolean): Promise<void> {
    const s = this.session;
    const c = this.card;
    if (!s || !c) return;
    await this.repo.saveReview(c.annotationId, review(c, correct, this.today));
    if (correct) s.right++;
    s.index++;
    s.revealed = false;
  }

  async endReview(): Promise<void> {
    this.session = null;
    await this.refresh();
  }

  // ---- quiz
  startQuiz(): void {
    this.session = null;
    const questions = buildQuiz(this.cards, Math.random);
    this.quiz = { questions, index: 0, picks: questions.map(() => null) };
  }

  pick(option: number): void {
    const q = this.quiz;
    if (q && q.picks[q.index] == null) q.picks[q.index] = option;
  }

  nextQuestion(): void {
    if (this.quiz) this.quiz.index++;
  }

  endQuiz(): void {
    this.quiz = null;
  }

  // ---- notes and export
  async cornell(doc: Document): Promise<void> {
    await this.repo.createCornellNote(doc);
    this.message = `Cornell notu oluşturuldu: ${doc.title}`;
  }

  async exportPack(p: CourseProgress): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const { storage, name } = this.lib.platform;
      const docs = await this.repo.packDocuments(p.courseId, (rel) => storage.read(rel));
      const { zip, missing } = buildCoursePack(p.name, docs);
      const file = `${asciiName(p.name)}.zip`;
      const lack = missing.length ? ` (${missing.length} PDF bulunamadı)` : "";
      if (name === "web") {
        download(zip, file);
        this.message = `Paket indirildi: ${file}${lack}`;
      } else {
        await storage.write(`exports/${file}`, zip);
        this.message = `Paket kaydedildi: uygulama verisi › storage/exports/${file}${lack}`;
      }
    } catch (e) {
      this.message = `Paket oluşturulamadı: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      this.busy = false;
    }
  }
}

function download(data: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: "application/zip" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
