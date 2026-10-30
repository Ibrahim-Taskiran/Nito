// v8: weekly study planner. A repeating item is anchored on `day` and shows every week from then on;
// its per-week completion lives in plan_done (the `done` column is used for one-off items).
export default /* sql */ `
CREATE TABLE plan_item (
  id             INTEGER PRIMARY KEY,
  title          TEXT NOT NULL,
  course_id      INTEGER REFERENCES course(id) ON DELETE SET NULL,
  document_id    INTEGER REFERENCES document(id) ON DELETE SET NULL,
  day            TEXT NOT NULL,                 -- YYYY-MM-DD
  start_min      INTEGER,                       -- minutes after midnight, NULL = any time
  duration_min   INTEGER NOT NULL DEFAULT 30,
  kind           TEXT NOT NULL DEFAULT 'study' CHECK (kind IN ('study','review','exam','lecture','other')),
  done           INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
  repeat_weekly  INTEGER NOT NULL DEFAULT 0 CHECK (repeat_weekly IN (0,1)),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX plan_item_day ON plan_item(day);

CREATE TABLE plan_done (
  plan_item_id  INTEGER NOT NULL REFERENCES plan_item(id) ON DELETE CASCADE,
  day           TEXT NOT NULL,
  PRIMARY KEY (plan_item_id, day)
);
`;
