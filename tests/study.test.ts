import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { addDays, cardFace, dueCards, isDue, newCardState, review, type Card } from "../src/core/study/cards";
import { buildQuiz, score, seededRng, shuffle } from "../src/core/study/quiz";
import { cornellNote, courseDigest, documentNotes, SUMMARY_PLACEHOLDER } from "../src/core/study/markdown";
import { asciiName, buildCoursePack, safeName } from "../src/core/study/pack";
import { StudyRepo } from "../src/core/study/studyRepo";
import type { Annotation, LabelKey } from "../src/core/types";
import { freshRepo } from "./helpers";

const ann = (label: LabelKey, text: string, comment = "", page = 1, id = 1): Annotation =>
  ({ id, documentId: 1, page, rects: [], label, text, comment, createdAt: `2026-10-0${page}` });

describe("card faces", () => {
  it("uses the term before ':' or '—' as the front", () => {
    expect(cardFace(ann("definition", "TCP: güvenilir aktarım protokolü"))).toEqual({ front: "TCP", back: "TCP: güvenilir aktarım protokolü" });
    expect(cardFace(ann("definition", "Yönlendirici — paketleri ağlar arasında iletir", "katman 3"))?.front).toBe("Yönlendirici");
    expect(cardFace(ann("definition", "x — y", "katman 3"))?.back).toBe("x — y\n\nkatman 3");
  });
  it("falls back to a page prompt", () => {
    const f = cardFace(ann("definition", "Ağ  katmanı paketleri bir uçtan diğerine taşır ve yol seçer", "", 4));
    expect(f?.front).toBe("Tanım (s. 4): Ağ katmanı paketleri bir uçtan diğerine …");
  });
  it("builds question cards and ignores other labels", () => {
    expect(cardFace(ann("question", "OSI kaç katman?", "7"))).toEqual({ front: "OSI kaç katman?", back: "7" });
    expect(cardFace(ann("question", "Neden?"))?.back).toBe("Cevap yok");
    expect(cardFace(ann("exam", "x"))).toBeNull();
  });
});

describe("leitner", () => {
  const today = "2026-10-29";
  it("moves up on correct, back to box 1 on wrong", () => {
    let s = newCardState(today);
    expect(isDue(s, today)).toBe(true);
    s = review(s, true, today);
    expect(s).toEqual({ box: 2, due: "2026-10-31", lastReviewed: today });
    s = review(review(review(s, true, today), true, today), true, today);
    expect(s.box).toBe(5);
    expect(review(s, true, today)).toMatchObject({ box: 5, due: "2026-11-14" });
    expect(review(s, false, today)).toMatchObject({ box: 1, due: "2026-10-30" });
  });
  it("adds days across months and years", () => {
    expect(addDays("2026-12-30", 4)).toBe("2027-01-03");
  });
  it("lists due cards oldest first", () => {
    const cards = [{ box: 1, due: "2026-10-30", lastReviewed: null }, { box: 3, due: "2026-10-20", lastReviewed: null }, { box: 1, due: "2026-10-29", lastReviewed: null }];
    expect(dueCards(cards, today).map((c) => c.due)).toEqual(["2026-10-20", "2026-10-29"]);
  });
});

const card = (id: number, back: string, courseId: number | null = 1, hasAnswer = true): Card => ({
  annotationId: id, documentId: 1, courseId, label: "question", page: 1, front: `S${id}`, back, hasAnswer, ...newCardState("2026-10-29"),
});

describe("quiz", () => {
  it("shuffles deterministically and keeps all items", () => {
    const a = shuffle([1, 2, 3, 4, 5], seededRng(1));
    expect(shuffle([1, 2, 3, 4, 5], seededRng(1))).toEqual(a);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
  });
  it("uses up to 3 distractors from the same course", () => {
    const cards = [card(1, "A"), card(2, "B"), card(3, "C"), card(4, "D"), card(5, "E"), card(6, "X", 2), card(7, "", 1, false)];
    const quiz = buildQuiz(cards, seededRng(7));
    expect(quiz.length).toBe(6); // the unanswerable card is skipped
    for (const q of quiz) {
      expect(q.options[q.answer]).toBe(q.card.back);
      expect(new Set(q.options).size).toBe(q.options.length);
      if (q.card.courseId === 1) {
        expect(q.options.length).toBe(4);
        expect(q.options).not.toContain("X");
      } else expect(q.options).toEqual(["X"]);
    }
  });
  it("scores picks", () => {
    const quiz = buildQuiz([card(1, "A"), card(2, "B")], seededRng(3));
    expect(score(quiz, [quiz[0].answer, null])).toEqual({ correct: 1, total: 2 });
  });
});

