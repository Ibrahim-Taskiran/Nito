import { describe, expect, it } from "vitest";
import { HomeRepo } from "../src/core/home/homeRepo";
import {
  daysBetween, doneMinutes, expandWeek, formatMinutes, formatTime, greeting, longDate, movedDay, occursOn,
  parseTime, totalsByCourse, weekDays, weekLabel, weekStart, type PlanItem,
} from "../src/core/plan/plan";
import { PlanRepo } from "../src/core/plan/planRepo";
import { freshRepo } from "./helpers";

const item = (p: Partial<PlanItem>): PlanItem => ({
  id: 1, title: "x", courseId: null, documentId: null, day: "2026-10-28", startMin: null, durationMin: 30,
  kind: "study", done: false, repeatWeekly: false, createdAt: "", ...p,
});

describe("plan dates", () => {
  it("finds Monday and lists the week", () => {
    expect(weekStart("2026-10-30")).toBe("2026-10-26");
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
    expect(weekStart("2026-10-26")).toBe("2026-10-26");
    expect(weekDays("2026-10-26")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(daysBetween("2026-10-26", "2026-11-02")).toBe(7);
  });

  it("formats Turkish dates and times", () => {
    expect(longDate("2026-10-30")).toBe("30 Ekim Cuma");
    expect(weekLabel("2026-10-26")).toBe("26 Ekim – 1 Kasım 2026");
    expect(weekLabel("2026-11-02")).toBe("2 – 8 Kasım 2026");
    expect(greeting(8)).toBe("Günaydın");
    expect(greeting(20)).toBe("İyi akşamlar");
    expect(formatTime(570)).toBe("09:30");
    expect(parseTime("9:30")).toBe(570);
    expect(parseTime("25:00")).toBeNull();
    expect(formatMinutes(90)).toBe("1 sa 30 dk");
    expect(formatMinutes(45)).toBe("45 dk");
  });
});

describe("plan expansion", () => {
  it("shows repeating items every week from the anchor on", () => {
    const rep = item({ repeatWeekly: true, day: "2026-10-28" });
    expect(occursOn(rep, "2026-10-21")).toBe(false);
    expect(occursOn(rep, "2026-10-28")).toBe(true);
    expect(occursOn(rep, "2026-11-04")).toBe(true);
    expect(occursOn(rep, "2026-11-05")).toBe(false);
    const next = expandWeek([rep], "2026-11-02", new Set(["1:2026-11-04"]));
    expect(next).toEqual([{ item: rep, day: "2026-11-04", done: true }]);
    expect(expandWeek([rep], "2026-10-19", new Set())).toEqual([]);
  });

  it("orders by day then time, untimed last, and totals per course", () => {
    const a = item({ id: 1, title: "B", startMin: 600, courseId: 7, durationMin: 60, done: true });
    const b = item({ id: 2, title: "A", startMin: null, courseId: 7 });
    const c = item({ id: 3, title: "C", startMin: 540, day: "2026-10-29" });
    const occ = expandWeek([c, b, a], "2026-10-26", new Set());
    expect(occ.map((o) => o.item.id)).toEqual([1, 2, 3]);
    expect(totalsByCourse(occ)).toEqual([
      { courseId: 7, plannedMin: 90, doneMin: 60 },
      { courseId: null, plannedMin: 30, doneMin: 0 },
    ]);
    expect(doneMinutes(occ)).toBe(60);
  });

  it("moves one-off items and shifts repeating series", () => {
    expect(movedDay(item({}), "2026-10-28", "2026-10-30")).toBe("2026-10-30");
    expect(movedDay(item({ repeatWeekly: true }), "2026-11-04", "2026-11-02")).toBe("2026-10-26");
  });
});

describe("plan repo", () => {
  it("stores, completes per day, moves and deletes", async () => {
    const repo = await freshRepo();
    const plan = new PlanRepo(repo.db);
    const course = await repo.addCourse("Ağlar");
    const one = await plan.add({ title: "Hafta 5 oku", courseId: course, documentId: null, day: "2026-10-27", startMin: 600, durationMin: 45, kind: "study", repeatWeekly: false });
    const rep = await plan.add({ title: "Ders", courseId: null, documentId: null, day: "2026-10-20", startMin: null, durationMin: 90, kind: "lecture", repeatWeekly: true });
    await plan.add({ title: "Eski", courseId: null, documentId: null, day: "2026-10-01", startMin: null, durationMin: 30, kind: "other", repeatWeekly: false });

    const items = await plan.itemsBetween("2026-10-26", "2026-11-01");
    expect(items.map((i) => i.id)).toEqual([one, rep]);
    await plan.setDone(items[0], "2026-10-27", true);
    await plan.setDone(items[1], "2026-10-27", true);
    const week = expandWeek(await plan.itemsBetween("2026-10-26", "2026-11-01"), "2026-10-26", await plan.doneBetween("2026-10-26", "2026-11-01"));
    expect(week.map((o) => [o.item.id, o.done])).toEqual([[one, true], [rep, true]]);
    const next = expandWeek(await plan.itemsBetween("2026-11-02", "2026-11-08"), "2026-11-02", await plan.doneBetween("2026-11-02", "2026-11-08"));
    expect(next.map((o) => [o.item.id, o.day, o.done])).toEqual([[rep, "2026-11-03", false]]);

    await plan.moveTo(one, "2026-10-29");
    expect((await plan.itemsBetween("2026-10-29", "2026-10-29"))[0]).toMatchObject({ id: one, day: "2026-10-29", done: true });
    await plan.remove(rep);
    expect(await plan.doneBetween("2026-10-26", "2026-11-01")).toEqual(new Set());
  });
});

describe("home repo", () => {
  it("lists recent documents, highlights and recordings", async () => {
    const repo = await freshRepo();
    const home = new HomeRepo(repo.db);
    const a = await repo.addDocument({ courseId: null, title: "A", filePath: "a", fileHash: "a" });
    const b = await repo.addDocument({ courseId: null, title: "B", filePath: "b", fileHash: "b" });
    await repo.addDocument({ courseId: null, title: "C", filePath: "c", fileHash: "c" });
    expect(await home.recentDocuments()).toEqual([]);
    await repo.db.run("UPDATE document SET last_opened_at = ?, last_page = 4 WHERE id = ?", ["2026-10-30T10:00:00Z", a]);
    await repo.db.run("UPDATE document SET last_opened_at = ? WHERE id = ?", ["2026-10-30T11:00:00Z", b]);
    expect((await home.recentDocuments()).map((r) => [r.doc.title, r.lastPage])).toEqual([["B", null], ["A", 4]]);

    await repo.addAnnotation({ documentId: a, page: 2, rects: [], label: "exam", text: "OSI" });
    await repo.addAnnotation({ documentId: b, page: 3, rects: [], label: "definition", text: "TCP" });
    expect((await home.recentHighlights()).map((h) => [h.doc.title, h.annotation.page, h.annotation.text])).toEqual([["B", 3, "TCP"], ["A", 2, "OSI"]]);
    expect(await home.highlightsSince("2000-01-01T00:00:00Z")).toBe(2);

    const rec = await repo.startRecording(a, "audio/webm");
    expect(await home.recentRecordings()).toEqual([]);
    await repo.finishRecording(rec, "rec/1.webm", 65);
    expect((await home.recentRecordings()).map((r) => [r.doc.title, r.recording.durationSeconds])).toEqual([["A", 65]]);
  });
});
