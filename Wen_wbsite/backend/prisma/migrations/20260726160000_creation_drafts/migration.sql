-- 旧版的创作记录均已在社区可见，因此迁移后标记为 published。
-- SQLite 需重建表，以便为新记录设置 draft 默认值和正确的时间默认值。
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Creation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "bookId" INTEGER,
    "category" TEXT NOT NULL DEFAULT 'other',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "prompt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    CONSTRAINT "Creation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Creation_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Creation" ("id", "userId", "bookId", "category", "status", "prompt", "content", "createdAt", "updatedAt", "publishedAt")
SELECT "id", "userId", "bookId", "category", 'published', "prompt", "content", "createdAt", "createdAt", "createdAt" FROM "Creation";

DROP TABLE "Creation";
ALTER TABLE "new_Creation" RENAME TO "Creation";

CREATE INDEX "Creation_status_category_publishedAt_idx" ON "Creation"("status", "category", "publishedAt");
CREATE INDEX "Creation_userId_status_updatedAt_idx" ON "Creation"("userId", "status", "updatedAt");

PRAGMA foreign_keys=ON;
