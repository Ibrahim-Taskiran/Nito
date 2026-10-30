// E2E for the library: covers, search (Ctrl+K), sort, grid/list, course chips, rename, move, delete, continue reading.
// Needs `npm run dev` (or NITO_URL).
import { chromium } from "@playwright/test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env.NITO_URL ?? "http://localhost:1420";
const fixtures = [
  ...readdirSync("tests/fixtures").filter((f) => f.endsWith(".pdf")).map((f) => resolve("tests/fixtures", f)),
  resolve("tests/fixtures/notes/Hafta 5_Uzun Belge.pdf"),
];
const browser = await chromium.launch({ channel: process.env.NITO_BROWSER ?? "msedge" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const fail = async (msg) => {
  await page.screenshot({ path: "docs/screenshots/e2e-library-fail.png" }).catch(() => {});
  console.error("FAIL:", msg, errors.join("\n"));
  process.exit(1);
};
const check = (ok, msg) => (ok ? console.log("ok:", msg) : fail(msg));
const cards = page.locator("article.card");
const titles = () => cards.locator(".title").allTextContents();
const card = (name) => cards.filter({ has: page.getByRole("button", { name, exact: true }) });
const dialog = page.getByRole("dialog");

await page.goto(url);
const chooser = page.waitForEvent("filechooser");
await page.getByRole("button", { name: "PDF ekle" }).click();
await (await chooser).setFiles(fixtures);
await page.getByRole("status").waitFor();
await page.getByRole("button", { name: "Tamam" }).click().catch(() => {});
check((await cards.count()) === 5, "5 cards after adding");

// Covers: first page rendered into an <img>.
await page.locator("article.card .cover img").first().waitFor({ timeout: 15000 }).catch(() => fail("no cover rendered"));
check(true, "cover thumbnail rendered");

// Search: Ctrl+K focuses the box; Turkish folding ("giris" finds "Giris"/"Giriş").
await page.keyboard.press("Control+k");
check(await page.getByRole("searchbox", { name: "Ara" }).evaluate((el) => el === document.activeElement), "Ctrl+K focuses search");
await page.keyboard.type("katman");
await page.waitForTimeout(100);
check((await cards.count()) === 1 && (await titles())[0].includes("Katmanlar"), "search 'katman' leaves one card");
await page.keyboard.type("xyz");
await page.getByText("ile eşleşen belge yok").waitFor().catch(() => fail("empty search message"));
await page.keyboard.press("Escape");
check((await cards.count()) === 5, "Escape clears search");

// Sort by name.
await page.getByRole("combobox", { name: "Sırala" }).selectOption("name");
const byName = await titles();
const sorted = [...byName].sort((a, b) => a.localeCompare(b, "tr", { numeric: true }));
check(JSON.stringify(byName) === JSON.stringify(sorted), `sort by name: ${byName.join(" | ")}`);

// Grid / list toggle.
await page.getByRole("button", { name: "Liste görünümü" }).click();
check((await cards.count()) === 0 && (await page.locator(".list .row").count()) === 5, "list view shows 5 rows");
await page.screenshot({ path: "docs/screenshots/library-list-light.png" });
await page.getByRole("button", { name: "Izgara görünümü" }).click();
check((await cards.count()) === 5, "grid view back");

// Rename through the right-click menu.
await card(/^Ozet/).click({ button: "right", position: { x: 40, y: 40 } });
await page.getByRole("menuitem", { name: "Yeniden adlandır" }).click();
await dialog.getByRole("textbox").fill("Özet Notları");
await dialog.getByRole("button", { name: "Kaydet" }).click();
await card("Özet Notları").waitFor().catch(() => fail("rename"));
check(true, "rename");

// Move to a new course; the course chip filters.
await card("Özet Notları").click({ button: "right", position: { x: 40, y: 40 } });
await page.getByRole("menuitem", { name: "Derse taşı" }).click();
await dialog.getByRole("combobox").selectOption("new");
await dialog.getByPlaceholder("ör. Veri Yapıları").fill("Ağlar");
await dialog.getByRole("button", { name: "Kaydet" }).click();
const chips = page.getByRole("group", { name: "Ders filtresi" });
await chips.getByRole("button", { name: /Ağlar/ }).click();
await page.waitForTimeout(100);
check((await cards.count()) === 1, "course chip filters to one card");
await chips.getByRole("button", { name: "Tüm dersler" }).click();
await page.waitForTimeout(100);
check((await cards.count()) === 5, "all courses again");

// Delete via the ⋮ button with confirmation.
await card("Özet Notları").hover();
await card("Özet Notları").getByRole("button", { name: "Diğer işlemler" }).click();
await page.getByRole("menuitem", { name: "Sil" }).click();
await dialog.getByRole("button", { name: "Sil" }).click();
await page.waitForTimeout(200);
check((await cards.count()) === 4 && !(await titles()).some((t) => t.includes("Özet")), "delete");

// Continue reading: scroll to page 2 of 3, go back, resume opens at page 2.
const long = card(/Uzun Belge/);
await long.getByRole("button", { name: /Uzun Belge/ }).dblclick();
await page.locator(".textLayer span").first().waitFor();
await page.locator('[data-page="2"]').evaluate((el) => el.scrollIntoView({ block: "start" }));
await page.waitForFunction(() => document.querySelector(".pages")?.textContent?.trim().startsWith("2 /"));
await page.waitForTimeout(1300); // debounce of savePosition
await page.getByRole("button", { name: "← Kütüphane" }).click();
await long.getByRole("button", { name: /Uzun Belge/ }).click();
const resume = page.getByRole("button", { name: /Kaldığın yerden devam et \(s\. 2\)/ });
await resume.waitFor().catch(() => fail("no continue button"));
const pct = await long.locator(".pct").textContent();
check(/^%\d+$/.test(pct ?? ""), `progress label ${pct}`);
await page.screenshot({ path: "docs/screenshots/library-continue-light.png" });
await resume.click();
await page.waitForFunction(() => document.querySelector(".pages")?.textContent?.trim().startsWith("2 /"), null, { timeout: 10000 })
  .catch(() => fail("reader did not open at page 2"));
check(true, "resume opens at page 2");

// Tablet portrait (touch, no detail panel): ⋯ visible, long press opens the menu, tap opens the reader.
const tab = await browser.newPage({ viewport: { width: 800, height: 1100 }, hasTouch: true, isMobile: true });
tab.on("pageerror", (e) => errors.push(e.message));
await tab.goto(url);
const tabChooser = tab.waitForEvent("filechooser");
await tab.getByRole("button", { name: "PDF ekle" }).click();
await (await tabChooser).setFiles([fixtures[0]]);
const tcard = tab.locator("article.card").first();
await tcard.waitFor();
const more = tcard.getByRole("button", { name: "Diğer işlemler" });
const mb = await more.boundingBox();
check((await more.evaluate((el) => getComputedStyle(el).opacity)) === "1" && mb.width >= 40 && mb.height >= 40, "⋯ visible with 40px hit area");
check(await tab.getByRole("searchbox", { name: "Ara" }).isVisible(), "search box visible on tablet");
const cb = await tcard.locator(".cover").boundingBox();
const cdp = await tab.context().newCDPSession(tab);
const pt = [{ x: cb.x + cb.width / 2, y: cb.y + cb.height / 2 }];
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt });
await tab.waitForTimeout(700);
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await tab.getByRole("menu", { name: "Belge işlemleri" }).waitFor({ timeout: 3000 }).catch(() => fail("long press menu"));
check(true, "long press opens the menu");
await tab.screenshot({ path: "docs/screenshots/library-tablet-light.png" });
await tab.keyboard.press("Escape");
await tcard.locator(".cover").tap();
await tab.locator(".textLayer span").first().waitFor({ timeout: 10000 }).catch(() => fail("tap did not open the reader"));
check(true, "tap opens the reader on tablet");

await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("e2e-library: all passed");
