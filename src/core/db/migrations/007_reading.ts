// v7 (library): reading position per document, for progress bars and "continue where you left off".
export default /* sql */ `
ALTER TABLE document ADD COLUMN last_page INTEGER;
ALTER TABLE document ADD COLUMN page_count INTEGER;
ALTER TABLE document ADD COLUMN last_opened_at TEXT;
`;
