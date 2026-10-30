// Weekly planner state ("Program"). Views read it; only this file talks to PlanRepo.
import { addDays, expandWeek, formatTime, isoDay, movedDay, parseTime, totalsByCourse, weekDays, weekStart, type Occurrence, type PlanItem, type PlanKind } from "../core/plan/plan";
import { PlanRepo, type NewPlanItem } from "../core/plan/planRepo";
import type { Document, Id } from "../core/types";
import type { Library } from "./library.svelte";

/** Form fields of the add/edit dialog. */
export interface PlanDraft {
  title: string;
  courseId: Id | null;
  documentId: Id | null;
  day: string;
  /** "HH:MM" or "" for any time. */
  time: string;
  durationMin: number;
  kind: PlanKind;
  repeatWeekly: boolean;
}

export class Plan {
  readonly repo: PlanRepo;
  today = $state(isoDay(new Date()));
  monday = $state(weekStart(isoDay(new Date())));
  items = $state.raw<PlanItem[]>([]);
  doneDays = $state.raw<ReadonlySet<string>>(new Set());
  /** Documents for the dialog's "Belge" select. */
  docs = $state.raw<Document[]>([]);
  /** Narrow layout: the day tab shown. */
  day = $state(isoDay(new Date()));

  days = $derived(weekDays(this.monday));
  occurrences = $derived(expandWeek(this.items, this.monday, this.doneDays));
  totals = $derived(totalsByCourse(this.occurrences));
  isThisWeek = $derived(this.monday === weekStart(this.today));

  constructor(readonly lib: Library) {
    this.repo = new PlanRepo(lib.platform.db);
  }

  async refresh(): Promise<void> {
    this.today = isoDay(new Date());
    const end = addDays(this.monday, 6);
    [this.items, this.doneDays, this.docs] = await Promise.all([
      this.repo.itemsBetween(this.monday, end),
      this.repo.doneBetween(this.monday, end),
      this.lib.repo.listDocuments({ kind: "all" }),
    ]);
  }

  async goWeek(delta: number): Promise<void> {
    this.monday = addDays(this.monday, 7 * delta);
    this.day = addDays(this.day, 7 * delta);
    await this.refresh();
  }

  async thisWeek(): Promise<void> {
    this.monday = weekStart(this.today);
    this.day = this.today;
    await this.refresh();
  }

  on(day: string): Occurrence[] {
    return this.occurrences.filter((o) => o.day === day);
  }

  draftFor(day: string, o?: Occurrence): PlanDraft {
    if (!o) return { title: "", courseId: null, documentId: null, day, time: "", durationMin: 45, kind: "study", repeatWeekly: false };
    const it = o.item;
    const time = it.startMin == null ? "" : formatTime(it.startMin);
    return { title: it.title, courseId: it.courseId, documentId: it.documentId, day: o.day, time, durationMin: it.durationMin, kind: it.kind, repeatWeekly: it.repeatWeekly };
  }

  /** Saves a new item, or edits `editing` (the occurrence the dialog was opened from). */
  async save(d: PlanDraft, editing: Occurrence | null): Promise<void> {
    const p: NewPlanItem = {
      title: d.title.trim(),
      courseId: d.courseId,
      documentId: d.documentId,
      day: editing ? movedDay(editing.item, editing.day, d.day) : d.day,
      startMin: parseTime(d.time),
      durationMin: Math.max(5, Math.round(d.durationMin) || 0),
      kind: d.kind,
      repeatWeekly: d.repeatWeekly,
    };
    if (editing) await this.repo.update(editing.item.id, p);
    else await this.repo.add(p);
    await this.refresh();
  }

  async remove(id: Id): Promise<void> {
    await this.repo.remove(id);
    await this.refresh();
  }

  async toggle(o: Occurrence): Promise<void> {
    await this.repo.setDone(o.item, o.day, !o.done);
    await this.refresh();
  }

  async move(o: Occurrence, to: string): Promise<void> {
    if (o.day === to) return;
    await this.repo.moveTo(o.item.id, movedDay(o.item, o.day, to));
    await this.refresh();
  }

  async openDocument(id: Id): Promise<void> {
    const d = this.docs.find((x) => x.id === id) ?? (await this.lib.repo.getDocument(id));
    if (d) await this.lib.open(d);
  }
}
