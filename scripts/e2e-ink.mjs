// Shared e2e steps for the reader's "Kalem" group (the pen kinds, colours and width live in its panel).

/** Opens the "Kalem" panel (this takes up the last pen when none is in use) and returns it. */
export async function openPens(page) {
  const panel = page.getByRole("group", { name: "Kalem", exact: true });
  if (!(await panel.isVisible())) await page.getByRole("button", { name: "Kalem", exact: true }).click();
  await panel.waitFor();
  return panel;
}

/** Takes up a pen kind (and colour), then closes the panel. */
export async function pen(page, kind = "Tükenmez", color) {
  const panel = await openPens(page);
  const b = panel.getByRole("button", { name: kind, exact: true });
  if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
  if (color) await panel.getByRole("button", { name: `Renk: ${color}`, exact: true }).click();
  await page.keyboard.press("Escape");
}

/** Puts the pen down. */
export async function penDown(page) {
  await (await openPens(page)).getByRole("button", { name: "Kalemi bırak" }).click();
}

/** Like the old single pen button: takes the kind up, or puts it down when it is already in use. */
export async function penToggle(page, kind = "Tükenmez") {
  const group = page.getByRole("button", { name: "Kalem", exact: true });
  const inUse = (await group.getAttribute("aria-pressed")) === "true" && (await group.getAttribute("title"))?.startsWith(`${kind} ·`);
  await (inUse ? penDown(page) : pen(page, kind));
}
