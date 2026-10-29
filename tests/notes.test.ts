import { describe, expect, it } from "vitest";
import { digestBody, exportFileName, liveNoteBody } from "../src/core/notes/build";
import { escapeMd, inline, parseAnnotationLink, renderMarkdown } from "../src/core/notes/markdown";
import { NotesRepo } from "../src/core/notes/notesRepo";
import { dueFolders, normaliseFolderPath, WATCH_INTERVAL_MS, type WatchedFolder } from "../src/core/notes/watch";
import type { Annotation } from "../src/core/types";
import { freshRepo } from "./helpers";

const ann = (id: number, page: number, label: Annotation["label"], text: string, comment = "", documentId = 1): Annotation => ({
  id, documentId, page, rects: [], label, text, comment, createdAt: `2026-10-0${id}T00:00:00Z`,
});

describe("markdown", () => {
  it("escapes HTML and renders blocks", () => {
    const html = renderMarkdown("# Başlık <b>\n\nmetin **kalın** ve *eğik*\n\n- a\n- b\n\n1. x\n\n> alıntı\n> ikinci\n\n---");
    expect(html).toBe([
      "<h1>Başlık &lt;b&gt;</h1>",
      "<p>metin <strong>kalın</strong> ve <em>eğik</em></p>",
      "<ul><li>a</li><li>b</li></ul>",
      "<ol><li>x</li></ol>",
      "<blockquote>alıntı<br>ikinci</blockquote>",
      "<hr>",
    ].join("\n"));
  });
  it("keeps only safe links and marks annotation links", () => {
    expect(inline("[s. 3](nito://annotation/12)")).toBe('<a href="nito://annotation/12" data-annotation="12">s. 3</a>');
    expect(inline("[x](javascript:alert(1))")).not.toContain("<a");
    expect(inline("[w](https://a.b/c)")).toContain('target="_blank"');
    expect(inline('<img src=x onerror="y">')).toBe("&lt;img src=x onerror=&quot;y&quot;&gt;");
    expect(parseAnnotationLink("nito://annotation/7")).toBe(7);
    expect(parseAnnotationLink("nito://annotation/7x")).toBeNull();
  });
  it("round-trips escaped text", () => {
    const raw = "a*b* [c](d) _e_ `f` \\";
    expect(inline(escapeMd(raw))).toBe("a*b* [c](d) _e_ `f` \\");
  });
});

describe("generated notes", () => {
  it("live note groups by page with label, link and comment", () => {
    const md = liveNoteBody({ title: "Hafta 2: TCP" }, [
      ann(2, 3, "exam", "üç yollu el sıkışma", "sınavda çıkar"),
      ann(1, 1, "definition", "TCP *güvenilir*"),
    ]);
    expect(md).toContain("## Sayfa 1\n\n> TCP \\*güvenilir\\*\n> — **Tanım** · [s. 1](nito://annotation/1)");
    expect(md.indexOf("## Sayfa 1")).toBeLessThan(md.indexOf("## Sayfa 3"));
    expect(md).toContain("> *Yorum:* sınavda çıkar");
    expect(renderMarkdown(md)).toContain('data-annotation="2"');
    expect(liveNoteBody({ title: "x" }, [])).toContain("henüz vurgu yok");
  });
  it("digest groups by label order, then week, then document", () => {
    const md = digestBody("Ağlar", [
      { doc: { id: 2, title: "Hafta 2: TCP", week: 2 }, annotations: [ann(3, 1, "important", "b", "", 2)] },
      { doc: { id: 1, title: "Hafta 1: Giriş", week: 1 }, annotations: [ann(1, 2, "exam", "a"), ann(2, 4, "important", "c")] },
    ]);
    const order = ["## Önemli (2)", "### Hafta 1", "#### Hafta 1: Giriş", "> c", "### Hafta 2", "> b", "## Sınav (1)", "> a"];
    const idx = order.map((s) => md.indexOf(s));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(md).not.toContain("## Tanım");
  });
  it("makes safe export file names", () => {
    expect(exportFileName("Canlı not: Hafta 2: Ağ Katmanları")).toBe("Canli-not-Hafta-2-Ag-Katmanlari.md");
    expect(exportFileName("***")).toBe("not.md");
  });
});

