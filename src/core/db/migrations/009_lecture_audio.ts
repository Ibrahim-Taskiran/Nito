// v9: lecture audio. Page changes during a recording (slide–audio sync), the recording moment of ink strokes
// (note replay; highlights already use recording_mark), and cached silent spans for silence skip.
export default /* sql */ `
CREATE TABLE recording_page (
  id              INTEGER PRIMARY KEY,
  recording_id    INTEGER NOT NULL REFERENCES recording(id) ON DELETE CASCADE,
  page            INTEGER NOT NULL,
  offset_seconds  REAL NOT NULL
);
CREATE INDEX recording_page_recording ON recording_page(recording_id, offset_seconds);

CREATE TABLE ink_stroke_mark (
  stroke_id       INTEGER PRIMARY KEY REFERENCES ink_stroke(id) ON DELETE CASCADE,
  recording_id    INTEGER NOT NULL REFERENCES recording(id) ON DELETE CASCADE,
  offset_seconds  REAL NOT NULL
);
CREATE INDEX ink_stroke_mark_recording ON ink_stroke_mark(recording_id);

CREATE TABLE recording_silence (
  recording_id    INTEGER PRIMARY KEY REFERENCES recording(id) ON DELETE CASCADE,
  spans           TEXT NOT NULL DEFAULT '[]'   -- JSON [{start,end}] in seconds
);
`;
