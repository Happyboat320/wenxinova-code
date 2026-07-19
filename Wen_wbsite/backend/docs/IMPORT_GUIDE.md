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

## 一键流程示例
```bash
cd backend
pnpm generate
pnpm db:push
pnpm import:excel -- --clear
pnpm import:text
```

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