describe("NotesRepo", () => {
  it("keeps one live note per document and one digest per course", async () => {
    const repo = await freshRepo();
    const notes = new NotesRepo(repo.db);
    const c = await repo.ensureCourse("Ağlar");
    const d = await repo.addDocument({ courseId: c, title: "Hafta 1: Giriş", filePath: "docs/a.pdf", fileHash: "a" });
    const free = await repo.addDocument({ courseId: null, title: "Özet", filePath: "docs/b.pdf", fileHash: "b" });
    const a = await repo.addAnnotation({ documentId: d, page: 2, rects: [], label: "exam", text: "OSI" });
    await repo.addAnnotation({ documentId: free, page: 1, rects: [], label: "important", text: "özet" });

    const live = await notes.refreshLive(d);
    await repo.updateAnnotation(a, { comment: "yedi katman" });
    expect(await notes.refreshLive(d)).toBe(live);
    expect((await notes.get(live))?.body).toContain("yedi katman");
    expect((await notes.get(live))?.courseId).toBe(c);

    const dg = await notes.refreshDigest(c, "Ağlar");
    expect(await notes.refreshDigest(c, "Ağlar")).toBe(dg);
    const none = await notes.refreshDigest(null, "Derssiz");
    expect(none).not.toBe(dg);
    expect(await notes.refreshDigest(null, "Derssiz")).toBe(none);
    expect((await notes.get(none))?.body).toContain("> özet");
    expect((await notes.get(dg))?.body).not.toContain("> özet");

    const f = await notes.addFree(c);
    await notes.update(f, { title: "Benim notum", body: "**x**" });
    expect((await notes.list({ courseId: c })).map((n) => n.kind).sort()).toEqual(["digest", "free", "live"]);
    expect((await notes.list({ kind: "free" })).map((n) => n.title)).toEqual(["Benim notum"]);
    expect((await notes.list({ courseId: null })).map((n) => n.id)).toEqual([none]);

    const t = await notes.annotationTarget(a);
    expect(t?.document.id).toBe(d);
    expect(t?.annotation.page).toBe(2);
    expect(await notes.annotationTarget(9999)).toBeUndefined();
    await notes.remove(f);
    expect(await notes.get(f)).toBeUndefined();
  });
  it("stores watched folders", async () => {
    const notes = new NotesRepo((await freshRepo()).db);
    await notes.addWatched("C:/Dersler", true);
    await notes.addWatched("C:/Dersler", false);
    const [w] = await notes.listWatched();
    expect(w).toMatchObject({ path: "C:/Dersler", recursive: false, lastScan: null });
    await notes.markScanned(w.id, "2026-10-29T10:00:00.000Z");
    expect((await notes.listWatched())[0].lastScan).toBe("2026-10-29T10:00:00.000Z");
    await notes.removeWatched(w.id);
    expect(await notes.listWatched()).toEqual([]);
  });
});

describe("watched folders", () => {
  const f = (id: number, lastScan: string | null): WatchedFolder => ({ id, path: `p${id}`, recursive: true, lastScan });
  it("picks folders that are due", () => {
    const now = Date.parse("2026-10-29T10:00:00Z");
    const ago = (ms: number) => new Date(now - ms).toISOString();
    const due = dueFolders([
      f(1, null),
      f(2, ago(WATCH_INTERVAL_MS - 1000)),
      f(3, ago(WATCH_INTERVAL_MS)),
      f(4, "bozuk"),
      f(5, ago(-60_000)), // clock went back
    ], now);
    expect(due.map((x) => x.id)).toEqual([1, 3, 4, 5]);
  });
  it("normalises paths", () => {
    expect(normaliseFolderPath(' "C:\\Dersler\\Ağlar\\" ')).toBe("C:/Dersler/Ağlar");
    expect(normaliseFolderPath("C:\\")).toBe("C:/");
    expect(normaliseFolderPath("/")).toBe("/");
  });
});
