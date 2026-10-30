// Weekly study planner: pure date math, repeat expansion and totals. "today" is always passed in.
import { addDays, isoDay } from "../study/cards";
import type { Id } from "../types";

export { addDays, isoDay };

export type PlanKind = "study" | "review" | "exam" | "lecture" | "other";

/** Muted colours, same family as the highlight labels. */
export const PLAN_KINDS: readonly { key: PlanKind; name: string; color: string }[] = [
  { key: "study", name: "Çalışma", color: "#6f93b3" },
  { key: "review", name: "Tekrar", color: "#7fa074" },
  { key: "exam", name: "Sınav", color: "#c9776b" },
  { key: "lecture", name: "Ders", color: "#9a88b8" },
  { key: "other", name: "Diğer", color: "#9aa1a8" },
];

const kindInfo = (k: PlanKind) => PLAN_KINDS.find((x) => x.key === k) ?? PLAN_KINDS[4];
export const kindName = (k: PlanKind): string => kindInfo(k).name;
export const kindColor = (k: PlanKind): string => kindInfo(k).color;

export interface PlanItem {
  id: Id;
  title: string;
  courseId: Id | null;
  documentId: Id | null;
  /** YYYY-MM-DD. For a repeating item: the first week it shows in, and its weekday. */
  day: string;
  /** Minutes after midnight; null = any time that day. */
  startMin: number | null;
  durationMin: number;
  kind: PlanKind;
  /** One-off items only; repeating items keep completion per day. */
  done: boolean;
  repeatWeekly: boolean;
  createdAt: string;
}

/** One item shown on one day. */
export interface Occurrence {
  item: PlanItem;
  day: string;
  done: boolean;
}

/** Monday-first names (index 0 = Pazartesi). */
export const DAY_NAMES = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"] as const;
export const DAY_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;
export const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"] as const;

const parse = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** 0 = Monday … 6 = Sunday. */
export const weekdayIndex = (day: string): number => (parse(day).getDay() + 6) % 7;

/** Monday of the week that contains `day`. */
export const weekStart = (day: string): string => addDays(day, -weekdayIndex(day));

/** The 7 days Monday..Sunday starting at `monday`. */
export const weekDays = (monday: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/** Whole days from a to b (b - a). */
export const daysBetween = (a: string, b: string): number => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);

/** "2026-10-30" -> "30 Ekim Cuma". */
export function longDate(day: string): string {
  const d = parse(day);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${DAY_NAMES[weekdayIndex(day)]}`;
}

/** "2026-10-26" -> "26 Eki". */
export const shortDate = (day: string): string => {
  const d = parse(day);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
};

/** "26 Ekim – 1 Kasım 2026" */
export function weekLabel(monday: string): string {
  const a = parse(monday);
  const b = parse(addDays(monday, 6));
  const left = a.getMonth() === b.getMonth() ? `${a.getDate()}` : `${a.getDate()} ${MONTHS[a.getMonth()]}`;
  return `${left} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}

export function greeting(hour: number): string {
  if (hour < 5) return "İyi geceler";
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}

/** 570 -> "09:30". */
export const formatTime = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** "9:30" / "09:30" -> 570; anything else -> null. */
export function parseTime(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h < 24 && mm < 60 ? h * 60 + mm : null;
}

/** 90 -> "1 sa 30 dk", 45 -> "45 dk". */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} dk`;
  return m ? `${h} sa ${m} dk` : `${h} sa`;
}

/** Key for per-day completion of repeating items. */
export const doneKey = (itemId: Id, day: string) => `${itemId}:${day}`;

/** Does `item` show on `day`? */
export function occursOn(item: PlanItem, day: string): boolean {
  if (!item.repeatWeekly) return item.day === day;
  const diff = daysBetween(item.day, day);
  return diff >= 0 && diff % 7 === 0;
}

const byTime = (a: Occurrence, b: Occurrence) =>
  a.day.localeCompare(b.day) ||
  (a.item.startMin ?? 24 * 60) - (b.item.startMin ?? 24 * 60) ||
  a.item.title.localeCompare(b.item.title, "tr") ||
  a.item.id - b.item.id;

/** Every occurrence on the given days, ordered by day then time (untimed last). */
export function expand(items: PlanItem[], days: string[], doneDays: ReadonlySet<string>): Occurrence[] {
  const out: Occurrence[] = [];
  for (const day of days) {
    for (const item of items) {
      if (!occursOn(item, day)) continue;
      out.push({ item, day, done: item.repeatWeekly ? doneDays.has(doneKey(item.id, day)) : item.done });
    }
  }
  return out.sort(byTime);
}

/** Occurrences of the week starting at `monday`. */
export const expandWeek = (items: PlanItem[], monday: string, doneDays: ReadonlySet<string>): Occurrence[] =>
  expand(items, weekDays(monday), doneDays);

export interface CourseTotal {
  courseId: Id | null;
  plannedMin: number;
  doneMin: number;
}

/** Planned vs done minutes per course (null course = "Genel"), largest plan first. */
export function totalsByCourse(occ: Occurrence[]): CourseTotal[] {
  const map = new Map<Id | null, CourseTotal>();
  for (const o of occ) {
    const t = map.get(o.item.courseId) ?? { courseId: o.item.courseId, plannedMin: 0, doneMin: 0 };
    t.plannedMin += o.item.durationMin;
    if (o.done) t.doneMin += o.item.durationMin;
    map.set(o.item.courseId, t);
  }
  return [...map.values()].sort((a, b) => b.plannedMin - a.plannedMin);
}

/** Sum of done minutes. */
export const doneMinutes = (occ: Occurrence[]): number => occ.reduce((s, o) => s + (o.done ? o.item.durationMin : 0), 0);

/**
 * New anchor day after dragging the occurrence on `from` to `to`.
 * A one-off item simply moves; a repeating series shifts by the same number of days.
 */
export const movedDay = (item: PlanItem, from: string, to: string): string =>
  item.repeatWeekly ? addDays(item.day, daysBetween(from, to)) : to;
