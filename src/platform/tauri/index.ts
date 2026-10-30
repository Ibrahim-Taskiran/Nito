// Tauri platform: rusqlite, app storage and native dialogs through Rust commands (src-tauri/src).
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import type { Row, SqlDb } from "../../core/db/sql";
import type { SourceFile } from "../../core/library/addDocuments";
import { IMAGE_EXTENSIONS } from "../../core/pageImage";
import type { Platform } from "../types";
import { tauriAi } from "./ai";
import { tauriTranscriber } from "./transcriber";
import { isMobileDevice } from "../device";
import { fetchImageWith, userMessage } from "../fetchImage";

interface PdfEntry {
  path: string;
  name: string;
  folder: string | null;
}

const db: SqlDb = {
  run: (sql, params = []) => invoke("db_run", { sql, params }),
  exec: (sql) => invoke("db_exec", { sql }),
  all: <T = Row>(sql: string, params = []) => invoke<T[]>("db_all", { sql, params }),
};

const source = (e: PdfEntry): SourceFile => ({
  name: e.name,
  folder: e.folder,
  hash: () => invoke("file_hash", { path: e.path }),
  store: (rel) => invoke("storage_copy", { src: e.path, rel }),
});

const listPdfs = async (paths: string[], recursive: boolean) =>
  paths.length ? (await invoke<PdfEntry[]>("list_pdfs", { paths, recursive })).map(source) : [];

const asList = (v: string | string[] | null) => (v == null ? [] : Array.isArray(v) ? v : [v]);

export function createTauriPlatform(): Platform {
  const mobile = isMobileDevice();
  const storage: Platform["storage"] = {
    read: async (rel) => new Uint8Array(await invoke<ArrayBuffer>("storage_read", { rel })),
    write: (rel, data) => invoke("storage_write", data, { headers: { "x-rel": rel } }),
    remove: (rel) => invoke("storage_remove", { rel }),
  };
  return {
    name: "tauri",
    mobile,
    db,
    transcriber: mobile ? undefined : tauriTranscriber,
    ai: mobile ? undefined : tauriAi,
    storage,
    backup: {
      async backup() {
        const dest = await open({ directory: true, title: "Yedeğin kaydedileceği klasör" });
        return typeof dest === "string" ? invoke<string>("backup_to", { dest }) : null;
      },
      async restore() {
        const src = await open({ directory: true, title: "Nito yedek klasörü (Nito-yedek-…)" });
        return typeof src === "string" ? invoke<string>("restore_from", { src }) : null;
      },
    },
    listFolder: (path, recursive) => listPdfs([path], recursive),
    async fetchImage(url) {
      // The webview's fetch works when the site allows other origins (CORS). The http plugin skips CORS, but its
      // scope only allows this machine (capabilities/ai.json), so other sites end in the "copy and paste" message.
      try {
        return await fetchImageWith(fetch, url);
      } catch (e) {
        if (!(e instanceof TypeError)) throw userMessage(e);
      }
      try {
        return await fetchImageWith((await import("@tauri-apps/plugin-http")).fetch, url);
      } catch (e) {
        throw userMessage(e);
      }
    },
    async saveExport(name, data) {
      await storage.write(`exports/${name}`, typeof data === "string" ? new TextEncoder().encode(data) : data);
      return join(await appDataDir(), "storage", "exports", name);
    },
    pickers: {
      pickPdfs: async () => listPdfs(asList(await open({ multiple: true, filters: [{ name: "PDF", extensions: ["pdf"] }] })), false),
      pickFolder: async (recursive) => listPdfs(asList(await open({ directory: true })), recursive),
      async pickImage() {
        const path = await open({ filters: [{ name: "Resim", extensions: [...IMAGE_EXTENSIONS] }] });
        if (typeof path !== "string") return null;
        return source({ path, name: path.split(/[\\/]/).pop() ?? path, folder: null });
      },
    },
    async onDrop(cb) {
      return getCurrentWebview().onDragDropEvent(async (e) => {
        if (e.payload.type === "drop") cb(await listPdfs(e.payload.paths, true));
      });
    },
  };
}
