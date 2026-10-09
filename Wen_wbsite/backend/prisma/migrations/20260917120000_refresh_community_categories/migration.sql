-- 社区分类只保留当前可创作的四类：旧 DM 手册并入剧本杀剧本，旧“其他”并入风格化改编。
-- SQLite 无法直接修改列默认值，因此重建 Creation 表，同时完整保留审核、共演和互动关联。
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Creation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "bookId" INTEGER,
    "coPlaySessionId" INTEGER,
    "category" TEXT NOT NULL DEFAULT 'adaptation',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "prompt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    "submittedAt" DATETIME,
    "reviewedAt" DATETIME,
    "reviewedById" INTEGER,
    "reviewNote" TEXT,
    CONSTRAINT "Creation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Creation_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Creation_coPlaySessionId_fkey" FOREIGN KEY ("coPlaySessionId") REFERENCES "CoPlaySession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Creation_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Creation" (
    "id", "userId", "bookId", "coPlaySessionId", "category", "status", "prompt", "content",
    "createdAt", "updatedAt", "publishedAt", "submittedAt", "reviewedAt", "reviewedById", "reviewNote"
)
SELECT
    "id", "userId", "bookId", "coPlaySessionId",
    CASE
      WHEN "category" = 'dm' THEN 'script'
      WHEN "category" = 'other' THEN 'adaptation'
      ELSE "category"
    END,
    "status", "prompt", "content", "createdAt", "updatedAt", "publishedAt", "submittedAt",
    "reviewedAt", "reviewedById", "reviewNote"
FROM "Creation";

DROP TABLE "Creation";
ALTER TABLE "new_Creation" RENAME TO "Creation";

CREATE INDEX "Creation_status_category_publishedAt_idx" ON "Creation"("status", "category", "publishedAt");
CREATE INDEX "Creation_userId_status_updatedAt_idx" ON "Creation"("userId", "status", "updatedAt");
CREATE INDEX "Creation_status_submittedAt_idx" ON "Creation"("status", "submittedAt");
CREATE INDEX "Creation_coPlaySessionId_status_updatedAt_idx" ON "Creation"("coPlaySessionId", "status", "updatedAt");

PRAGMA foreign_keys=ON;
