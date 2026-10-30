// Data access for the weekly planner.
import type { Row, SqlDb } from "../db/sql";
import type { Id } from "../types";
import { doneKey, type PlanItem, type PlanKind } from "./plan";

export type NewPlanItem = Omit<PlanItem, "id" | "createdAt" | "done"> & { done?: boolean };

const toItem = (r: Row): PlanItem => ({
  id: Number(r.id),
  title: String(r.title ?? ""),
  courseId: r.course_id == null ? null : Number(r.course_id),
  documentId: r.document_id == null ? null : Number(r.document_id),
  day: String(r.day),
  startMin: r.start_min == null ? null : Number(r.start_min),
  durationMin: Number(r.duration_min ?? 0),
  kind: String(r.kind) as PlanKind,
  done: Number(r.done) === 1,
  repeatWeekly: Number(r.repeat_weekly) === 1,
  createdAt: String(r.created_at ?? ""),
});

export class PlanRepo {
  constructor(readonly db: SqlDb) {}

  /** One-off items in [from, to] plus every repeating item anchored on or before `to`. */
  async itemsBetween(from: string, to: string): Promise<PlanItem[]> {
    const rows = await this.db.all(
      "SELECT * FROM plan_item WHERE (repeat_weekly = 0 AND day BETWEEN ? AND ?) OR (repeat_weekly = 1 AND day <= ?) ORDER BY id",
      [from, to, to],
    );
    return rows.map(toItem);
  }

  /** doneKey set for repeating items in [from, to]. */
  async doneBetween(from: string, to: string): Promise<Set<string>> {
    const rows = await this.db.all<{ plan_item_id: number; day: string }>(
      "SELECT plan_item_id, day FROM plan_done WHERE day BETWEEN ? AND ?",
      [from, to],
    );
    return new Set(rows.map((r) => doneKey(Number(r.plan_item_id), String(r.day))));
  }

  async add(p: NewPlanItem): Promise<Id> {
    return (await this.db.run(
      `INSERT INTO plan_item (title, course_id, document_id, day, start_min, duration_min, kind, done, repeat_weekly, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.title, p.courseId, p.documentId, p.day, p.startMin, p.durationMin, p.kind, p.done ? 1 : 0, p.repeatWeekly ? 1 : 0, new Date().toISOString()],
    )).lastId;
  }

  async update(id: Id, p: NewPlanItem): Promise<void> {
    await this.db.run(
      `UPDATE plan_item SET title = ?, course_id = ?, document_id = ?, day = ?, start_min = ?, duration_min = ?, kind = ?, repeat_weekly = ?
       WHERE id = ?`,
      [p.title, p.courseId, p.documentId, p.day, p.startMin, p.durationMin, p.kind, p.repeatWeekly ? 1 : 0, id],
    );
  }

  async moveTo(id: Id, day: string): Promise<void> {
    await this.db.run("UPDATE plan_item SET day = ? WHERE id = ?", [day, id]);
  }

  /** Marks one occurrence done or not. */
  async setDone(item: PlanItem, day: string, done: boolean): Promise<void> {
    if (!item.repeatWeekly) {
      await this.db.run("UPDATE plan_item SET done = ? WHERE id = ?", [done ? 1 : 0, item.id]);
    } else if (done) {
      await this.db.run("INSERT OR IGNORE INTO plan_done (plan_item_id, day) VALUES (?, ?)", [item.id, day]);
    } else {
      await this.db.run("DELETE FROM plan_done WHERE plan_item_id = ? AND day = ?", [item.id, day]);
    }
  }

  async remove(id: Id): Promise<void> {
    await this.db.run("DELETE FROM plan_item WHERE id = ?", [id]);
  }
}
