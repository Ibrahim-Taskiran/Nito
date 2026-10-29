// SqlDb over sql.js (SQLite in WASM). Used by `npm run dev` in a browser and by tests.
import type { Database, SqlJsStatic } from "sql.js";
import type { Row, SqlDb, SqlValue } from "../../core/db/sql";

export function sqljsDb(SQL: SqlJsStatic, data?: Uint8Array): SqlDb & { raw: Database } {
  const raw = new SQL.Database(data);
  return {
    raw,
    async run(sql: string, params: SqlValue[] = []) {
      raw.run(sql, params);
      const changes = raw.getRowsModified();
      const lastId = Number(raw.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] ?? 0);
      return { lastId, changes };
    },
    async exec(sql: string) {
      raw.exec(sql);
    },
    async all<T = Row>(sql: string, params: SqlValue[] = []) {
      const st = raw.prepare(sql, params);
      const rows: T[] = [];
      try {
        while (st.step()) rows.push(st.getAsObject() as T);
      } finally {
        st.free();
      }
      return rows;
    },
  };
}
