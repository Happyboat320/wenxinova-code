CREATE TABLE "CreationLike" (
    "userId" INTEGER NOT NULL,
    "creationId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("userId", "creationId"),
    CONSTRAINT "CreationLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreationLike_creationId_fkey" FOREIGN KEY ("creationId") REFERENCES "Creation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CreationComment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "creationId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreationComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreationComment_creationId_fkey" FOREIGN KEY ("creationId") REFERENCES "Creation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CreationLike_creationId_createdAt_idx" ON "CreationLike"("creationId", "createdAt");
CREATE INDEX "CreationComment_creationId_createdAt_idx" ON "CreationComment"("creationId", "createdAt");
CREATE INDEX "CreationComment_userId_createdAt_idx" ON "CreationComment"("userId", "createdAt");
