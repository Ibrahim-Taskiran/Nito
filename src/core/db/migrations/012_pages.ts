// v12 (Phase 3.7 pages): inserted blank pages and the "Önemli" page flag.
// Page keys: PDF pages keep their numbers (> 0), so every existing row stays valid; a blank page uses
// -page_insert.id (< 0) in the same `page` columns. AUTOINCREMENT so a deleted blank page's key is never reused.
export default /* sql */ `
CREATE TABLE page_insert (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id  INTEGER NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  anchor       INTEGER NOT NULL CHECK (anchor >= 0),  -- PDF page it follows; 0 = before page 1
  pos          REAL NOT NULL DEFAULT 0,               -- order among blank pages with the same anchor
  width        REAL NOT NULL,                          -- PDF points, copied from the neighbour page
  height       REAL NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX page_insert_document ON page_insert(document_id, anchor, pos);

-- SQLite cannot change a CHECK, so page_flag is rebuilt with the new 'important' kind.
CREATE TABLE page_flag_v12 (
  document_id  INTEGER NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  page         INTEGER NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('stressed','candidate','unclear','important')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (document_id, page, kind)
);
INSERT INTO page_flag_v12 (document_id, page, kind, created_at) SELECT document_id, page, kind, created_at FROM page_flag;
DROP TABLE page_flag;
ALTER TABLE page_flag_v12 RENAME TO page_flag;
`;
