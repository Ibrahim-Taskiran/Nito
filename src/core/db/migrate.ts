import type { SqlDb } from "./sql";
import m001 from "./migrations/001_init";
import m002 from "./migrations/002_study";

/** Ordered list; index + 1 is the schema version stored in PRAGMA user_version. */
export const MIGRATIONS: readonly string[] = [m001, m002];

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
