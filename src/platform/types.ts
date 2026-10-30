// Platform port. One implementation per host: Tauri (real app) and web (dev, tests).
import type { SqlDb } from "../core/db/sql";
import type { SourceFile } from "../core/library/addDocuments";
import type { AiHost } from "./ai";
import type { Transcriber } from "./transcriber";

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
  /** One picture from the device (gallery on mobile). Null when cancelled. */
  pickImage(): Promise<SourceFile | null>;
}

/** Whole-library copy to a folder (e.g. a cloud-drive folder). Desktop and mobile app only. */
export interface Backup {
  /** Asks for a folder and writes a backup into it. Returns the backup path, or null when cancelled. */
  backup(): Promise<string | null>;
  /** Asks for a backup folder and restores it. Returns the safety copy path, or null when cancelled. */
  restore(): Promise<string | null>;
}

export interface Platform {
  name: "tauri" | "web";
  /** Phone or tablet build: desktop-only tools (Whisper, AI) are hidden. */
  mobile: boolean;
  backup?: Backup;
  db: SqlDb;
  storage: Storage;
  pickers: Pickers;
  /** Speech-to-text; undefined where it is not available. See canTranscribe. */
  transcriber?: Transcriber;
  /** Local AI (summary, chat with notes); undefined on Android and iOS, so no AI entry point shows. */
  ai?: AiHost;
  /** Calls back with dropped PDFs (files or folders). Returns an unsubscribe function. */
  onDrop(cb: (files: SourceFile[]) => void): Promise<() => void>;
  /** PDFs of a known folder, without a dialog (watched folders). Web: always empty. */
  listFolder(path: string, recursive: boolean): Promise<SourceFile[]>;
  /** Downloads a picture from a web link (size-limited, checked to be an image). Throws a message for the user. */
  fetchImage(url: string): Promise<Uint8Array>;
  /** Saves a text export. Tauri: storage `exports/<name>`, returns the full path. Web: downloads it, returns null. */
  saveExport(name: string, text: string): Promise<string | null>;
}
