import { describe, expect, it } from "vitest";
import { StudyRepo } from "../src/core/study/studyRepo";
import { advance, formatStudyTime, idleClock, type StudyClock } from "../src/core/study/studyTime";
import { freshRepo } from "./helpers";

describe("study time accounting", () => {
  it("credits only while the stopwatch runs with a document open", () => {
    let c: StudyClock = idleClock();
    const credits: [number, number][] = [];
    const step = (doc: number | null, running: boolean, now: number) => {
      const r = advance(c, doc, running, now);
      c = r.clock;
      if (r.credit) credits.push([r.credit.docId, r.credit.ms]);
    };
    step(1, false, 0); // open doc 1, stopwatch stopped
    step(1, true, 1000); // start
    step(1, true, 31_000); // periodic flush
    step(2, true, 41_000); // switch PDFs while running
    step(null, true, 46_000); // reader closed, stopwatch still running
    step(null, true, 99_000); // nothing open: nothing credited
    step(2, true, 100_000); // reopen
    step(2, false, 103_000); // pause
    step(2, false, 200_000);
    expect(credits).toEqual([[1, 30_000], [1, 10_000], [2, 5000], [2, 3000]]);
  });

  it("never credits negative spans", () => {
    const r = advance({ docId: 1, since: 5000 }, 1, true, 1000);
    expect(r.credit).toBeNull();
  });

  it("formats hours and minutes", () => {
    expect(formatStudyTime(0)).toBe("0 dk");
    expect(formatStudyTime(30_000)).toBe("1 dk'dan az");
    expect(formatStudyTime(40 * 60_000 + 59_000)).toBe("40 dk");
    expect(formatStudyTime(85 * 60_000)).toBe("1 sa 25 dk");
    expect(formatStudyTime(120 * 60_000)).toBe("2 sa");
  });
});

describe("study time repo", () => {
  it("adds up per document, day and course", async () => {
    const repo = await freshRepo();
    const study = new StudyRepo(repo.db);
    const c = await repo.addCourse("Ağlar");
    const d1 = await repo.addDocument({ courseId: c, title: "A", filePath: "a.pdf", fileHash: "a" });
    const d2 = await repo.addDocument({ courseId: null, title: "B", filePath: "b.pdf", fileHash: "b" });
    await study.addStudyTime(d1, 60_000, "2026-10-29");
    await study.addStudyTime(d1, 30_000, "2026-10-29");
    await study.addStudyTime(d1, 10_000, "2026-10-30");
    await study.addStudyTime(d2, 5000, "2026-10-30");
    await study.addStudyTime(d2, 0, "2026-10-30");
    expect(await study.studyTimes()).toEqual(new Map([[d1, 100_000], [d2, 5000]]));
    const progress = await study.courseProgress();
    expect(progress.find((p) => p.courseId === c)?.studyMs).toBe(100_000);
    expect(progress.find((p) => p.courseId === null)?.studyMs).toBe(5000);
    await repo.deleteDocument(d1);
    expect((await study.studyTimes()).has(d1)).toBe(false);
  });
});
