import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, migrate, schemaVersion } from "../src/core/db/migrate";
import { cleanTitle, groupByWeek, weekNumber } from "../src/core/week";
import { RecordingClock, formatTimestamp, pickRecordingMime } from "../src/core/recording";
import { addDocuments, summaryText } from "../src/core/library/addDocuments";
import { fakeFile, freshRepo } from "./helpers";

describe("week", () => {
  it("reads week numbers", () => {
    expect(weekNumber("Hafta 3_Ağlar.pdf")).toBe(3);
    expect(weekNumber("hafta04.pdf")).toBe(4);
    expect(weekNumber("1.Hafta Giriş.pdf")).toBe(1);
    expect(weekNumber("2026_Hafta12_x.pdf")).toBe(12);
    expect(weekNumber("Özet.pdf")).toBeNull();
  });
  it("cleans titles", () => {
    expect(cleanTitle("Hafta 3_Ağ_Katmanları_v2.pdf")).toBe("Hafta 3: Ağ Katmanları");
    expect(cleanTitle("Ders Notu (1).pdf")).toBe("Ders Notu");
    expect(cleanTitle("hafta05.pdf")).toBe("Hafta 5");
  });
  it("groups by week, weekless last", () => {
    const g = groupByWeek([{ week: null, title: "b" }, { week: 2, title: "a" }, { week: 1, title: "c" }]);
    expect(g.map((x) => x.label)).toEqual(["Hafta 1", "Hafta 2", "Haftasız"]);
  });
});

describe("recording", () => {
  it("excludes pauses from offsets", () => {
    const c = new RecordingClock();
    c.start(0);
    c.pause(10_000);
    c.resume(70_000);
    expect(c.offsetSeconds(75_500)).toBe(15);
    expect(formatTimestamp(3725)).toBe("1:02:05");
    expect(pickRecordingMime((t) => t === "audio/mp4")).toBe("audio/mp4");
  });
});

describe("db", () => {
  it("migrates once and is idempotent", async () => {
    const repo = await freshRepo();
    expect(await schemaVersion(repo.db)).toBe(SCHEMA_VERSION);
    expect(await migrate(repo.db)).toBe(SCHEMA_VERSION);
  });
  it("stores documents, annotations and marks", async () => {
    const repo = await freshRepo();
    const c = await repo.ensureCourse("Ağlar");
    expect(await repo.ensureCourse("ağlar")).toBe(c);
    const d = await repo.addDocument({ courseId: c, title: "Hafta 2: TCP", filePath: "docs/x.pdf", fileHash: "x" });
    expect((await repo.getDocument(d))?.week).toBe(2);
    await repo.setFavorite(d, true);
    expect((await repo.counts()).favorites).toBe(1);
    const a = await repo.addAnnotation({ documentId: d, page: 1, rects: [{ x: 0, y: 0, w: 1, h: 0.1 }], label: "exam" });
    const r = await repo.startRecording(d, "audio/webm");
    await repo.addMark(r, a, 12);
    expect((await repo.marksForDocument(d)).size).toBe(0); // unfinished recording
    await repo.finishRecording(r, "rec/1.webm", 60);
    expect((await repo.marksForDocument(d)).get(a)?.offsetSeconds).toBe(12);
  });
});

describe("addDocuments", () => {
  it("adds, skips duplicates, reports failures, maps folders to courses", async () => {
    const repo = await freshRepo();
    const stored: string[] = [];
    const progress: number[] = [];
    const r = await addDocuments(repo, [
      fakeFile("Hafta 1_Giriş.pdf", "h1", null, stored),
      fakeFile("kopya.pdf", "h1", null, stored),
      fakeFile("notlar.txt", "t", null, stored),
      fakeFile("Hafta 2.pdf", "h2", "Ağlar", stored),
      fakeFile("Hafta 3.PDF", "h3", "Ağlar", stored),
      fakeFile("bozuk.pdf", "broken", null, stored),
    ], { onProgress: (d) => progress.push(d) });
    expect(summaryText(r)).toBe("3 eklendi, 1 zaten vardı, 1 hatalı");
    expect(stored).toEqual(["docs/h1.pdf", "docs/h2.pdf", "docs/h3.pdf"]);
    expect(progress).toEqual([1, 2, 3, 4, 5]);
    const courses = await repo.listCourses();
    expect(courses.map((c) => c.name)).toEqual(["Ağlar"]);
    const docs = await repo.listDocuments({ kind: "course", courseId: courses[0].id });
    expect(docs.map((d) => d.title)).toEqual(["Hafta 2", "Hafta 3"]);
    expect((await repo.getDocument(r.added[0]))?.readStatus).toBe("unread");
    const again = await addDocuments(repo, [fakeFile("Hafta 1_Giriş.pdf", "h1")]);
    expect(summaryText(again)).toBe("0 eklendi, 1 zaten vardı, 0 hatalı");
  });
  it("stops when cancelled", async () => {
    const repo = await freshRepo();
    const ac = new AbortController();
    const r = await addDocuments(repo, [fakeFile("a.pdf", "a"), fakeFile("b.pdf", "b")], {
      signal: ac.signal,
      onProgress: () => ac.abort(),
    });
    expect(r.added.length).toBe(1);
    expect(summaryText(r)).toBe("1 eklendi, 0 zaten vardı, 0 hatalı (iptal edildi)");
  });
});
