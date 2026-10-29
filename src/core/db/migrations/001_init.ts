// v1: initial schema. Never edit a shipped migration; add 002_*.ts instead.
export default /* sql */ `
CREATE TABLE course (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  source_key  TEXT UNIQUE,              -- key in an imported library, for re-import
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE document (
  id           INTEGER PRIMARY KEY,
  course_id    INTEGER REFERENCES course(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  week         INTEGER,
  file_path    TEXT NOT NULL,           -- relative to app storage dir
  file_hash    TEXT NOT NULL,
  read_status  TEXT NOT NULL DEFAULT 'unread' CHECK (read_status IN ('unread','reading','read')),
  favorite     INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0,1)),
  source_key   TEXT UNIQUE,
  added_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX document_course ON document(course_id, week);
CREATE INDEX document_hash ON document(file_hash);

CREATE TABLE annotation (
  id           INTEGER PRIMARY KEY,
  document_id  INTEGER NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  page         INTEGER NOT NULL,
  rects        TEXT NOT NULL DEFAULT '[]',   -- JSON [{x,y,w,h}] normalised 0..1
  label        TEXT NOT NULL CHECK (label IN ('important','exam','definition','example','question')),
  text         TEXT NOT NULL DEFAULT '',
  comment      TEXT NOT NULL DEFAULT '',
  source_key   TEXT UNIQUE,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX annotation_document ON annotation(document_id, page);

CREATE TABLE note (
  id           INTEGER PRIMARY KEY,
  document_id  INTEGER REFERENCES document(id) ON DELETE CASCADE,
  course_id    INTEGER REFERENCES course(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'free' CHECK (kind IN ('live','template','digest','ai','transcript','free')),
  title        TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  source_key   TEXT UNIQUE,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX note_document ON note(document_id);
CREATE INDEX note_course ON note(course_id);

CREATE TABLE recording (
  id                INTEGER PRIMARY KEY,
  document_id       INTEGER NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  file_path         TEXT NOT NULL DEFAULT '',
  mime_type         TEXT NOT NULL DEFAULT '',
  started_at        TEXT NOT NULL,
  duration_seconds  REAL NOT NULL DEFAULT 0
);
CREATE INDEX recording_document ON recording(document_id);

CREATE TABLE recording_mark (
  id              INTEGER PRIMARY KEY,
  recording_id    INTEGER NOT NULL REFERENCES recording(id) ON DELETE CASCADE,
  annotation_id   INTEGER NOT NULL REFERENCES annotation(id) ON DELETE CASCADE,
  offset_seconds  REAL NOT NULL,
  UNIQUE (recording_id, annotation_id)
);
CREATE INDEX recording_mark_annotation ON recording_mark(annotation_id);

CREATE TABLE tag (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE
);

CREATE TABLE document_tag (
  document_id  INTEGER NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  tag_id       INTEGER NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, tag_id)
);
`;
