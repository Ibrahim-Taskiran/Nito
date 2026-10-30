// Flashcards from highlights and Leitner scheduling. Pure: "today" is always passed in.
import type { Annotation, Id, LabelKey } from "../types";

export const CARD_LABELS: readonly LabelKey[] = ["definition", "question"];

/** Days until the next review, per box 1..5. */
export const BOX_INTERVALS = [1, 2, 4, 8, 16] as const;
export const MAX_BOX = BOX_INTERVALS.length;

export const NO_ANSWER = "Cevap yok";

export interface CardFace {
  front: string;
  back: string;
}

export interface CardState {
  box: number; // 1..5
  due: string; // YYYY-MM-DD
  lastReviewed: string | null;
}

export interface Card extends CardFace, CardState {
  annotationId: Id;
  documentId: Id;
  courseId: Id | null;
  label: LabelKey;
  page: number;
  /** False for a question without a comment; such cards stay out of quizzes. */
  hasAnswer: boolean;
  /** Wrong options saved with an AI multiple-choice question; the quiz prefers them. */
  wrong?: string[];
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function firstWords(text: string, n: number): string {
  const words = text.split(" ");
  return words.length <= n ? text : `${words.slice(0, n).join(" ")} …`;
}

/** Term before ":" or "—", if it looks like a term (short, not the whole text). */
export function definitionTerm(text: string): string | null {
  const m = clean(text).match(/^(.{1,80}?)\s*(?::|—|–)\s*(\S.*)$/);
  return m ? m[1] : null;
}

/** Front/back for a Tanım or Soru highlight; null for other labels. */
export function cardFace(a: Pick<Annotation, "label" | "text" | "comment" | "page">): CardFace | null {
  const text = clean(a.text);
  const comment = a.comment.trim();
  if (a.label === "definition") {
    const term = definitionTerm(text);
    return {
      front: term ?? `Tanım (s. ${a.page}): ${firstWords(text, 6)}`,
      back: comment ? `${text}\n\n${comment}` : text,
    };
  }
  if (a.label === "question") return { front: text, back: comment || NO_ANSWER };
  return null;
}

/** YYYY-MM-DD in local time. */
export function isoDay(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + days));
}

export function newCardState(today: string): CardState {
  return { box: 1, due: today, lastReviewed: null };
}

/** Leitner step: correct moves one box up (max 5), wrong goes back to box 1. */
export function review(state: CardState, correct: boolean, today: string): CardState {
  const box = correct ? Math.min(state.box + 1, MAX_BOX) : 1;
  return { box, due: addDays(today, BOX_INTERVALS[box - 1]), lastReviewed: today };
}

export const isDue = (s: CardState, today: string): boolean => s.due <= today;

/** Due cards first by due date, then by box (weakest first). */
export function dueCards<T extends CardState>(cards: T[], today: string): T[] {
  return cards.filter((c) => isDue(c, today)).sort((a, b) => a.due.localeCompare(b.due) || a.box - b.box);
}
