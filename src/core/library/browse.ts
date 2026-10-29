// Library search, sort and progress. Pure functions over documents.
import type { Course, Document, Id } from "../types";
import { compareByWeek } from "../week";

export type SortKey = "recent" | "added" | "name" | "week";

export const SORT_NAMES: Record<SortKey, string> = {
  recent: "Son açılan",
  added: "Eklenme tarihi",
  name: "Ad",
  week: "Hafta",
};

const FOLD: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

/** Lower-cases (Turkish rules) and drops diacritics, so "giris" finds "Giriş". */
export function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/̇/g, "")
    .normalize("NFC")
    .replace(/[çğıöşüâîû]/g, (c) => FOLD[c] ?? c);
}

/** Documents whose title or course name contains every word of the query. */
export function searchDocuments<T extends Pick<Document, "title" | "courseId">>(
  docs: T[],
  query: string,
  courses: Pick<Course, "id" | "name">[],
): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return docs;
  const names = new Map<Id, string>(courses.map((c) => [c.id, c.name]));
  return docs.filter((d) => {
    const hay = fold(`${d.title} ${d.courseId == null ? "" : (names.get(d.courseId) ?? "")}`);
    return words.every((w) => hay.includes(w));
  });
}

const collator = new Intl.Collator("tr", { numeric: true, sensitivity: "base" });

type Sortable = Pick<Document, "title" | "week" | "addedAt" | "lastOpenedAt">;

const COMPARE: Record<SortKey, (a: Sortable, b: Sortable) => number> = {
  // Never-opened documents go last, newest additions first among them.
  recent: (a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? "") || b.addedAt.localeCompare(a.addedAt),
  added: (a, b) => b.addedAt.localeCompare(a.addedAt) || collator.compare(a.title, b.title),
  name: (a, b) => collator.compare(a.title, b.title),
  week: compareByWeek,
};

export function sortDocuments<T extends Sortable>(docs: T[], key: SortKey): T[] {
  return [...docs].sort(COMPARE[key]);
}

export interface Progress {
  /** 0..1 */
  ratio: number;
  label: string;
}

/** "%40" while reading, "Okundu" when done, "Başlanmadı" before the first open. */
export function readingProgress(d: Pick<Document, "readStatus" | "lastPage" | "pageCount">): Progress {
  if (d.readStatus === "read") return { ratio: 1, label: "Okundu" };
  if (!d.lastPage || !d.pageCount) return { ratio: 0, label: d.readStatus === "reading" ? "Okunuyor" : "Başlanmadı" };
  const ratio = Math.min(1, d.lastPage / d.pageCount);
  return { ratio, label: `%${Math.round(ratio * 100)}` };
}

/** Parses the "Hafta değiştir" field: "" -> null (no week), "3" -> 3, junk -> undefined. */
export function parseWeek(text: string): number | null | undefined {
  const t = text.trim();
  if (!t) return null;
  const v = Number(t);
  return Number.isInteger(v) && v >= 1 && v <= 99 ? v : undefined;
}
