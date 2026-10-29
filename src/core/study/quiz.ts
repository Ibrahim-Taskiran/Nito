// Multiple-choice quiz from flashcards. The RNG is injected so tests are repeatable.
import type { Card } from "./cards";

export type Rng = () => number; // [0, 1)

export interface QuizQuestion {
  card: Card;
  options: string[];
  answer: number; // index into options
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * One question per answerable card, up to `limit`. Distractors are other cards' backs
 * from the same course (up to 3, fewer when the course has too few cards).
 */
export function buildQuiz(cards: readonly Card[], rng: Rng, limit = 10): QuizQuestion[] {
  const usable = cards.filter((c) => c.hasAnswer);
  return shuffle(usable, rng).slice(0, limit).map((card) => {
    const others = [...new Set(usable.filter((c) => c.courseId === card.courseId && c.back !== card.back).map((c) => c.back))];
    const options = shuffle([card.back, ...shuffle(others, rng).slice(0, 3)], rng);
    return { card, options, answer: options.indexOf(card.back) };
  });
}

export function score(questions: readonly QuizQuestion[], picks: readonly (number | null)[]): { correct: number; total: number } {
  return { correct: questions.filter((q, i) => picks[i] === q.answer).length, total: questions.length };
}

/** Small seeded RNG (mulberry32) for tests and reproducible sessions. */
export function seededRng(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
