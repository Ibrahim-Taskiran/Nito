// Watched course folders: rescans each folder on start and every 10 minutes through the normal add flow.
import { addDocuments, summaryText } from "../core/library/addDocuments";
import { NotesRepo } from "../core/notes/notesRepo";
import { dueFolders, normaliseFolderPath, type WatchedFolder } from "../core/notes/watch";
import type { Id } from "../core/types";
import type { Library } from "./library.svelte";

const TICK_MS = 60_000;

export class FolderWatcher {
  folders = $state<WatchedFolder[]>([]);
  /** Folder id being scanned right now. */
  scanning = $state<Id | null>(null);
  /** id -> summary of its last scan in this session. */
  results = $state<Record<Id, string>>({});
  private readonly repo: NotesRepo;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(readonly lib: Library) {
    this.repo = new NotesRepo(lib.platform.db);
  }

  start(): void {
    if (this.timer) return;
    void this.scanDue();
    this.timer = setInterval(() => void this.scanDue(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async reload(): Promise<void> {
    this.folders = await this.repo.listWatched();
  }

  async add(rawPath: string, recursive: boolean): Promise<void> {
    const path = normaliseFolderPath(rawPath);
    if (!path) return;
    await this.repo.addWatched(path, recursive);
    await this.reload();
    const f = this.folders.find((x) => x.path === path);
    if (f) await this.scan(f);
  }

  async remove(id: Id): Promise<void> {
    await this.repo.removeWatched(id);
    await this.reload();
  }

  async scanDue(now = Date.now()): Promise<void> {
    await this.reload();
    for (const f of dueFolders(this.folders, now)) await this.scan(f);
  }

  async scan(f: WatchedFolder): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.scanning = f.id;
    try {
      const files = await this.lib.platform.listFolder(f.path, f.recursive);
      const r = await addDocuments(this.lib.repo, files);
      this.results[f.id] = files.length ? summaryText(r) : "PDF bulunamadı";
      if (r.added.length) await this.lib.refresh();
    } catch (e) {
      this.results[f.id] = `Taranamadı: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      await this.repo.markScanned(f.id);
      await this.reload();
      this.scanning = null;
      this.busy = false;
    }
  }
}

const watchers = new WeakMap<Library, FolderWatcher>();

/** One watcher per library; main.ts starts it, the notes view shows it. */
export function watcherFor(lib: Library): FolderWatcher {
  let w = watchers.get(lib);
  if (!w) watchers.set(lib, (w = new FolderWatcher(lib)));
  return w;
}
