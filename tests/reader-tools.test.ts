import { describe, expect, it } from "vitest";
import { ImageRepo } from "../src/core/imageRepo";
import { INK_KINDS, asInkKind, hitsStroke, isHexColor, strokeWidth, type InkPoint } from "../src/core/ink";
import { InkRepo } from "../src/core/inkRepo";
import { centeredRect, imageExt, imageMime, moveRect, resizeRect } from "../src/core/pageImage";
import { findHits, firstHitFrom, fold, hitsPerPage, matchesIn } from "../src/core/search";
import { freshRepo } from "./helpers";

const pt = (x: number, y: number, p = 0.5): InkPoint => ({ x, y, p });

describe("ink kinds", () => {
  it("has ten distinct colours per kind and three widths", () => {
    for (const k of Object.values(INK_KINDS)) {
      expect(k.colors.length).toBeGreaterThanOrEqual(10);
      expect(new Set(k.colors.map((c) => c.color)).size).toBe(k.colors.length);
      expect(k.colors.every((c) => isHexColor(c.color))).toBe(true);
      expect(k.widths[0]).toBeLessThan(k.widths[1]);
      expect(k.widths[1]).toBeLessThan(k.widths[2]);
    }
    expect(INK_KINDS.pencil.widths[1]).toBeLessThan(INK_KINDS.pen.widths[1]);
    expect(INK_KINDS.highlighter.widths[0]).toBeGreaterThan(INK_KINDS.pen.widths[2]);
  });

  it("ignores pressure for the highlighter and hits its whole body", () => {
    const hl = { kind: "highlighter" as const, width: 0.02, points: [pt(0.1, 0.5, 1), pt(0.5, 0.5, 1)] };
    expect(strokeWidth(hl, 1000)).toBe(20);
    expect(hitsStroke(hl, { x: 0.3, y: 0.515 })).toBe(false);
    expect(hitsStroke(hl, { x: 0.3, y: 0.509 })).toBe(true);
    expect(hitsStroke({ points: hl.points }, { x: 0.3, y: 0.515 })).toBe(false);
  });

  it("parses kinds and colours defensively", () => {
    expect(asInkKind("highlighter")).toBe("highlighter");
    expect(asInkKind("laser")).toBe("pen");
    expect(asInkKind(null)).toBe("pen");
    expect(isHexColor("#ffe14d")).toBe(true);
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor('#000" onload="x')).toBe(false);
  });

  it("stores the kind per stroke; old rows default to pen", async () => {
    const repo = await freshRepo();
    const d = await repo.addDocument({ courseId: null, title: "x", filePath: "docs/x.pdf", fileHash: "x" });
    const ink = new InkRepo(repo.db);
    await ink.add({ documentId: d, page: 1, color: "#ffe14d", width: 0.014, points: [pt(0.1, 0.1)], kind: "highlighter" });
    await repo.db.run("INSERT INTO ink_stroke (document_id, page, color, width, points) VALUES (?, 1, '#000000', 0.002, '[]')", [d]);
    expect((await ink.list(d)).map((s) => s.kind)).toEqual(["highlighter", "pen"]);
  });
});

describe("page images", () => {
  it("knows picture files", () => {
    expect(imageExt("Foto.JPG")).toBe("jpg");
    expect(imageExt("notes.pdf")).toBeNull();
    expect(imageMime("images/a.jpg")).toBe("image/jpeg");
    expect(imageMime("images/a.webp")).toBe("image/webp");
  });

  it("centres a picture and keeps its aspect", () => {
    // A square picture on a portrait A4-like page: limited by width.
    const r = centeredRect(100, 100, 600, 800);
    expect(r.w).toBeCloseTo(0.5);
    expect(r.h * 800).toBeCloseTo(r.w * 600);
    expect(r.x).toBeCloseTo(0.25);
    // A tall picture: limited by height.
    const t = centeredRect(100, 400, 600, 800);
    expect(t.h).toBeCloseTo(0.5);
    expect((t.h * 800) / (t.w * 600)).toBeCloseTo(4);
  });

  it("moves inside the page and resizes with the same aspect", () => {
    const r = { x: 0.2, y: 0.2, w: 0.4, h: 0.2 };
    expect(moveRect(r, 0.1, 0.1)).toEqual({ x: 0.30000000000000004, y: 0.30000000000000004, w: 0.4, h: 0.2 });
    expect(moveRect(r, 1, -1)).toEqual({ x: 0.6, y: 0, w: 0.4, h: 0.2 });
    const big = resizeRect(r, 0.2);
    expect(big.w).toBeCloseTo(0.6);
    expect(big.h).toBeCloseTo(0.3);
    expect(resizeRect(r, 5).w).toBeCloseTo(0.8); // stops at the page edge
    expect(resizeRect(r, -5).w).toBeCloseTo(0.04);
  });

  it("stores, moves and removes pictures per document", async () => {
    const repo = await freshRepo();
    const d = await repo.addDocument({ courseId: null, title: "x", filePath: "docs/x.pdf", fileHash: "x" });
    const images = new ImageRepo(repo.db);
    const id = await images.add({ documentId: d, page: 2, filePath: "images/abc.png", x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
    expect(await images.list(d)).toEqual([{ id, documentId: d, page: 2, filePath: "images/abc.png", x: 0.1, y: 0.2, w: 0.3, h: 0.4 }]);
    await images.move(id, { x: 0.5, y: 0.5, w: 0.2, h: 0.1 });
    expect((await images.list(d))[0]).toMatchObject({ x: 0.5, y: 0.5, w: 0.2, h: 0.1 });
    expect(await images.inUse("images/abc.png")).toBe(true);
    await images.remove(id);
    expect(await images.list(d)).toEqual([]);
    expect(await images.inUse("images/abc.png")).toBe(false);
  });

  it("goes away with its document", async () => {
    const repo = await freshRepo();
    const d = await repo.addDocument({ courseId: null, title: "x", filePath: "docs/x.pdf", fileHash: "x" });
    const images = new ImageRepo(repo.db);
    await images.add({ documentId: d, page: 1, filePath: "images/a.png", x: 0, y: 0, w: 0.1, h: 0.1 });
    await repo.db.run("DELETE FROM document WHERE id = ?", [d]);
    expect(await images.list(d)).toEqual([]);
  });
});

describe("search", () => {
  it("folds case, accents and Turkish dotted/dotless i, keeping offsets", () => {
    expect(fold("IŞIK İzmir Çay")).toBe("isik izmir cay");
    expect(fold("Ağ katmanı").length).toBe("Ağ katmanı".length);
  });

  it("finds every hit across pages in order", () => {
    const pages = ["OSI modeli kaç katmandır?", "Katman yok", "", "katman katman"];
    const hits = findHits(pages, "katman");
    expect(hits).toEqual([
      { page: 1, index: 15 },
      { page: 2, index: 0 },
      { page: 4, index: 0 },
      { page: 4, index: 7 },
    ]);
    expect(hitsPerPage(hits)).toEqual([{ page: 1, count: 1 }, { page: 2, count: 1 }, { page: 4, count: 2 }]);
    expect(firstHitFrom(hits, 3)).toBe(2);
    expect(firstHitFrom(hits, 9)).toBe(0);
    expect(findHits(pages, "   ")).toEqual([]);
    expect(findHits(["Kapsülleme sınavda çıkar"], "SINAVDA CIKAR")).toEqual([{ page: 1, index: 11 }]);
  });

  it("finds matches inside one span", () => {
    expect(matchesIn("Protokol: iletişim protokolü", "protokol")).toEqual([0, 19]);
    expect(matchesIn("abc", "")).toEqual([]);
  });
});
