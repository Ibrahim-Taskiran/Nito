import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TranscriptStore } from "../src/core/transcribe/store";
import { groupParagraphs, parseClock, parseWhisperJson, transcriptMarkdown } from "../src/core/transcribe/transcript";
import { encodeWav, mixToMono } from "../src/core/transcribe/wav";
import { freshRepo } from "./helpers";

// Real whisper-cli -oj output (base model, synthesized lecture speech).
const fixture = readFileSync(new URL("./fixtures/whisper-sample.json", import.meta.url), "utf8");

describe("wav", () => {
  it("writes a 16 kHz mono 16-bit header and clamped samples", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2]), 16000);
    const v = new DataView(wav.buffer);
    const tag = (at: number) => String.fromCharCode(...wav.slice(at, at + 4));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect(v.getUint32(4, true)).toBe(36 + 8);
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint32(28, true)).toBe(32000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(8);
    expect([0, 1, 2, 3].map((i) => v.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 32767]);
  });

  it("mixes channels to mono", () => {
    expect([...mixToMono([new Float32Array([1, 0]), new Float32Array([0, 0, 9])])]).toEqual([0.5, 0]);
  });
});

describe("whisper json", () => {
  it("parses the real fixture into timed segments", () => {
    const segs = parseWhisperJson(fixture);
    expect(segs).toHaveLength(12);
    expect(segs[0]).toMatchObject({ start: 0, end: 7.2 });
    expect(segs[1].start).toBeCloseTo(8.08);
    expect(segs.every((s) => s.text && s.text === s.text.trim())).toBe(true);
  });

  it("falls back to timestamps and skips markers", () => {
    const segs = parseWhisperJson({
      transcription: [
        { timestamps: { from: "00:01:02,500", to: "00:01:04,000" }, text: " Merhaba." },
        { offsets: { from: 0, to: 1000 }, text: " [BLANK_AUDIO]" },
        { offsets: { from: 0, to: 1000 }, text: "  " },
      ],
    });
    expect(segs).toEqual([{ start: 62.5, end: 64, text: "Merhaba." }]);
    expect(parseClock("bad")).toBeNaN();
    expect(parseWhisperJson("{}")).toEqual([]);
  });
});

describe("transcript markdown", () => {
  const seg = (start: number, end: number, text: string) => ({ start, end, text });

  it("groups into 30-60 s paragraphs, breaking at sentence ends", () => {
    const segs = [seg(0, 10, "Bir"), seg(10, 25, "iki."), seg(25, 32, "üç."), seg(32, 50, "dört"), seg(50, 90, "beş"), seg(95, 100, "altı.")];
    expect(groupParagraphs(segs)).toEqual([
      { start: 0, text: "Bir iki. üç." },
      { start: 32, text: "dört beş" },
      { start: 95, text: "altı." },
    ]);
  });

  it("writes ## mm:ss headings", () => {
    const md = transcriptMarkdown(parseWhisperJson(fixture));
    expect(md.startsWith("## 00:00\n\n")).toBe(true);
    expect(md.match(/^## \d\d:\d\d$/gm)!.length).toBeGreaterThanOrEqual(2);
    expect(md).toContain("Normalization removes repeated data.");
    expect(transcriptMarkdown([])).toContain("konuşma bulunamadı");
  });
});

describe("transcript store", () => {
  it("creates a linked transcript note and updates it on re-run", async () => {
    const repo = await freshRepo();
    const course = await repo.addCourse("Veritabanı");
    const doc = await repo.addDocument({ courseId: course, title: "Hafta 3", filePath: "d.pdf", fileHash: "h" });
    const recId = await repo.startRecording(doc, "audio/webm");
    await repo.finishRecording(recId, `recordings/${recId}.webm`, 12);
    const [rec] = await repo.listRecordings(doc);
    const store = new TranscriptStore(repo.db);

    const noteId = await store.save(rec, "Döküm", "## 00:00\n\nnormal form");
    expect((await store.noteIds(doc)).get(rec.id)).toBe(noteId);
    const [note] = await repo.listNotes({ documentId: doc });
    expect(note).toMatchObject({ id: noteId, kind: "transcript", courseId: course, body: "## 00:00\n\nnormal form" });

    expect(await store.save(rec, "Döküm", "yeni")).toBe(noteId);
    expect((await repo.listNotes({ documentId: doc })).map((n) => n.body)).toEqual(["yeni"]);

    await repo.db.run("DELETE FROM note WHERE id = ?", [noteId]);
    expect((await store.noteIds(doc)).size).toBe(0);
  });
});
