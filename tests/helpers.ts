import initSqlJs from "sql.js";
import { migrate } from "../src/core/db/migrate";
import { Repo } from "../src/core/repo";
import { sqljsDb } from "../src/platform/web/sqljsDb";
import type { SourceFile } from "../src/core/library/addDocuments";

export async function freshRepo(): Promise<Repo> {
  const db = sqljsDb(await initSqlJs());
  await migrate(db);
  return new Repo(db);
}

/** Fake source file; the hash is the given content string. */
export function fakeFile(name: string, content: string, folder: string | null = null, stored: string[] = []): SourceFile {
  return {
    name,
    folder,
    hash: async () => content,
    store: async (rel) => {
      if (content === "broken") throw new Error("disk dolu");
      stored.push(rel);
    },
  };
}
