import { describe, expect, it } from "vitest";
import { cardsPrompt, extractJson, pageRangeText, parseCards } from "../src/core/ai/cards";
import { isoDay } from "../src/core/study/cards";
import { buildQuiz, seededRng } from "../src/core/study/quiz";
import { StudyRepo } from "../src/core/study/studyRepo";
import { freshRepo } from "./helpers";

const answer = `Tabii, işte kartlar:
\`\`\`json
{"cards":[
  {"term":"TCP","definition":"Bağlantı yönelimli, güvenilir iletim protokolü.","page":2},
  {"term":"tcp","definition":"tekrar","page":2},
  {"term":"UDP: protokol","definition":"Bağlantısız ve hızlı.","page":"3"},
  {"term":"","definition":"boş terim"},
  {"question":"DNS genelde hangi protokolü kullanır?","answer":"UDP","wrong":["TCP","ICMP","udp"],"page":3}
],
"questions":[
  {"question":"TCP bağlantıyı nasıl kurar?","answer":"Üçlü el sıkışma","wrong":["Tek paket","İkili el sıkışma"],"page":99}
]}
\`\`\`
Başka bir şey ister misin?`;

describe("AI cards", () => {
  it("parses a chatty, fenced answer and validates every item", () => {
    const { cards, skipped } = parseCards(answer, 2, 4);
    expect(skipped).toBe(2); // duplicate "tcp" and the empty term
    expect(cards).toEqual([
      { kind: "term", term: "TCP", definition: "Bağlantı yönelimli, güvenilir iletim protokolü.", page: 2 },
      { kind: "term", term: "UDP - protokol", definition: "Bağlantısız ve hızlı.", page: 3 },
      { kind: "mc", question: "TCP bağlantıyı nasıl kurar?", answer: "Üçlü el sıkışma", wrong: ["Tek paket", "İkili el sıkışma"], page: 2 },
      { kind: "mc", question: "DNS genelde hangi protokolü kullanır?", answer: "UDP", wrong: ["TCP", "ICMP"], page: 3 },
    ]);
  });

  it("explains broken or empty answers in Turkish", () => {
    expect(() => parseCards("Üzgünüm, yapamam.", 1, 1)).toThrow(/okunamadı/);
    expect(() => parseCards('{"cards": [', 1, 1)).toThrow(/okunamadı/);
    expect(() => parseCards('{"cards": []}', 1, 1)).toThrow(/kart üretmedi/);
    expect(extractJson('[{"term":"a","definition":"b"}]')).toEqual([{ term: "a", definition: "b" }]);
    expect(parseCards('[{"term":"a","definition":"b"}]', 5, 6).cards[0].page).toBe(5);
  });

  it("sends only the chosen pages, labelled with their real numbers", () => {
    const pages = ["bir", "iki  metin", "üç", "dört"];
    expect(pageRangeText(pages, 2, 3)).toBe("[s. 2] iki metin\n[s. 3] üç");
    const msgs = cardsPrompt("Hafta 5", pages, 2, 3);
    expect(msgs[0].content).toContain('"questions"');
    expect(msgs[1].content).toContain("(s. 2–3)");
    expect(msgs[1].content).not.toContain("dört");
  });

  it("saves drafts as Leitner cards and the quiz uses the AI wrong options", async () => {
    const repo = await freshRepo();
    const doc = await repo.addDocument({ courseId: null, title: "Hafta 5", filePath: "a.pdf", fileHash: "a" });
    const study = new StudyRepo(repo.db);
    const { cards: drafts } = parseCards(answer, 2, 4);
    const ids = await study.saveAiCards(doc, drafts);
    expect(ids).toHaveLength(4);
    const cards = await study.listCards(null, isoDay(new Date()));
    // Page order: s. 2 cards first.
    expect(cards.map((c) => c.front)).toEqual(["TCP", "TCP bağlantıyı nasıl kurar?", "UDP - protokol", "DNS genelde hangi protokolü kullanır?"]);
    expect(cards[0].back).toBe("TCP: Bağlantı yönelimli, güvenilir iletim protokolü.");
    expect(cards[1]).toMatchObject({ back: "Üçlü el sıkışma", hasAnswer: true, wrong: ["Tek paket", "İkili el sıkışma"] });
    const q = buildQuiz(cards.filter((c) => c.label === "question"), seededRng(1)).find((x) => x.card.front.startsWith("TCP"))!;
    expect(q.options).toHaveLength(4); // answer + 2 own wrong options + 1 other card's answer
    expect(q.options).toEqual(expect.arrayContaining(["Üçlü el sıkışma", "Tek paket", "İkili el sıkışma", "UDP"]));
    expect(q.options[q.answer]).toBe("Üçlü el sıkışma");
  });
});
