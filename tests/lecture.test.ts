import { describe, expect, it } from "vitest";
import {
  findCues, findSilences, firstOffsetForPage, hiddenDuringReplay, normaliseVisits, pageAt, pageSegments, pagesBetween,
  paragraphPages, rmsFrames, skipTarget, skippedSeconds,
} from "../src/core/lecture";
import { InkRepo } from "../src/core/inkRepo";
import { LectureRepo } from "../src/core/lectureRepo";
import { freshRepo } from "./helpers";

const visits = [
  { page: 1, offsetSeconds: 0 },
  { page: 2, offsetSeconds: 10 },
  { page: 3, offsetSeconds: 10.5 }, // scrolled past
  { page: 4, offsetSeconds: 11 },
  { page: 2, offsetSeconds: 40 },
];

describe("page timeline", () => {
  it("merges repeats and sorts", () => {
    expect(normaliseVisits([{ page: 2, offsetSeconds: 5 }, { page: 1, offsetSeconds: 0 }, { page: 1, offsetSeconds: 2 }]))
      .toEqual([{ page: 1, offsetSeconds: 0 }, { page: 2, offsetSeconds: 5 }]);
  });

  it("drops pages shown only while scrolling past", () => {
    expect(pageSegments(visits, 60)).toEqual([
      { page: 1, start: 0, end: 11 },
      { page: 4, start: 11, end: 40 },
      { page: 2, start: 40, end: 60 },
    ]);
  });

  it("finds where a page was first explained and what is on screen", () => {
    const seg = pageSegments(visits, 60);
    expect(firstOffsetForPage(seg, 4)).toBe(11);
    expect(firstOffsetForPage(seg, 2)).toBe(40);
    expect(firstOffsetForPage(seg, 9)).toBeNull();
    expect(pageAt(seg, 5)).toBe(1);
    expect(pageAt(seg, 45)).toBe(2);
    expect(pagesBetween(seg, 5, 20)).toEqual([1, 4]);
  });

  it("keeps a single short visit and an empty timeline", () => {
    expect(pageSegments([{ page: 3, offsetSeconds: 0 }], 1)).toEqual([{ page: 3, start: 0, end: 1 }]);
    expect(pageSegments([], 10)).toEqual([]);
    expect(pageAt([], 3)).toBeNull();
  });
});

describe("note replay", () => {
  it("hides notes of the playing recording until their moment", () => {
    const m = { recordingId: 1, offsetSeconds: 30 };
    expect(hiddenDuringReplay(m, 1, 10)).toBe(true);
    expect(hiddenDuringReplay(m, 1, 30)).toBe(false);
    expect(hiddenDuringReplay(m, 2, 10)).toBe(false);
    expect(hiddenDuringReplay(m, null, 10)).toBe(false);
    expect(hiddenDuringReplay(undefined, 1, 10)).toBe(false);
  });
});

describe("silence", () => {
  it("measures RMS per frame", () => {
    const f = rmsFrames(new Float32Array([1, -1, 0, 0, 0.5]), 10, 0.2);
    expect(f.length).toBe(3);
    expect(f[0]).toBeCloseTo(1);
    expect(f[1]).toBe(0);
    expect(f[2]).toBeCloseTo(0.5);
  });

  it("finds gaps longer than 1.5 s above the noise floor", () => {
    const speech = (n: number) => Array.from({ length: n }, (_, i) => 0.2 + 0.05 * Math.sin(i));
    const hiss = (n: number) => Array.from({ length: n }, () => 0.01);
    const rms = [...speech(20), ...hiss(10), ...speech(10), ...hiss(30), ...speech(5)];
    expect(findSilences(rms)).toEqual([{ start: 4, end: 7 }]);
    expect(findSilences(rms, 0.1, 0.5)).toEqual([{ start: 2, end: 3 }, { start: 4, end: 7 }]);
    expect(findSilences(hiss(50))).toEqual([]);
    expect(findSilences([])).toEqual([]);
  });

  it("skips inside a span with a breath at both ends", () => {
    const s = [{ start: 4, end: 7 }];
    expect(skipTarget(s, 3.9)).toBeNull();
    expect(skipTarget(s, 4.1)).toBeNull();
    expect(skipTarget(s, 5)).toBeCloseTo(6.7);
    expect(skipTarget(s, 6.8)).toBeNull();
    expect(skippedSeconds(s)).toBeCloseTo(2.4);
  });
});

describe("transcript and cues", () => {
  const seg = pageSegments([{ page: 1, offsetSeconds: 0 }, { page: 2, offsetSeconds: 30 }, { page: 3, offsetSeconds: 70 }], 100);
  const paras = paragraphPages([
    { start: 0, text: "Giriş. Bugün ağ katmanlarını konuşacağız." },
    { start: 25, text: "Bu kısım ÇOK ÖNEMLİ, sınavda çıkar: OSI yedi katmandır." },
    { start: 80, text: "Unutmayin, TCP güvenilirdir. Önemlidir ama dikkatsizlik değil." },
  ], seg, 100);

  it("links paragraphs to the pages shown while spoken", () => {
    expect(paras.map((p) => p.pages)).toEqual([[1], [1, 2, 3], [3]]);
    expect(paras.map((p) => p.end)).toEqual([25, 80, 100]);
  });

  it("finds Turkish cue phrases, folded, whole words, longest first", () => {
    const cues = findCues(paras);
    expect(cues.map((c) => c.phrase)).toEqual(["ÇOK ÖNEMLİ", "sınavda çıkar", "Unutmayin", "Önemli"]);
    expect(cues[0].at).toBeGreaterThanOrEqual(25);
    expect(cues[1].at).toBeLessThan(80);
    expect(pageAt(seg, cues[1].at)).toBe(2);
    expect(cues[1].snippet).toContain("OSI");
  });
});

describe("lecture repo", () => {
  it("stores page visits, stroke moments and silences; deleting the recording removes them", async () => {
    const repo = await freshRepo();
    const docId = await repo.addDocument({ courseId: null, title: "Ders", filePath: "a.pdf", fileHash: "h" });
    const rec = await repo.startRecording(docId, "audio/webm");
    await repo.finishRecording(rec, "recordings/1.webm", 20);
    const lr = new LectureRepo(repo.db);
    await lr.addPageVisit(rec, 1, 0);
    await lr.addPageVisit(rec, 2, 5.25);
    expect((await lr.pageVisits(docId)).get(rec)).toEqual([{ page: 1, offsetSeconds: 0 }, { page: 2, offsetSeconds: 5.25 }]);
    const stroke = await new InkRepo(repo.db).add({ documentId: docId, page: 2, color: "#000000", width: 2, points: [{ x: 0, y: 0, p: 0.5 }] });
    await lr.markStroke(stroke, rec, 6.5);
    expect((await lr.strokeMarks(docId)).get(stroke)).toEqual({ recordingId: rec, offsetSeconds: 6.5 });
    expect(await lr.silences(rec)).toBeNull();
    await lr.saveSilences(rec, [{ start: 2, end: 4 }]);
    expect(await lr.silences(rec)).toEqual([{ start: 2, end: 4 }]);
    await repo.deleteRecording(rec);
    expect((await lr.pageVisits(docId)).size).toBe(0);
    expect((await lr.strokeMarks(docId)).size).toBe(0);
    expect(await lr.silences(rec)).toBeNull();
  });
});
