// v(n): a recording points at its transcript note. Deleting the note clears the link.
export default /* sql */ `
ALTER TABLE recording ADD COLUMN transcript_note_id INTEGER REFERENCES note(id) ON DELETE SET NULL;
`;
