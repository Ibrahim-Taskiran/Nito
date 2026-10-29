// Screenshots of the main screens in light and dark. Needs `npm run dev` on port 1420.
import { chromium } from "@playwright/test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env.NITO_URL ?? "http://localhost:1420";
const fixtures = readdirSync("tests/fixtures").filter((f) => f.endsWith(".pdf")).map((f) => resolve("tests/fixtures", f));
// Edge ships with Windows, so no browser download is needed.
const browser = await chromium.launch({ channel: process.env.NITO_BROWSER ?? "msedge" });
const errors = [];

for (const scheme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: scheme });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(url);
  await page.getByRole("heading", { name: "Kütüphanen boş" }).waitFor();
  await page.screenshot({ path: `docs/screenshots/empty-${scheme}.png` });

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "PDF ekle" }).click();
  await (await chooser).setFiles([...fixtures, fixtures[0]]);
  await page.getByRole("status").waitFor();
  console.log(scheme, "summary:", await page.getByRole("status").locator("span").textContent());
  await page.getByRole("button", { name: /Hafta 2/ }).click();
  await page.screenshot({ path: `docs/screenshots/library-${scheme}.png` });
  await page.close();
}
await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
