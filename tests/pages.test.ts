import initSqlJs from "sql.js";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { MIGRATIONS, migrate } from "../src/core/db/migrate";
import { FlagRepo } from "../src/core/exam/flags";
import { buildPdf, hexToRgb, pdfFileName } from "../src/core/exportPdf";
import { InkRepo } from "../src/core/inkRepo";
import {
  PageRepo, blankKey, firstInOrder, insertSpot, keysToRender, keyForInput, letters, pageSlots, pdfPageOf, stepSlot, type InsertedPage,
} from "../src/core/pages";
import { sqljsDb } from "../src/platform/web/sqljsDb";
import { freshRepo } from "./helpers";

const blank = (id: number, anchor: number, pos = 0): InsertedPage => ({ id, anchor, pos, w: 600, h: 800 });

describe("page order", () => {
  it("keeps PDF page numbers as keys and labels blank pages after their page", () => {
    expect(pageSlots(3, []).map((s) => s.key)).toEqual([1, 2, 3]);
    const slots = pageSlots(3, [blank(5, 2, 1), blank(4, 2, 0), blank(7, 0), blank(9, 3)]);
    expect(slots.map((s) => s.label)).toEqual(["a", "1", "2", "2a", "2b", "3", "3a"]);
    expect(slots.map((s) => s.key)).toEqual([-7, 1, 2, -4, -5, 3, -9]);
    expect(letters(0) + letters(25) + letters(26)).toBe("azaa");
  });

  it("shows blank pages of a missing anchor after the last page", () => {
    expect(pageSlots(2, [blank(1, 9)]).map((s) => s.label)).toEqual(["1", "2", "2a"]);
  });

  it("finds the spot before and after PDF and blank pages", () => {
    const ins = [blank(1, 4, 0), blank(2, 4, 1)];
    // After PDF page 4: first in its group.
    expect(insertSpot(ins, 4, "after")).toEqual({ anchor: 4, pos: -1 });
    // Before PDF page 5: last in page 4's group.
    expect(insertSpot(ins, 5, "before")).toEqual({ anchor: 4, pos: 2 });
    expect(insertSpot(ins, 1, "before")).toEqual({ anchor: 0, pos: 0 });
    // Between the two blanks.
    expect(insertSpot(ins, blankKey(1), "after")).toEqual({ anchor: 4, pos: 0.5 });
    expect(insertSpot(ins, blankKey(1), "before")).toEqual({ anchor: 4, pos: -1 });
    expect(insertSpot(ins, blankKey(2), "after")).toEqual({ anchor: 4, pos: 2 });
  });

  it("reads the page box, the reading position and swipes", () => {
    const slots = pageSlots(5, [blank(3, 2)]);
    expect(keyForInput(slots, "4", 5)).toBe(4);
    expect(keyForInput(slots, "99", 5)).toBe(5);
    expect(keyForInput(slots, " 2A ", 5)).toBe(-3);
    expect(keyForInput(slots, "x", 5)).toBeNull();
    expect(pdfPageOf(slots.find((s) => s.key === -3))).toBe(2);
    expect(pdfPageOf(pageSlots(1, [blank(1, 0)])[0])).toBe(1);
    expect(stepSlot(slots, 2, 1)).toBe(-3);
    expect(stepSlot(slots, -3, 1)).toBe(3);
    expect(stepSlot(slots, 1, -1)).toBe(1);
  });

  it("renders visible pages and their neighbours in reading order", () => {
    const slots = pageSlots(4, [blank(3, 2)]);
    expect([...keysToRender(slots, [-3])].sort()).toEqual([-3, 2, 3].sort());
    expect([...keysToRender(slots, [1])].sort()).toEqual([1, 2]);
    expect(firstInOrder(slots, [3, -3])).toBe(-3);
    expect(firstInOrder(slots, [])).toBeNull();
  });
});

