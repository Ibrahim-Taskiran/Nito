// v15: sticky note paper colour (NULL = the default yellow, see NOTE_COLORS in core/pageTools).
export default /* sql */ `
ALTER TABLE page_note ADD COLUMN color TEXT;
`;
