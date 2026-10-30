import { describe, expect, it } from "vitest";
import { escapeHtml, inline, renderMarkdown, richNeeds } from "../src/core/markdown";
import { moveRect, resizeRect } from "../src/core/pageImage";
import {
  ALL_LAYERS, MARGIN_MAX, asMargin, clearMargin, contentExtent, growMargin, isTapeSized, moveWithin, noteRectAt,
  pageBounds, parseLayers, rectFrom, resizeWithin, tapeAt,
} from "../src/core/pageTools";
import { PageToolsRepo } from "../src/core/pageToolsRepo";
import { freshRepo } from "./helpers";

describe("page tool geometry", () => {
  it("builds a rect from a drag in any direction and keeps it on the writable area", () => {
    expect(rectFrom({ x: 0.5, y: 0.6 }, { x: 0.2, y: 0.4 })).toEqual({ x: 0.2, y: 0.4, w: 0.3, h: 0.2 });
    expect(rectFrom({ x: 0.9, y: 0.9 }, { x: 1.4, y: 1.2 })).toEqual({ x: 0.9, y: 0.9, w: 0.1, h: 0.1 });
    expect(rectFrom({ x: 0.9, y: 0.9 }, { x: 1.4, y: 1.2 }, pageBounds({ right: 0.5, bottom: 0 }))).toEqual({ x: 0.9, y: 0.9, w: 0.5, h: 0.1 });
    expect(isTapeSized({ x: 0, y: 0, w: 0.005, h: 0.3 })).toBe(false);
    expect(isTapeSized({ x: 0, y: 0, w: 0.1, h: 0.05 })).toBe(true);
  });

  it("finds the topmost tape under a point", () => {
    const a = { id: 1, x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
    const b = { id: 2, x: 0.3, y: 0.3, w: 0.2, h: 0.2 };
    expect(tapeAt([a, b], { x: 0.35, y: 0.35 })?.id).toBe(2);
    expect(tapeAt([a, b], { x: 0.15, y: 0.15 })?.id).toBe(1);
    expect(tapeAt([a, b], { x: 0.9, y: 0.9 })).toBeNull();
  });

  it("moves and resizes inside the page or the margin", () => {
    const r = { x: 0.8, y: 0.5, w: 0.3, h: 0.1 };
    expect(moveWithin(r, 0.5, 0)).toMatchObject({ x: 0.7 });
    expect(moveWithin(r, 0.5, 0, pageBounds({ right: 0.5, bottom: 0 }))).toMatchObject({ x: 1.2 });
    const big = resizeWithin(r, 1, 1, pageBounds({ right: 0.25, bottom: 0 }));
    expect(big.w).toBeCloseTo(0.45);
    expect(big.h).toBeCloseTo(0.5);
    expect(resizeWithin(r, -1, -1)).toMatchObject({ w: 0.08, h: 0.04 });
    expect(noteRectAt("sticky", { x: 0.95, y: 0.95 })).toMatchObject({ x: 0.76, y: 0.84 });
  });

  it("lets pictures go into the margin with the old defaults unchanged", () => {
    const img = { x: 0.6, y: 0.1, w: 0.3, h: 0.2 };
    expect(moveRect(img, 0.5, 0).x).toBeCloseTo(0.7);
    expect(moveRect(img, 0.5, 0, { w: 1.5, h: 1 }).x).toBeCloseTo(1.1);
    expect(resizeRect(img, 1).w).toBeCloseTo(0.4);
    expect(resizeRect(img, 1, { w: 1.5, h: 1 }).w).toBeCloseTo(0.9);
  });
});

describe("margins", () => {
  it("grows in steps up to the maximum", () => {
    let m = { right: 0, bottom: 0 };
    for (let i = 0; i < 10; i++) m = growMargin(m, "right");
    expect(m).toEqual({ right: MARGIN_MAX, bottom: 0 });
    expect(growMargin({ right: 0, bottom: 0 }, "bottom")).toEqual({ right: 0, bottom: 0.25 });
  });

  it("measures how far content reaches past the page", () => {
    expect(contentExtent([{ x: 0.2, y: 0.2 }, { x: 0.5, y: 0.9, w: 0.2, h: 0.05 }])).toEqual({ right: 0, bottom: 0 });
    expect(contentExtent([{ x: 1.1, y: 0.5 }, { x: 0.9, y: 0.9, w: 0.2, h: 0.3 }])).toEqual({ right: 0.1, bottom: 0.2 });
  });

  it("does not clear a margin that still holds content", () => {
    const m = { right: 0.75, bottom: 0.5 };
    expect(clearMargin(m, "bottom", { right: 0.3, bottom: 0 })).toEqual({ margin: { right: 0.75, bottom: 0 }, kept: false });
    expect(clearMargin(m, "right", { right: 0.3, bottom: 0 })).toEqual({ margin: { right: 0.5, bottom: 0.5 }, kept: true });
  });

  it("parses stored values defensively", () => {
    expect(asMargin(0.5, "x")).toEqual({ right: 0.5, bottom: 0 });
    expect(asMargin(9, -1)).toEqual({ right: MARGIN_MAX, bottom: 0 });
  });
});

describe("layers", () => {
  it("defaults to all visible and keeps only explicit hides", () => {
    expect(parseLayers(null)).toEqual(ALL_LAYERS);
    expect(parseLayers("not json")).toEqual(ALL_LAYERS);
    expect(parseLayers('{"ink":false,"tape":0,"evil":false}')).toEqual({ ...ALL_LAYERS, ink: false });
  });
});

describe("markdown-light", () => {
  it("escapes everything that is not markup we add", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    const html = renderMarkdown('<img src=x onerror="alert(1)"> **kalın** <script>');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("<strong>kalın</strong>");
  });

  it("renders headings, lists, emphasis and inline code", () => {
    expect(renderMarkdown("# Başlık\n- bir\n- *iki*\n\n1. ilk\nmetin `a<b`")).toBe(
      "<h3>Başlık</h3><ul><li>bir</li><li><em>iki</em></li></ul><ol><li>ilk</li></ol><p>metin <code>a&lt;b</code></p>",
    );
    expect(renderMarkdown("satır 1\nsatır 2")).toBe("<p>satır 1<br>satır 2</p>");
    expect(inline("2*3*4 ve a_b_c")).toBe("2*3*4 ve a_b_c");
  });

  it("passes math to the hook and falls back to escaped code", () => {
    const math = (tex: string, display: boolean) => `[${display ? "D" : "I"}:${tex}]`;
    expect(inline("Alan $\\pi r^2$ olur", { math })).toBe("Alan [I:\\pi r^2] olur");
    expect(inline("fiyat 5$ ve 10$", { math })).toBe("fiyat 5$ ve 10$");
    expect(inline("\\$5 ve $x$", { math })).toBe("$5 ve [I:x]");
    expect(renderMarkdown("$$\\int_0^1 x\\,dx$$", { math })).toBe('<div class="math-block">[D:\\int_0^1 x\\,dx]</div>');
    expect(renderMarkdown("$$\na<b\n$$", { math })).toBe('<div class="math-block">[D:a<b]</div>');
    expect(inline("$a<b$")).toBe('<code class="math">a&lt;b</code>');
  });

  it("passes fenced code to the hook with a safe language name", () => {
    const code = (c: string, lang: string) => (lang === "python" ? `<span>${escapeHtml(c)}</span>` : null);
    expect(renderMarkdown("```python\nprint('<hi>')\n```", { code })).toBe(
      '<pre><code class="hljs language-python"><span>print(&#39;&lt;hi&gt;&#39;)</span></code></pre>',
    );
    expect(renderMarkdown('```x"onload=1\n<b>\n```', { code })).toBe('<pre><code class="hljs language-xonload1">&lt;b&gt;</code></pre>');
    expect(renderMarkdown("```\nno end")).toBe('<pre><code class="hljs">no end</code></pre>');
  });

  it("says when KaTeX or highlight.js is needed", () => {
    expect(richNeeds("düz metin")).toEqual({ math: false, code: false });
    expect(richNeeds("$x$")).toEqual({ math: true, code: false });
    expect(richNeeds("a\n```js\nx\n```")).toEqual({ math: false, code: true });
  });
});

