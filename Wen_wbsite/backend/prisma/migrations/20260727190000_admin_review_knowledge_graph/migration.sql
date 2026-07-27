-- 用户角色；现有及未来的指定手机号用户由应用层和本迁移共同确保为初始管理员。
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';
UPDATE "User" SET "role" = 'admin' WHERE "phone" = '18125680320';

CREATE TABLE "AdminApplication" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" INTEGER NOT NULL,
  "remark" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewNote" TEXT,
  "reviewerId" INTEGER,
  "reviewedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AdminApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdminApplication_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AdminApplication_status_createdAt_idx" ON "AdminApplication"("status", "createdAt");
CREATE INDEX "AdminApplication_userId_createdAt_idx" ON "AdminApplication"("userId", "createdAt");

ALTER TABLE "Creation" ADD COLUMN "submittedAt" DATETIME;
ALTER TABLE "Creation" ADD COLUMN "reviewedAt" DATETIME;
ALTER TABLE "Creation" ADD COLUMN "reviewedById" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Creation" ADD COLUMN "reviewNote" TEXT;
CREATE INDEX "Creation_status_submittedAt_idx" ON "Creation"("status", "submittedAt");

CREATE TABLE "BookKnowledgeGraph" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "bookId" INTEGER NOT NULL,
  "timelineJson" TEXT NOT NULL,
  "relationshipJson" TEXT NOT NULL,
  "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "BookKnowledgeGraph_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BookKnowledgeGraph_bookId_key" ON "BookKnowledgeGraph"("bookId");
