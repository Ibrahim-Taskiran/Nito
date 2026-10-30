// v13 (Phase 3.8 notebook): one notebook ("Defter") per document, beside the PDF.
// Its pages use their own page keys in the layer tables: -(1e9 + notebook_page.id), see core/notebook.
export default /* sql */ `
CREATE TABLE notebook_page (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id  INTEGER NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'plain' CHECK (kind IN ('plain','grid','lined','dots')),
  pos          REAL NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX notebook_page_document ON notebook_page(document_id, pos);
`;
