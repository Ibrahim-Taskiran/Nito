// Platform port. One implementation per host: Tauri (real app) and web (dev, tests).
import type { SqlDb } from "../core/db/sql";
import type { SourceFile } from "../core/library/addDocuments";

export interface Storage {
  /** Bytes of a file inside app storage (path relative to the storage dir). */
  read(rel: string): Promise<Uint8Array>;
  write(rel: string, data: Uint8Array): Promise<void>;
  remove(rel: string): Promise<void>;
}

export interface Pickers {
  /** File picker with multi-select. Empty when cancelled. */
  pickPdfs(): Promise<SourceFile[]>;
  /** Folder picker. Subfolder names become course names when `recursive`. */
  pickFolder(recursive: boolean): Promise<SourceFile[]>;
}

export interface Platform {
  name: "tauri" | "web";
  db: SqlDb;
  storage: Storage;
  pickers: Pickers;
  /** Calls back with dropped PDFs (files or folders). Returns an unsubscribe function. */
  onDrop(cb: (files: SourceFile[]) => void): Promise<() => void>;
}
