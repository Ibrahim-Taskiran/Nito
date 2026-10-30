import { describe, expect, it } from "vitest";
import { PROMPT_MAX_CHARS, SEED, keyTerms, lecturePrompt } from "../src/core/transcribe/prompt";
import { collapseRepeats, dropHallucinations, type Segment } from "../src/core/transcribe/transcript";
import { normalize } from "../src/core/transcribe/wav";
import { bestWhisperModel, suggestWhisperModel } from "../src/platform/transcriber";

const seg = (text: string, start = 0): Segment => ({ start, end: start + 2, text });

describe("hallucination filter", () => {
  it("drops subtitle credits, thanks and repeated segments", () => {
    const out = dropHallucinations([
      seg("TCP bağlantı kurar."),
      seg("Altyazı M.K."),
      seg("İzlediğiniz için teşekkürler!"),
      seg("Abone olmayı unutmayın."),
      seg("TCP bağlantı kurar."),
      seg("tcp bağlantı kurar"),
      seg("UDP bağlantısızdır."),
      seg("www.example.com"),
    ]);
    expect(out.map((s) => s.text)).toEqual(["TCP bağlantı kurar.", "UDP bağlantısızdır."]);
  });

  it("keeps a long sentence that only mentions a filtered word", () => {
    const long = "Filmlerde altyazı dosyaları zaman damgası taşır ve bu derste bu dosyaların yapısını ayrıntılı olarak inceleyeceğiz.";
    expect(dropHallucinations([seg(long)])).toHaveLength(1);
  });

  it("drops the prompt read back on silence", () => {
    expect(dropHallucinations([seg(SEED), seg("Paket anahtarlama.")], `Ağlar. ${SEED}`).map((s) => s.text)).toEqual(["Paket anahtarlama."]);
  });

  it("collapses repetition loops", () => {
    expect(collapseRepeats("ve sonra ve sonra ve sonra ve sonra ve sonra paket gider")).toBe("ve sonra paket gider");
    expect(collapseRepeats("bir iki bir iki")).toBe("bir iki bir iki");
  });
});

describe("lecture prompt", () => {
  const pages = [
    "Taşıma Katmanı\nTCP ve UDP protokolleri\nTCP üç yollu el sıkışma ile bağlantı kurar. TCP güvenilirdir.",
    "Akış Kontrolü\nTCP pencere boyutu ile akış kontrolü yapar. UDP bağlantısızdır.\nBu bir örnek sayfa ve ders notu.",
  ];
  it("ranks heading words and frequent terms, skips filler", () => {
    const terms = keyTerms(pages, 6);
    expect(terms[0]).toBe("TCP");
    expect(terms).toContain("UDP");
    expect(terms).not.toContain("örnek");
    expect(terms).toContain("Akış");
  });
  it("builds course, title, terms and a punctuated seed within the limit", () => {
    const p = lecturePrompt("Bilgisayar Ağları", "Hafta 5: Taşıma Katmanı", ["TCP", "UDP"]);
    expect(p).toBe(`Bilgisayar Ağları. Hafta 5: Taşıma Katmanı. TCP, UDP. ${SEED}`);
    const many = lecturePrompt(null, "Uzun", Array.from({ length: 200 }, (_, i) => `terim${i}`));
    expect(many.length).toBeLessThanOrEqual(PROMPT_MAX_CHARS);
    expect(many.startsWith("Uzun. terim0, ")).toBe(true);
    expect(many.endsWith(SEED)).toBe(true);
  });
});

describe("audio level", () => {
  it("removes DC offset and raises quiet audio without clipping", () => {
    const out = normalize(new Float32Array([0.3, -0.3, 0.1, -0.1]));
    expect(Math.max(...out.map(Math.abs))).toBeCloseTo(0.9, 5);
    const dc = normalize(new Float32Array([0.5, 0.3]));
    expect([...dc].map((x) => +x.toFixed(5))).toEqual([0.8, -0.8]);
    const loud = normalize(new Float32Array([0.99, -0.99]));
    expect(Math.max(...loud.map(Math.abs))).toBeCloseTo(0.99, 5);
    expect(normalize(new Float32Array([0.001, -0.001]))[0]).toBeCloseTo(0.008, 5);
  });
});

describe("whisper model choice", () => {
  it("suggests the compressed turbo model unless memory is low", () => {
    expect(suggestWhisperModel(null)).toBe("large-v3-turbo-q5_0");
    expect(suggestWhisperModel(8)).toBe("large-v3-turbo-q5_0");
    expect(suggestWhisperModel(2)).toBe("base");
  });
  it("runs the best installed model", () => {
    expect(bestWhisperModel(["base", "large-v3-turbo-q5_0"])).toBe("large-v3-turbo-q5_0");
    expect(bestWhisperModel(["large-v3-turbo", "base"])).toBe("large-v3-turbo");
    expect(bestWhisperModel([])).toBeNull();
  });
});
