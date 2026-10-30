// v7: reading position and last-opened time per document (Kaldığın yerden devam et).
export default /* sql */ `
ALTER TABLE document ADD COLUMN last_page INTEGER;
ALTER TABLE document ADD COLUMN page_count INTEGER;
ALTER TABLE document ADD COLUMN last_opened_at TEXT;
`;
