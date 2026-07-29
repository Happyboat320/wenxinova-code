-- 数字共演作品发布：社区作品可追溯到来源会话，删除会话后保留已生成正文。
ALTER TABLE "Creation" ADD COLUMN "coPlaySessionId" INTEGER REFERENCES "CoPlaySession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Creation_coPlaySessionId_status_updatedAt_idx" ON "Creation"("coPlaySessionId", "status", "updatedAt");