describe("blank pages in the database", () => {
  it("inserts, keys layers by the blank key, and deletes the page with its layers only", async () => {
    const repo = await freshRepo();
    const course = await repo.addCourse("Ağlar");
    const doc = await repo.addDocument({ courseId: course, title: "TCP", filePath: "a.pdf", fileHash: "a" });
    const pages = new PageRepo(repo.db);
    const ink = new InkRepo(repo.db);
    const k1 = await pages.insert(doc, 3, "after", { w: 595, h: 842 });
    const k2 = await pages.insert(doc, k1, "after", { w: 595, h: 842 });
    expect(k1).toBeLessThan(0);
    expect(pageSlots(5, await pages.list(doc)).map((s) => s.label)).toEqual(["1", "2", "3", "3a", "3b", "4", "5"]);
    const stroke = { documentId: doc, color: "#000000", width: 0.002, points: [{ x: 0.1, y: 0.1, p: 0.5 }], kind: "pen" as const };
    await ink.add({ ...stroke, page: k1 });
    await ink.add({ ...stroke, page: 3 });
    await new FlagRepo(repo.db).toggle(doc, k1, "important");
    await pages.remove(doc, k1);
    expect((await pages.list(doc)).map((b) => blankKey(b.id))).toEqual([k2]);
    expect((await ink.list(doc)).map((s) => s.page)).toEqual([3]);
    expect((await new FlagRepo(repo.db).forDocument(doc)).size).toBe(0);
    // Keys are never reused, so an old stray row cannot land on a new page.
    const k3 = await pages.insert(doc, 1, "before", { w: 1, h: 1 });
    expect(k3).not.toBe(k1);
    await expect(pages.remove(doc, 2)).rejects.toThrow();
  });

  it("migration 012 keeps old flags and allows the Önemli flag", async () => {
    const db = sqljsDb(await initSqlJs());
    // Run up to 011, write old data, then migrate the rest.
    await db.exec("PRAGMA foreign_keys = ON");
    for (let i = 0; i < 11; i++) await db.exec(`BEGIN;\n${MIGRATIONS[i]}\nPRAGMA user_version = ${i + 1};\nCOMMIT;`);
    await db.run("INSERT INTO course (name) VALUES ('Ağlar')");
    await db.run("INSERT INTO document (course_id, title, file_path, file_hash) VALUES (1, 'TCP', 'a.pdf', 'h')");
    await db.run("INSERT INTO page_flag (document_id, page, kind) VALUES (1, 4, 'stressed')");
    await db.run("INSERT INTO ink_stroke (document_id, page, color, width, points) VALUES (1, 4, '#000000', 0.002, '[]')");
    expect(await migrate(db)).toBe(MIGRATIONS.length);
    const flags = new FlagRepo(db);
    expect((await flags.forDocument(1)).get(4)).toEqual(["stressed"]);
    await flags.toggle(1, 4, "important");
    expect((await flags.forDocument(1)).get(4)).toEqual(["stressed", "important"]);
    expect((await new InkRepo(db).list(1)).map((s) => s.page)).toEqual([4]);
    // Blank-page flags stay out of the exam list (it shows PDF pages).
    await flags.toggle(1, -1, "important");
    expect((await flags.listWithDocs(null)).map((f) => f.page)).toEqual([4, 4]);
  });
});

describe("PDF export", () => {
  it("copies chosen pages in order, adds blank pages and burns in overlays", async () => {
    const src = new Uint8Array(readFileSync("tests/fixtures/Hafta 1_Giris.pdf"));
    const n = (await PDFDocument.load(src)).getPageCount();
    const pages = [
      { pdf: Math.min(2, n), w: 0, h: 0, highlights: [{ rects: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.05 }], color: "#d9b44a" }] },
      { pdf: null, w: 400, h: 500, ink: [{ points: [{ x: 0.1, y: 0.1, p: 0.5 }, { x: 0.5, y: 0.5, p: 0.5 }], color: "#1f4e8c", width: 0.003, kind: "pen" as const }] },
      { pdf: 1, w: 0, h: 0, margin: { right: 0.5, bottom: 0 } },
    ];
    const bytes = await buildPdf(src, pages, "Önemli");
    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(3);
    expect(out.getPage(1).getSize()).toEqual({ width: 400, height: 500 });
    const orig = (await PDFDocument.load(src)).getPage(0).getSize();
    expect(Math.round(out.getPage(2).getSize().width)).toBe(Math.round(orig.width * 1.5));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("names the file in plain ASCII and parses colours", () => {
    expect(pdfFileName("Hafta 3: Ağ Katmanı", "önemli")).toBe("Hafta-3-Ag-Katmani-onemli.pdf");
    expect(hexToRgb("#ff0000")).toEqual({ r: 1, g: 0, b: 0 });
  });
});
