import { migrate } from "../core/db/migrate";
import type { Platform } from "./types";

export const isTauri = () => "__TAURI_INTERNALS__" in globalThis;

/** Picks the host adapter and brings the schema up to date. */
export async function createPlatform(): Promise<Platform> {
  const p = isTauri()
    ? (await import("./tauri")).createTauriPlatform()
    : await (await import("./web")).createWebPlatform();
  await migrate(p.db);
  return p;
}
