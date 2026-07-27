# 数据导入指南

本文档介绍如何将 Excel 元数据与小说正文、注释内容导入至 SQLite 数据库。推荐在每次重置数据库后按照本指南执行，以确保 `Book.annotationCount` 与 `Annotation` 表保持一致。

## 环境要求
- Node.js 18+
- pnpm
- 已在 `backend/` 目录执行 `pnpm install`

## 必备资料
- `小说目录信息.xlsx`
- `texts/` 目录中的原文 TXT（例如 `唐宋传奇选.txt`）

## 初始化数据库
1. 如需完全清空数据，可删除 `prisma/data/app.db`：
   ```powershell
   Remove-Item prisma/data/app.db
   ```
2. 重新生成 Prisma Client：
   ```bash
   pnpm generate
   ```
3. 推送最新 schema：
   ```bash
   pnpm db:push
   ```

## 导入 Excel 元数据
写入书籍基础信息、角色与注释数量：
```bash
pnpm import:excel -- --clear
```
- `--clear`：导入前清空 `Book`、`Character` 表，适合全量重置。
- 若要在原有数据上更新，可移除 `--clear`，或加上 `--no-skip` 强制覆盖。

**常用选项**
| 选项 | 说明 |
|------|------|
| `--file <path>` | 指定其他 Excel 文件 |
| `--clear` | 导入前清空书籍和角色数据 |
| `--no-skip` | 书籍存在时执行更新 |
| `--limit <n>` | 仅导入前 `n` 条 |

## 导入文本与注释
补充原文、译文及注释数据：
```bash
pnpm import:text
```
脚本会：
- 自动识别选集并拆分（如《唐宋传奇选》）；
- 解析 `注释：` 段落，将脚注写入 `Annotation` 表；
- 同步 `Book.annotationCount` 为最新注释数量。

**常用选项**
| 选项 | 说明 |
|------|------|
| `--dir <path>` | 指定文本目录（默认 `texts/`）|
| `--file <path>` | 仅导入某个文件 |
| `--book <title>` | 与 `--file` 搭配，覆盖指定书籍 |
| `--type <original|translated>` | 强制指定文本类型 |
| `--encoding <enc>` | 处理 GBK/GB2312 等编码 |
| `--create` | 书籍不存在时自动创建（缺少元数据字段）|

> 建议顺序：先运行 Excel 脚本，再运行 TXT 脚本。若要增量更新，可省略 `--clear` 并直接导入。

## 一键导入全部数据（推荐）

完整书库由 `data/ancient_prose.json` 通用古文库，以及
`小说目录信息.xlsx` + `texts/唐宋传奇选.txt` 精选小说数据，以及
`data/doc/*.json` 补充文集组成。当前补充文集包括《搜神记》、
《清平山堂话本》和《警世通言》。

```bash
cd backend
pnpm import:all
```

该命令会先应用数据库迁移并校验全部源文件，然后原位更新通用古文库、
补齐精选小说的元数据、正文、人物和注释。精选篇目与 JSON 同名时忽略
精选版本；补充文集与前序数据同名时同样忽略。补充文集的入话会与正文
一并保存，注释写入注释表，异说随梗概保存。流程会保留用户、创作及其书籍关联，修改前在
`prisma/data/import-backups/` 创建数据库备份，并在单个事务中完成修改。

只检查、不修改数据库：

```bash
pnpm import:all -- --dry-run
```

不建议关闭备份；如确有需要，可传入 `--no-backup`。

## 手动导入精选数据

以下旧命令只适合空的临时数据库调试，不会导入 JSON 通用古文库；其中
`--clear` 会删除全部书籍。完整数据库请始终使用上面的一键命令。

### 手动流程示例
```bash
cd backend
pnpm generate
pnpm db:push
pnpm import:excel -- --clear
pnpm import:text
```

## 导入带回目切换的整本作品

《长生殿》《桃花扇》《金瓶梅》《官场现形记》《玉娇梨》采用“一个 JSON
文件对应一部作品、数组元素对应回目”的特殊结构。先将项目根目录的
`1.zip` 解压至 `backend/data/collections/`，再执行：

```bash
cd backend
npm run import:collections
```

导入器会应用数据库迁移、备份 SQLite 数据库，将序跋等前置篇章置顶，并按
中文回目编号排序。重复执行时保留作品 ID，刷新其回目数据。只校验源文件时：

```bash
npx tsx scripts/import-collections.ts --dry-run
```

导入完成后需执行 `npm run search:reindex`，让五部作品进入全文检索索引。

## 导入结果验证
- 调用 `GET /api/books/:id` 确认 `annotationCount`、`annotations` 字段；
- 或参考 `docs/tests-guide.md` 运行 Vitest 用例。

## 注意事项
- `pnpm db:seed` 会清空书籍并写入演示数据，不应在批量导入后执行。
- TXT 导入依赖书名精确匹配（含标点、空格），不匹配的作品会被跳过。
- 所有脚本默认使用 `.env` 中的 `DATABASE_URL`。

## 延伸阅读
- `docs/mock-testing.md`：Mock 模式联调指南
- `docs/tests-guide.md`：`tests/` 目录测试说明
- `../README.md`：项目总体说明
