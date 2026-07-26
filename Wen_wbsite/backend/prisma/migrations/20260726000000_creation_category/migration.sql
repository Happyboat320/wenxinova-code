-- 为社区创作增加稳定的分类字段，避免继续从提示词文本中临时推断。
ALTER TABLE "Creation" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'other';

-- 兼容迁移已有数据：旧版将生成类型保存在 prompt 的方括号前缀中。
UPDATE "Creation" SET "category" = 'adaptation' WHERE "prompt" LIKE '[adapt] %';
UPDATE "Creation" SET "category" = 'script' WHERE "prompt" LIKE '[script] %';
UPDATE "Creation" SET "category" = 'props'
WHERE "prompt" LIKE '[custom] %' AND "prompt" LIKE '%关键道具%';
UPDATE "Creation" SET "category" = 'dm'
WHERE "prompt" LIKE '[custom] %' AND "prompt" LIKE '%DM 主持手册%';

CREATE INDEX "Creation_category_createdAt_idx" ON "Creation"("category", "createdAt");
