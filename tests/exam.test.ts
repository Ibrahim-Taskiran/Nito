import { describe, expect, it } from "vitest";
import { FlagRepo, examItems, examWeeks, flagInfo, sortFlags } from "../src/core/exam/flags";
import { labelInfo } from "../src/core/labels";
import { useCustomNames } from "../src/core/names";
import { freshRepo } from "./helpers";

async function setup() {
  const repo = await freshRepo();
  const net = await repo.addCourse("Ağlar");
  const os = await repo.addCourse("İşletim");
  const w3 = await repo.addDocument({ courseId: net, title: "Hafta 3: TCP", week: 3, filePath: "a.pdf", fileHash: "a" });
  const w1 = await repo.addDocument({ courseId: net, title: "Hafta 1: Giriş", week: 1, filePath: "b.pdf", fileHash: "b" });
  const other = await repo.addDocument({ courseId: os, title: "Süreçler", filePath: "c.pdf", fileHash: "c" });
  return { repo, flags: new FlagRepo(repo.db), net, os, w3, w1, other };
}

describe("page flags", () => {
  it("toggles a flag on and off and keeps the fixed order", async () => {
    const { flags, w3 } = await setup();
    expect(await flags.toggle(w3, 4, "unclear")).toBe(true);
    expect(await flags.toggle(w3, 4, "stressed")).toBe(true);
    expect((await flags.forDocument(w3)).get(4)).toEqual(["stressed", "unclear"]);
    expect(await flags.toggle(w3, 4, "unclear")).toBe(false);
    expect((await flags.forDocument(w3)).get(4)).toEqual(["stressed"]);
    expect(sortFlags(["unclear", "candidate", "stressed"])).toEqual(["stressed", "candidate", "unclear"]);
  });

  it("builds the exam list from flags and Sınav highlights, filtered by course, kind and week", async () => {
    const { repo, flags, net, w3, w1, other } = await setup();
    await flags.toggle(w3, 7, "candidate");
    await flags.toggle(w3, 2, "stressed");
    await flags.toggle(w1, 5, "unclear");
    await flags.toggle(other, 1, "candidate");
    await repo.addAnnotation({ documentId: w3, page: 7, rects: [], label: "exam", text: "Üçlü el sıkışma" });
    await repo.addAnnotation({ documentId: w1, page: 9, rects: [], label: "exam", text: "OSI" });
    await repo.addAnnotation({ documentId: w1, page: 9, rects: [], label: "important", text: "not exam" });

    const all = examItems(await flags.listWithDocs(net), await flags.examHighlights(net));
    // Week 1 first, then week 3; pages ascending; flags and highlights of one page share a row.
    expect(all.map((i) => `${i.doc.week}:${i.page}`)).toEqual(["1:5", "1:9", "3:2", "3:7"]);
    expect(all[3].flags).toEqual(["candidate"]);
    expect(all[3].highlights.map((a) => a.text)).toEqual(["Üçlü el sıkışma"]);
    expect(examWeeks(all)).toEqual([1, 3]);

    const everyCourse = examItems(await flags.listWithDocs(null), await flags.examHighlights(null));
    expect(everyCourse).toHaveLength(5);

    const cand = examItems(await flags.listWithDocs(net), await flags.examHighlights(net), { kind: "candidate", week: null });
    expect(cand.map((i) => i.page)).toEqual([7]);
    const exam = examItems(await flags.listWithDocs(net), await flags.examHighlights(net), { kind: "exam", week: 1 });
    expect(exam.map((i) => `${i.doc.week}:${i.page}`)).toEqual(["1:9"]);
  });

  it("drops flags with the document", async () => {
    const { repo, flags, w3 } = await setup();
    await flags.toggle(w3, 1, "candidate");
    await repo.db.run("DELETE FROM document WHERE id = ?", [w3]);
    expect(await flags.listWithDocs(null)).toEqual([]);
  });
});

describe("custom names", () => {
  it("renames labels and flags from the store; blank brings the default back", () => {
    const store: Record<string, string | undefined> = {};
    useCustomNames(store);
    store["flag.unclear"] = "Tekrar bak";
    store["label.exam"] = "  ";
    expect(flagInfo("unclear").name).toBe("Tekrar bak");
    expect(flagInfo("unclear").defaultName).toBe("Anlaşılmadı");
    expect(labelInfo("exam").name).toBe("Sınav");
    useCustomNames({});
    expect(flagInfo("unclear").name).toBe("Anlaşılmadı");
  });
});
