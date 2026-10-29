// Web platform: sql.js in memory, files kept in a Map. For `npm run dev` and e2e tests.
import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type { SourceFile } from "../../core/library/addDocuments";
import type { Platform } from "../types";
import { sqljsDb } from "./sqljsDb";

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function createWebPlatform(): Promise<Platform> {
  const db = sqljsDb(await initSqlJs({ locateFile: () => wasmUrl }));
  const files = new Map<string, Uint8Array>();

  const source = (file: File, folder: string | null): SourceFile => ({
    name: file.name,
    folder,
    hash: async () => toHex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())),
    store: async (rel) => void files.set(rel, new Uint8Array(await file.arrayBuffer())),
  });

  const pick = (dir: boolean, recursive = false) =>
    new Promise<SourceFile[]>((resolve) => {
      const input = Object.assign(document.createElement("input"), { type: "file", multiple: true, accept: "application/pdf,.pdf" });
      input.webkitdirectory = dir;
      input.onchange = () =>
        resolve([...(input.files ?? [])].flatMap((f) => {
          // webkitRelativePath: "Picked/Sub/.../x.pdf"
          const parts = f.webkitRelativePath.split("/");
          if (dir && !recursive && parts.length > 2) return [];
          return [source(f, parts.length > 2 ? parts[1] : null)];
        }));
      input.oncancel = () => resolve([]);
      input.click();
    });

  return {
    name: "web",
    db,
    storage: {
      read: async (rel) => {
        const b = files.get(rel);
        if (!b) throw new Error(`Dosya yok: ${rel}`);
        return b.slice(); // pdf.js takes ownership of the buffer it gets
      },
      remove: async (rel) => void files.delete(rel),
    },
    pickers: { pickPdfs: () => pick(false), pickFolder: (recursive) => pick(true, recursive) },
    async onDrop(cb) {
      const over = (e: DragEvent) => e.preventDefault();
      const drop = async (e: DragEvent) => {
        e.preventDefault();
        const entries = [...(e.dataTransfer?.items ?? [])].map((i) => i.webkitGetAsEntry()).filter((x) => x !== null);
        const out: SourceFile[] = [];
        for (const entry of entries) await walk(entry, null, 0, out, source);
        cb(out);
      };
      window.addEventListener("dragover", over);
      window.addEventListener("drop", drop);
      return () => {
        window.removeEventListener("dragover", over);
        window.removeEventListener("drop", drop);
      };
    },
  };
}

// A dropped folder behaves like a recursive folder pick: its first-level subfolders become courses.
async function walk(entry: FileSystemEntry, folder: string | null, depth: number, out: SourceFile[], source: (f: File, folder: string | null) => SourceFile) {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    out.push(source(file, folder));
    return;
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
    if (!batch.length) break;
    for (const child of batch) {
      if (child.name.startsWith(".")) continue;
      await walk(child, depth === 1 ? entry.name : folder, depth + 1, out, source);
    }
  }
}
