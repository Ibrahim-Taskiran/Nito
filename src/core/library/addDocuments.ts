// Shared add flow for every entry point: file picker, folder picker, drag and drop.
import type { Repo } from "../repo";
import type { Id } from "../types";
import { cleanTitle } from "../week";

/** A PDF offered for adding. The platform layer builds these. */
export interface SourceFile {
  /** File name with extension, e.g. "Hafta 3_Ağlar.pdf". */
  name: string;
  /** First-level subfolder of a picked folder; becomes the course. */
  folder: string | null;
  /** SHA-256 hex of the file contents. */
  hash(): Promise<string>;
  /** Copies the file into app storage at `rel`. */
  store(rel: string): Promise<void>;
}

export interface AddOptions {
  /** Course for files without a folder. */
  courseId?: Id | null;
  signal?: AbortSignal;
  onProgress?(done: number, total: number): void;
}

export interface AddResult {
  added: Id[];
  duplicates: string[];
  failed: { name: string; error: string }[];
  cancelled: boolean;
}

export const isPdfName = (name: string): boolean => /\.pdf$/i.test(name);

export const storagePath = (hash: string): string => `docs/${hash}.pdf`;

export async function addDocuments(repo: Repo, files: SourceFile[], opts: AddOptions = {}): Promise<AddResult> {
  const pdfs = files.filter((f) => isPdfName(f.name));
  const out: AddResult = { added: [], duplicates: [], failed: [], cancelled: false };
  const seen = new Set<string>();
  const courses = new Map<string, Id>();
  for (const [i, f] of pdfs.entries()) {
    if (opts.signal?.aborted) {
      out.cancelled = true;
      break;
    }
    try {
      const hash = await f.hash();
      if (seen.has(hash) || (await repo.documentByHash(hash))) {
        out.duplicates.push(f.name);
      } else {
        seen.add(hash);
        let courseId = opts.courseId ?? null;
        if (f.folder) {
          courseId = courses.get(f.folder) ?? (await repo.ensureCourse(f.folder));
          courses.set(f.folder, courseId);
        }
        const rel = storagePath(hash);
        await f.store(rel);
        out.added.push(await repo.addDocument({ courseId, title: cleanTitle(f.name), filePath: rel, fileHash: hash }));
      }
    } catch (e) {
      out.failed.push({ name: f.name, error: e instanceof Error ? e.message : String(e) });
    }
    opts.onProgress?.(i + 1, pdfs.length);
  }
  return out;
}

/** "3 eklendi, 1 zaten vardı, 0 hatalı" */
export function summaryText(r: AddResult): string {
  const text = `${r.added.length} eklendi, ${r.duplicates.length} zaten vardı, ${r.failed.length} hatalı`;
  return r.cancelled ? `${text} (iptal edildi)` : text;
}
