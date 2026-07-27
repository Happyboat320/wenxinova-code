# Manticore Search 索引迁移计划

## 数据边界

SQLite 仍是业务数据的唯一真源，本次不增加 Prisma 字段，也不复制手机号等账号信息。Manticore 中的数据均为可重建的派生索引：

- `wenxin_library`：书籍 ID、标题、作者、梗概、分类。
- `wenxin_community`：已发布作品 ID、发布者昵称、源篇目名、改编全文、分类、发布时间。
- 草稿不进入社区索引；自由创作的源篇目名为空；用户手机号永不进入索引。

## 首次迁移

1. 安装并启动 Manticore，HTTP 接口只需监听本机 `9308`。
2. 确认 `backend/.env` 中的 `MANTICORE_HTTP_URL` 可访问。
3. 先执行现有 SQLite/Prisma 迁移，再运行：

   ```bash
   cd /root/wenxin/Wen_wbsite/backend
   npm run search:reindex
   ```

4. 脚本幂等创建两个实时索引、清空旧派生数据，并分批导入全部书籍及已发布作品。
5. 使用 Manticore SQL 接口核对数量：

   ```bash
   curl -s http://127.0.0.1:9308/sql?mode=raw -d 'query=SELECT COUNT(*) FROM wenxin_library'
   curl -s http://127.0.0.1:9308/sql?mode=raw -d 'query=SELECT COUNT(*) FROM wenxin_community'
   ```

## 日常同步

- 发布作品或更新草稿状态后，后端按作品 ID 更新或删除社区索引文档。
- 修改昵称后，后端重建该用户所有已发布作品的社区索引文档。
- 索引同步失败不会回滚已经成功提交的 SQLite 业务事务，日志会提示运行 `npm run search:reindex` 修复。
- 批量导入书籍或直接维护 SQLite 后必须执行一次全量重建。

## 回滚与恢复

- 临时故障：恢复 Manticore 后运行 `npm run search:reindex`，不需要恢复 SQLite。
- 回滚应用：部署上一版本即可；Manticore 索引可保留，不影响旧版业务。
- 彻底删除索引时可执行 `DROP TABLE wenxin_library` 与 `DROP TABLE wenxin_community`。这是破坏性操作，正常回滚无需执行。
