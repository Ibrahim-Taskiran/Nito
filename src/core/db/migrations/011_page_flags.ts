// v11 (Phase 3.6 exam): page flags for the exam view, and the wrong options of AI multiple-choice cards.
// Numbered 011 so it runs after the audio (009) and page tools (010) migrations once they are merged.
export default /* sql */ `
CREATE TABLE page_flag (
  document_id  INTEGER NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  page         INTEGER NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('stressed','candidate','unclear')),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (document_id, page, kind)
);

CREATE TABLE card_choice (
  annotation_id  INTEGER PRIMARY KEY REFERENCES annotation(id) ON DELETE CASCADE,
  wrong          TEXT NOT NULL DEFAULT '[]'   -- JSON array of wrong options
);
`;