describe("markdown", () => {
  const anns = [
    ann("definition", "TCP: güvenilir", "", 2, 1),
    ann("question", "OSI kaç katman?", "7", 1, 2),
    ann("exam", "Sınavda | çıkar", "önemli", 2, 3),
  ];
  it("builds a Cornell table with cues, notes by page and a summary", () => {
    const md = cornellNote({ title: "Hafta 1" }, anns);
    expect(md).toContain("# Cornell: Hafta 1");
    expect(md).toContain("| İpuçları | Notlar |");
    expect(md).toContain("| Soru: OSI kaç katman? | **s. 1**<br>**Soru:** OSI kaç katman? _(7)_ |");
    expect(md).toContain("| TCP | **s. 2**<br>**Tanım:** TCP: güvenilir<br>**Sınav:** Sınavda \\| çıkar _(önemli)_ |");
    expect(md).toContain(`## Özet\n\n${SUMMARY_PLACEHOLDER}`);
    expect(md.indexOf("s. 1")).toBeLessThan(md.indexOf("s. 2"));
  });
  it("writes document notes and a course digest by label", () => {
    const md = documentNotes({ title: "Hafta 1" }, anns);
    expect(md).toContain("## Sınav\n\n- s. 2: Sınavda | çıkar\n  - _önemli_");
    expect(md.indexOf("## Sınav")).toBeLessThan(md.indexOf("## Tanım"));
    const dg = courseDigest("Ağlar", [{ doc: { title: "Hafta 1" }, anns }]);
    expect(dg).toContain("## Soru (1)\n\n- Hafta 1, s. 1: OSI kaç katman?");
    expect(courseDigest("Boş", [])).toContain("henüz vurgu yok");
  });
});

describe("course pack", () => {
  it("zips PDFs, notes and digest with safe unique names", () => {
    expect(safeName('a/b:c*?"<>|. ')).toBe("a b c");
    expect(asciiName("Ağ Güvenliği: Şifreleme é")).toBe("Ag Guvenligi Sifreleme e");
    const pdf = new Uint8Array([37, 80, 68, 70]);
    const { zip, missing } = buildCoursePack("Ağlar", [
      { doc: { title: "Hafta 1: Giriş" }, anns: [ann("exam", "x")], pdf },
      { doc: { title: "Hafta 1: Giriş" }, anns: [], pdf: null },
    ]);
    const files = unzipSync(zip);
    expect(Object.keys(files).filter((k) => !k.endsWith("/")).sort()).toEqual([
      "Ağlar/Ağlar - renk özeti.md",
      "Ağlar/notlar/Hafta 1 Giriş (2).md",
      "Ağlar/notlar/Hafta 1 Giriş.md",
      "Ağlar/pdf/Hafta 1 Giriş.pdf",
    ]);
    expect(files["Ağlar/pdf/Hafta 1 Giriş.pdf"]).toEqual(pdf);
    expect(strFromU8(files["Ağlar/Ağlar - renk özeti.md"])).toContain("## Sınav (1)");
    expect(missing).toEqual(["Hafta 1: Giriş"]);
  });
});

describe("study repo", () => {
  it("lists cards, saves reviews, exam highlights, progress and Cornell notes", async () => {
    const repo = await freshRepo();
    const study = new StudyRepo(repo.db);
    const c = await repo.addCourse("Ağlar");
    const d1 = await repo.addDocument({ courseId: c, title: "Hafta 2: Katmanlar", filePath: "a.pdf", fileHash: "a" });
    const d2 = await repo.addDocument({ courseId: null, title: "Özet", filePath: "b.pdf", fileHash: "b", readStatus: "read" });
    const t = await repo.addAnnotation({ documentId: d1, page: 3, rects: [], label: "definition", text: "TCP: güvenilir" });
    await repo.addAnnotation({ documentId: d1, page: 1, rects: [], label: "question", text: "Kaç katman?", comment: "7" });
    await repo.addAnnotation({ documentId: d1, page: 2, rects: [], label: "exam", text: "Sınav konusu" });
    await repo.addAnnotation({ documentId: d2, page: 1, rects: [], label: "question", text: "Boş?" });

    const today = "2026-10-29";
    let cards = await study.listCards(c, today);
    expect(cards.map((x) => x.front)).toEqual(["Kaç katman?", "TCP"]);
    expect(cards.every((x) => x.box === 1 && x.due === today)).toBe(true);
    expect((await study.listCards(null, today)).find((x) => x.front === "Boş?")?.hasAnswer).toBe(false);

    await study.saveReview(t, review(newCardState(today), true, today));
    cards = await study.listCards(c, today);
    expect(cards.find((x) => x.annotationId === t)).toMatchObject({ box: 2, due: "2026-10-31", lastReviewed: today });

    const exam = await study.examHighlights(c);
    expect(exam.map((e) => [e.ann.text, e.doc.title, e.doc.id])).toEqual([["Sınav konusu", "Hafta 2: Katmanlar", d1]]);

    expect(await study.courseProgress()).toEqual([
      { courseId: c, name: "Ağlar", read: 0, total: 1 },
      { courseId: null, name: "Derssiz", read: 1, total: 1 },
    ]);

    const doc = (await repo.getDocument(d1))!;
    await study.createCornellNote(doc);
    const [note] = await repo.listNotes({ documentId: d1 });
    expect(note).toMatchObject({ kind: "template", title: "Cornell: Hafta 2: Katmanlar", courseId: c });
    expect(note.body).toContain("| TCP |");

    const pack = await study.packDocuments(c, async (rel) => {
      if (rel === "a.pdf") return new Uint8Array([1]);
      throw new Error("yok");
    });
    expect(pack.map((p) => [p.doc.title, p.anns.length, p.pdf?.length])).toEqual([["Hafta 2: Katmanlar", 3, 1]]);

    await repo.deleteAnnotation(t); // review row goes with the card
    expect((await repo.db.all("SELECT * FROM card_review")).length).toBe(0);
  });
});
