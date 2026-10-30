// Data access for pictures placed on PDF pages.
import type { Row, SqlDb } from "./db/sql";
import type { ImageRect, PageImage } from "./pageImage";
import type { Id } from "./types";

const toImage = (r: Row): PageImage => ({
  id: Number(r.id),
  documentId: Number(r.document_id),
  page: Number(r.page),
  filePath: String(r.file_path),
  x: Number(r.x),
  y: Number(r.y),
  w: Number(r.w),
  h: Number(r.h),
});

export class ImageRepo {
  constructor(readonly db: SqlDb) {}

  async list(documentId: Id): Promise<PageImage[]> {
    return (await this.db.all("SELECT * FROM page_image WHERE document_id = ? ORDER BY id", [documentId])).map(toImage);
  }

  async add(i: Omit<PageImage, "id">): Promise<Id> {
    return (await this.db.run(
      "INSERT INTO page_image (document_id, page, file_path, x, y, w, h) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [i.documentId, i.page, i.filePath, i.x, i.y, i.w, i.h],
    )).lastId;
  }

  async move(id: Id, r: ImageRect): Promise<void> {
    await this.db.run("UPDATE page_image SET x = ?, y = ?, w = ?, h = ? WHERE id = ?", [r.x, r.y, r.w, r.h, id]);
  }

  async remove(id: Id): Promise<void> {
    await this.db.run("DELETE FROM page_image WHERE id = ?", [id]);
  }

  /** True while any page still shows this file; once false the stored file can be removed. */
  async inUse(filePath: string): Promise<boolean> {
    return (await this.db.all("SELECT 1 FROM page_image WHERE file_path = ? LIMIT 1", [filePath])).length > 0;
  }
}
