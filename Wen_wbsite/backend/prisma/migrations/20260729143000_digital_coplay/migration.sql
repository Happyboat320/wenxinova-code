-- 数字共演：收藏角色、会话角色快照与消息历史。
CREATE TABLE "FavoriteCharacter" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" INTEGER NOT NULL,
  "bookId" INTEGER,
  "chapterId" INTEGER,
  "characterId" INTEGER,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "deeds" TEXT,
  "sourceType" TEXT NOT NULL DEFAULT 'ai',
  "sourceTitle" TEXT,
  "sourceChapterTitle" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "FavoriteCharacter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FavoriteCharacter_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "FavoriteCharacter_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "BookChapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "FavoriteCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "CoPlaySession" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "userId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "scene" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CoPlaySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CoPlaySessionCharacter" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "sessionId" INTEGER NOT NULL,
  "favoriteCharacterId" INTEGER,
  "position" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "deeds" TEXT,
  "sourceTitle" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoPlaySessionCharacter_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CoPlaySession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CoPlaySessionCharacter_favoriteCharacterId_fkey" FOREIGN KEY ("favoriteCharacterId") REFERENCES "FavoriteCharacter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "CoPlayMessage" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "sessionId" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "characterName" TEXT,
  "content" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoPlayMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CoPlaySession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "FavoriteCharacter_userId_createdAt_idx" ON "FavoriteCharacter"("userId", "createdAt");
CREATE INDEX "FavoriteCharacter_bookId_name_idx" ON "FavoriteCharacter"("bookId", "name");
CREATE INDEX "CoPlaySession_userId_updatedAt_idx" ON "CoPlaySession"("userId", "updatedAt");
CREATE INDEX "CoPlaySessionCharacter_sessionId_idx" ON "CoPlaySessionCharacter"("sessionId");
CREATE UNIQUE INDEX "CoPlaySessionCharacter_sessionId_position_key" ON "CoPlaySessionCharacter"("sessionId", "position");
CREATE INDEX "CoPlayMessage_sessionId_order_idx" ON "CoPlayMessage"("sessionId", "order");
CREATE UNIQUE INDEX "CoPlayMessage_sessionId_order_key" ON "CoPlayMessage"("sessionId", "order");
