// Minimal SQL port. Implemented by the platform layer (Tauri/rusqlite,
// sql.js in the browser and tests, node:sqlite in the CLI).

export type SqlValue = string | number | null | Uint8Array;
export type Row = Record<string, SqlValue>;

export interface SqlDb {
  /** Runs one statement; returns the last inserted rowid and changes. */
  run(sql: string, params?: SqlValue[]): Promise<{ lastId: number; changes: number }>;
  /** Runs a script of several statements without parameters. */
  exec(sql: string): Promise<void>;
  all<T = Row>(sql: string, params?: SqlValue[]): Promise<T[]>;
}

export async function get<T = Row>(db: SqlDb, sql: string, params?: SqlValue[]): Promise<T | undefined> {
  return (await db.all<T>(sql, params))[0];
}

/** Runs fn inside BEGIN/COMMIT, rolling back on error. */
export async function transaction<T>(db: SqlDb, fn: () => Promise<T>): Promise<T> {
  await db.exec("BEGIN");
  try {
    const out = await fn();
    await db.exec("COMMIT");
    return out;
  } catch (e) {
    await db.exec("ROLLBACK");
    throw e;
  }
}
