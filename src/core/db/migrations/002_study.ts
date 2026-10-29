// v2 (study): Leitner review state, one row per flashcard (= annotation).
// A card without a row is new: box 1, due today.
export default /* sql */ `
CREATE TABLE card_review (
  annotation_id  INTEGER PRIMARY KEY REFERENCES annotation(id) ON DELETE CASCADE,
  box            INTEGER NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 5),
  due            TEXT NOT NULL,
  last_reviewed  TEXT
);
CREATE INDEX card_review_due ON card_review(due);
`;
