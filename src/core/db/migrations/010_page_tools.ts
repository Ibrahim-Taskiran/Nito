// v10: page tools. Rects are normalised to the original PDF page (0..1); values above 1 lie in the
// added margin, so the PDF and older strokes never move.
export default /* sql */ `
CREATE TABLE page_tape (
  id           INTEGER PRIMARY KEY,
  document_id  INTEGER NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  page         INTEGER NOT NULL,
  x            REAL NOT NULL,
  y            REAL NOT NULL,
  w            REAL NOT NULL,
  h            REAL NOT NULL,
  revealed     INTEGER NOT NULL DEFAULT 0 CHECK (revealed IN (0,1)),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX page_tape_document ON page_tape(document_id, page);

CREATE TABLE page_note (
  id           INTEGER PRIMARY KEY,
  document_id  INTEGER NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  page         INTEGER NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','sticky')),
  x            REAL NOT NULL,
  y            REAL NOT NULL,
  w            REAL NOT NULL,
  h            REAL NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  collapsed    INTEGER NOT NULL DEFAULT 0 CHECK (collapsed IN (0,1)),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX page_note_document ON page_note(document_id, page);

-- Extra writable area as a fraction of the PDF page width (right) and height (bottom).
CREATE TABLE page_margin (
  document_id  INTEGER NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  page         INTEGER NOT NULL,
  extra_right  REAL NOT NULL DEFAULT 0,
  extra_bottom REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (document_id, page)
);
`;
