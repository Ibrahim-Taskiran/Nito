// Watched course folders: which ones are due for a rescan.

export interface WatchedFolder {
  id: number;
  path: string;
  recursive: boolean;
  /** ISO time of the last finished scan; null = never scanned. */
  lastScan: string | null;
}

export const WATCH_INTERVAL_MS = 10 * 60 * 1000;

/** Folders never scanned, or scanned at least `intervalMs` ago (or with an unreadable/future time). */
export function dueFolders(folders: WatchedFolder[], nowMs: number, intervalMs = WATCH_INTERVAL_MS): WatchedFolder[] {
  return folders.filter((f) => {
    if (!f.lastScan) return true;
    const t = Date.parse(f.lastScan);
    return Number.isNaN(t) || t > nowMs || nowMs - t >= intervalMs;
  });
}

/** `"C:\Dersler\Ağlar\"` -> "C:/Dersler/Ağlar"; roots ("/", "C:/") stay as they are. */
export function normaliseFolderPath(raw: string): string {
  const p = raw.trim().replace(/^["']|["']$/g, "").replace(/\\/g, "/");
  return /^([A-Za-z]:)?\/$/.test(p) ? p : p.replace(/\/+$/, "");
}
