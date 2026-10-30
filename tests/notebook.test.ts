import { describe, expect, it } from "vitest";
import { InkRepo } from "../src/core/inkRepo";
import {
  NotebookRepo, PAPER_KINDS, isNotebookKey, notebookId, notebookKey, paperBackground, swapPos, type NotebookPage,
} from "../src/core/notebook";
import { blankKey, isBlankKey } from "../src/core/pages";
import { freshRepo } from "./helpers";

describe("notebook keys and paper", () => {
  it("keeps notebook keys apart from PDF and blank page keys", () => {
    const k = notebookKey(7);
    expect(isNotebookKey(k)).toBe(true);
    expect(notebookId(k)).toBe(7);
    expect(isNotebookKey(blankKey(7))).toBe(false);
    expect(isNotebookKey(3)).toBe(false);
    expect(isBlankKey(k)).toBe(true); // still negative: never a PDF page
  });

  it("draws each paper with CSS, scaled to the page width", () => {
    expect(PAPER_KINDS.map((p) => p.name)).toEqual(["Düz", "Kareli", "Çizgili", "Noktalı"]);
    expect(paperBackground("plain", 600).image).toBe("none");
    expect(paperBackground("grid", 210).size).toBe("5px 5px");
    expect(paperBackground("grid", 420).size).toBe("10px 10px");
    expect(paperBackground("lined", 210).size).toBe("100% 8px");
    expect(paperBackground("dots", 210).image).toContain("radial-gradient");
    expect(paperBackground("grid", 0).image).toBe("none");
  });

  it("swaps a page with its neighbour, not past the ends", () => {
    const p = (id: number, pos: number): NotebookPage => ({ id, key: notebookKey(id), kind: "plain", pos });
    const pages = [p(1, 0), p(2, 1), p(3, 2)];
    expect(swapPos(pages, notebookKey(2), -1)?.map((x) => [x.id, x.pos])).toEqual([[2, 0], [1, 1]]);
    expect(swapPos(pages, notebookKey(1), -1)).toBeNull();
    expect(swapPos(pages, notebookKey(3), 1)).toBeNull();
    expect(swapPos(pages, 5, 1)).toBeNull();
  });
});

describe("notebook in the database", () => {
  it("starts with one plain page, adds, moves and deletes pages with their ink", async () => {
    const repo = await freshRepo();
    const course = await repo.addCourse("Ağlar");
    const doc = await repo.addDocument({ courseId: course, title: "TCP", filePath: "a.pdf", fileHash: "a" });
    const other = await repo.addDocument({ courseId: course, title: "UDP", filePath: "b.pdf", fileHash: "b" });
    const nb = new NotebookRepo(repo.db);
    const ink = new InkRepo(repo.db);

    const first = await nb.open(doc);
    expect(first.map((p) => p.kind)).toEqual(["plain"]);
    expect(await nb.open(doc)).toEqual(first); // opening again adds nothing
    expect(await nb.list(other)).toEqual([]);

    const grid = await nb.add(doc, "grid");
    const lined = await nb.add(doc, "lined");
    expect((await nb.list(doc)).map((p) => p.kind)).toEqual(["plain", "grid", "lined"]);
    await nb.move(doc, lined, -1);
    expect((await nb.list(doc)).map((p) => p.kind)).toEqual(["plain", "lined", "grid"]);

    const stroke = { documentId: doc, color: "#000000", width: 0.002, points: [{ x: 0.1, y: 0.1, p: 0.5 }], kind: "pen" as const };
    await ink.add({ ...stroke, page: grid });
    await ink.add({ ...stroke, page: lined });
    await ink.add({ ...stroke, page: 1 });
    await nb.remove(doc, grid);
    expect((await nb.list(doc)).map((p) => p.key)).toEqual([first[0].key, lined]);
    expect((await ink.list(doc)).map((s) => s.page).sort()).toEqual([1, lined].sort());

    await nb.remove(doc, lined);
    await expect(nb.remove(doc, first[0].key)).rejects.toThrow("son sayfası");
    await expect(nb.remove(doc, 2)).rejects.toThrow();
    // Keys are never reused.
    expect(await nb.add(doc, "dots")).not.toBe(grid);
  });

  it("drops the notebook with its document", async () => {
    const repo = await freshRepo();
    const course = await repo.addCourse("Ağlar");
    const doc = await repo.addDocument({ courseId: course, title: "TCP", filePath: "a.pdf", fileHash: "a" });
    const nb = new NotebookRepo(repo.db);
    await nb.open(doc);
    await repo.db.run("DELETE FROM document WHERE id = ?", [doc]);
    expect(await nb.list(doc)).toEqual([]);
  });
});
