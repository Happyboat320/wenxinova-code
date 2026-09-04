-- 管理员文库内容修改审计记录
CREATE TABLE "BookContentEdit" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "bookId" INTEGER NOT NULL,
  "chapterId" INTEGER,
  "editorId" INTEGER NOT NULL,
  "field" TEXT NOT NULL,
  "oldContent" TEXT NOT NULL,
  "newContent" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookContentEdit_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BookContentEdit_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "BookChapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BookContentEdit_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BookContentEdit_bookId_createdAt_idx" ON "BookContentEdit" ("bookId", "createdAt");
CREATE INDEX "BookContentEdit_editorId_createdAt_idx" ON "BookContentEdit" ("editorId", "createdAt");
