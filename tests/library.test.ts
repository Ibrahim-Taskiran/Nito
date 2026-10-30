import { describe, expect, it } from "vitest";
import { fold, parseWeek, readingProgress, searchDocuments, sortDocuments } from "../src/core/library/browse";
import { freshRepo } from "./helpers";

const doc = (id: number, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  courseId: null as number | null,
  week: null as number | null,
  addedAt: `2026-01-0${id}`,
  lastOpenedAt: null as string | null,
  ...extra,
});

describe("browse", () => {
  it("searches title and course, Turkish-insensitive", () => {
    const docs = [doc(1, "Hafta 1: Giriş"), doc(2, "Özet", { courseId: 7 }), doc(3, "TCP")];
    const courses = [{ id: 7, name: "Ağlar" }];
    expect(fold("IŞIK Çağrı İz")).toBe("isik cagri iz");
    expect(searchDocuments(docs, "giris", courses).map((d) => d.id)).toEqual([1]);
    expect(searchDocuments(docs, "AĞLAR", courses).map((d) => d.id)).toEqual([2]);
    expect(searchDocuments(docs, "  ", courses)).toHaveLength(3);
    expect(searchDocuments(docs, "ozet ag", courses).map((d) => d.id)).toEqual([2]);
  });
  it("sorts", () => {
    const docs = [doc(1, "b", { week: 2 }), doc(2, "a", { lastOpenedAt: "2026-02-01" }), doc(3, "c", { week: 1, lastOpenedAt: "2026-03-01" })];
    expect(sortDocuments(docs, "recent").map((d) => d.id)).toEqual([3, 2, 1]);
    expect(sortDocuments(docs, "added").map((d) => d.id)).toEqual([3, 2, 1]);
    expect(sortDocuments(docs, "name").map((d) => d.id)).toEqual([2, 1, 3]);
    expect(sortDocuments(docs, "week").map((d) => d.id)).toEqual([3, 1, 2]);
  });
  it("progress and week parsing", () => {
    expect(readingProgress({ readStatus: "reading", lastPage: 2, pageCount: 5 })).toEqual({ ratio: 0.4, label: "%40" });
    expect(readingProgress({ readStatus: "read", lastPage: 2, pageCount: 5 }).label).toBe("Okundu");
    expect(readingProgress({ readStatus: "unread", lastPage: null, pageCount: null }).label).toBe("Başlanmadı");
    expect(parseWeek("")).toBeNull();
    expect(parseWeek("4")).toBe(4);
    expect(parseWeek("x")).toBeUndefined();
  });
});

describe("repo reading + editing", () => {
  it("saves reading position and status", async () => {
    const repo = await freshRepo();
    const id = await repo.addDocument({ courseId: null, title: "Hafta 2", filePath: "a.pdf", fileHash: "a" });
    expect((await repo.getDocument(id))?.lastPage).toBeNull();
    await repo.setReadingPosition(id, 3, 10);
    let d = await repo.getDocument(id);
    expect([d?.lastPage, d?.pageCount, d?.readStatus]).toEqual([3, 10, "reading"]);
    expect(d?.lastOpenedAt).toBeTruthy();
    await repo.setReadingPosition(id, 10, 10);
    expect((await repo.getDocument(id))?.readStatus).toBe("read");
    await repo.setReadingPosition(id, 4, 10);
    d = await repo.getDocument(id);
    expect([d?.lastPage, d?.readStatus]).toEqual([4, "read"]);
  });

  it("renames, moves, sets week, deletes with cascade", async () => {
    const repo = await freshRepo();
    const c = await repo.addCourse("Ağlar");
    const id = await repo.addDocument({ courseId: null, title: "x", filePath: "docs/a.pdf", fileHash: "a" });
    await repo.renameDocument(id, "  Yeni ad ");
    await expect(repo.renameDocument(id, " ")).rejects.toThrow();
    await repo.moveToCourse(id, c);
    await repo.setWeek(id, 6);
    let d = await repo.getDocument(id);
    expect([d?.title, d?.courseId, d?.week]).toEqual(["Yeni ad", c, 6]);
    await repo.moveToCourse(id, null);
    await repo.setWeek(id, null);
    d = await repo.getDocument(id);
    expect([d?.courseId, d?.week]).toEqual([null, null]);

    await repo.addAnnotation({ documentId: id, page: 1, rects: [], label: "exam", text: "t" });
    await repo.addAnnotation({ documentId: id, page: 2, rects: [], label: "exam", text: "u" });
    await repo.addNote({ documentId: id, kind: "free", title: "n", body: "" });
    const rec = await repo.startRecording(id, "audio/webm");
    await repo.finishRecording(rec, "recordings/1.webm", 5);
    await repo.startRecording(id, "audio/webm"); // unfinished: not counted
    expect((await repo.documentStats()).get(id)).toEqual({ highlights: 2, recordings: 1, notes: 1 });

    expect(await repo.deleteDocument(id)).toEqual(["docs/a.pdf", "recordings/1.webm"]);
    expect(await repo.getDocument(id)).toBeUndefined();
    expect(await repo.listAnnotations(id)).toEqual([]);
    expect(await repo.listNotes({ documentId: id })).toEqual([]);
    expect(await repo.deleteDocument(id)).toEqual([]);
  });
});
