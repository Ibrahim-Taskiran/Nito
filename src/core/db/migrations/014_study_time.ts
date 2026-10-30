// v14 (Phase 3.8): stopwatch time credited to the document open in the reader, one row per document and day.
export default /* sql */ `
CREATE TABLE study_time (
  document_id  INTEGER NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  day          TEXT NOT NULL,                     -- local YYYY-MM-DD
  ms           INTEGER NOT NULL CHECK (ms >= 0),
  PRIMARY KEY (document_id, day)
);
`;