describe("page tools repo", () => {
  it("stores tapes, notes and margins and cleans up with the document", async () => {
    const repo = await freshRepo();
    const docId = (await repo.db.run(
      "INSERT INTO document (title, file_path, file_hash, page_count) VALUES ('T', 'documents/t.pdf', 'h', 3)",
    )).lastId;
    const tools = new PageToolsRepo(repo.db);

    const t1 = await tools.addTape(docId, 1, { x: 0.1, y: 0.1, w: 0.2, h: 0.1 });
    await tools.addTape(docId, 2, { x: 0.1, y: 0.1, w: 0.2, h: 0.1 });
    await tools.setRevealed(t1, true);
    expect((await tools.tapes(docId)).map((t) => t.revealed)).toEqual([true, false]);
    await tools.setAllRevealed(docId, false);
    expect((await tools.tapes(docId)).every((t) => !t.revealed)).toBe(true);
    await tools.removeTape(t1);
    expect(await tools.tapes(docId)).toHaveLength(1);

    const n = await tools.addNote(docId, 1, "sticky", { x: 1.1, y: 0.2, w: 0.2, h: 0.1 }, "$x$");
    await tools.updateNote(n, { body: "yeni", collapsed: true, x: 1.2 });
    expect(await tools.notes(docId)).toMatchObject([{ kind: "sticky", body: "yeni", collapsed: true, x: 1.2, page: 1 }]);

    await tools.setMargin(docId, 1, { right: 0.5, bottom: 0 });
    await tools.setMargin(docId, 1, { right: 0.75, bottom: 0.25 });
    await tools.setMargin(docId, 2, { right: 0.25, bottom: 0 });
    await tools.setMargin(docId, 2, { right: 0, bottom: 0 });
    expect([...(await tools.margins(docId))]).toEqual([[1, { right: 0.75, bottom: 0.25 }]]);

    await repo.db.run("DELETE FROM document WHERE id = ?", [docId]);
    expect(await tools.tapes(docId)).toEqual([]);
    expect(await tools.notes(docId)).toEqual([]);
    expect((await tools.margins(docId)).size).toBe(0);
  });
});
