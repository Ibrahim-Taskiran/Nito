// v5: handwriting strokes on PDF pages (pen / stylus). Points are JSON [{x,y,p}] normalised 0..1.
export default /* sql */ `
CREATE TABLE ink_stroke (
  id           INTEGER PRIMARY KEY,
  document_id  INTEGER NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  page         INTEGER NOT NULL,
  color        TEXT NOT NULL,
  width        REAL NOT NULL,
  points       TEXT NOT NULL DEFAULT '[]',
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ink_stroke_document ON ink_stroke(document_id, page);
`;
