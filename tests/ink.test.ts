import { describe, expect, it } from "vitest";
import { hitsStroke, simplify, strokePath, strokeWidth, type InkPoint } from "../src/core/ink";
import { InkRepo } from "../src/core/inkRepo";
import { freshRepo } from "./helpers";

const pt = (x: number, y: number, p = 0.5): InkPoint => ({ x, y, p });

describe("ink", () => {
  it("simplifies straight runs and keeps corners", () => {
    const line = Array.from({ length: 20 }, (_, i) => pt(i / 100, 0.1));
    expect(simplify(line)).toEqual([pt(0, 0.1), pt(0.19, 0.1)]);
    const corner = [pt(0, 0), pt(0.05, 0), pt(0.1, 0), pt(0.1, 0.05), pt(0.1, 0.1)];
    expect(simplify(corner).map((q) => [q.x, q.y])).toEqual([[0, 0], [0.1, 0], [0.1, 0.1]]);
  });

  it("builds a path in pixels and a pressure-based width", () => {
    expect(strokePath([pt(0.1, 0.2), pt(0.5, 0.5)], 100, 200)).toBe("M10.0 40.0L50.0 100.0");
    expect(strokePath([pt(0, 0), pt(0.5, 0.5), pt(1, 0)], 100, 100)).toBe("M0.0 0.0Q50.0 50.0 75.0 25.0L100.0 0.0");
    expect(strokeWidth({ width: 0.01, points: [pt(0, 0, 0.5)] }, 1000)).toBe(10);
    expect(strokeWidth({ width: 0.01, points: [pt(0, 0, 1)] }, 1000)).toBe(15);
  });

  it("hit-tests for the eraser", () => {
    const s = { points: [pt(0.1, 0.1), pt(0.5, 0.1)] };
    expect(hitsStroke(s, { x: 0.3, y: 0.105 })).toBe(true);
    expect(hitsStroke(s, { x: 0.3, y: 0.2 })).toBe(false);
  });

  it("stores strokes per document", async () => {
    const repo = await freshRepo();
    const d = await repo.addDocument({ courseId: null, title: "x", filePath: "docs/x.pdf", fileHash: "x" });
    const ink = new InkRepo(repo.db);
    const id = await ink.add({ documentId: d, page: 2, color: "#000", width: 0.003, points: [pt(0.1, 0.1), pt(0.2, 0.2, 0.9)] });
    expect((await ink.list(d))[0]).toMatchObject({ id, page: 2, points: [pt(0.1, 0.1), pt(0.2, 0.2, 0.9)] });
    await ink.update(id, { page: -3, points: [pt(0.3, 0.3)] });
    expect((await ink.list(d))[0]).toMatchObject({ id, page: -3, points: [pt(0.3, 0.3)] });
    await ink.remove(id);
    expect(await ink.list(d)).toEqual([]);
  });
});
