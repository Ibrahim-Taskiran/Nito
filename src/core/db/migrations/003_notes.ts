// Notes: one live note per document, one digest per course, and watched course folders.
export default /* sql */ `
CREATE UNIQUE INDEX note_live_doc ON note(document_id) WHERE kind = 'live';
CREATE UNIQUE INDEX note_digest_course ON note(course_id) WHERE kind = 'digest';

CREATE TABLE watched_folder (
  id          INTEGER PRIMARY KEY,
  path        TEXT NOT NULL UNIQUE,
  recursive   INTEGER NOT NULL DEFAULT 1 CHECK (recursive IN (0,1)),
  last_scan   TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;
