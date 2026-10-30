import type { SqlDb } from "./sql";
import m001 from "./migrations/001_init";
import m002 from "./migrations/002_study";
import m003 from "./migrations/003_notes";
import m004 from "./migrations/004_transcripts";
import m005 from "./migrations/005_ink";
import m006 from "./migrations/006_ink_kinds";
import m007 from "./migrations/007_reading";
import m008 from "./migrations/008_plan";
import m011 from "./migrations/011_page_flags";

/** Ordered list; index + 1 is the schema version stored in PRAGMA user_version. */
export const MIGRATIONS: readonly string[] = [m001, m002, m003, m004, m005, m006, m007, m008, m011];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function schemaVersion(db: SqlDb): Promise<number> {
  const rows = await db.all<{ user_version: number }>("PRAGMA user_version");
  return Number(rows[0]?.user_version ?? 0);
}

/** Applies pending migrations, each in its own transaction. Returns the new version. */
export async function migrate(db: SqlDb): Promise<number> {
  await db.exec("PRAGMA foreign_keys = ON");
  let version = await schemaVersion(db);
  if (version > SCHEMA_VERSION) {
    throw new Error(`Veritabanı bu sürümden yeni (v${version}); uygulamayı güncelleyin.`);
  }
  while (version < SCHEMA_VERSION) {
    const next = version + 1;
    await db.exec(`BEGIN;\n${MIGRATIONS[version]}\nPRAGMA user_version = ${next};\nCOMMIT;`);
    version = next;
  }
  return version;
}
