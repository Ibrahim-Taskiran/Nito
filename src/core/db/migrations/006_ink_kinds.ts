// v6: pen kinds (ballpoint, pencil, highlighter) per stroke, and pictures placed on PDF pages.
// page_image rect is normalised to the page (0..1), like ink points; file_path is relative to app storage.
export default /* sql */ `
ALTER TABLE ink_stroke ADD COLUMN kind TEXT NOT NULL DEFAULT 'pen';
CREATE TABLE page_image (
  id           INTEGER PRIMARY KEY,
  document_id  INTEGER NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  page         INTEGER NOT NULL,
  file_path    TEXT NOT NULL,
  x            REAL NOT NULL,
  y            REAL NOT NULL,
  w            REAL NOT NULL,
  h            REAL NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX page_image_document ON page_image(document_id, page);
`;
