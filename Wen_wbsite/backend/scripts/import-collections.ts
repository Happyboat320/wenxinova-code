/**
 * 导入按“整部作品—多个回目”组织的五部古典小说/传奇。
 *
 * 与普通 JSON 数据一条记录对应一部作品不同，本目录中每个 JSON 文件才是
 * 一部作品，数组元素是回目。导入会保留作品 Book.id，并整体刷新其回目。
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const BACKEND_DIR = path.resolve(__dirname, '..');
const COLLECTION_DIR = path.join(BACKEND_DIR, 'data', 'collections');
const COLLECTION_THEME = '整本导入';
const DEFAULT_IMAGE = 'https://img.zcool.cn/community/01e3c85e1f6f5da80120a8957c7227.jpg';

interface SourceRow {
  题目?: string;
  文本?: string;
  全文翻译?: string;
  关键词?: string[] | string;
  梗概?: string;
}

interface CollectionDefinition {
  file: string;
  title: string;
  author: string;
  dynasty: string;
  category: string;
  unit: '回' | '出/篇';
  expectedCount: number;
}

const COLLECTIONS: CollectionDefinition[] = [
  // 归入书库已有“传奇”分类，避免与同义的“明清传奇”拆成两个筛选项。
  { file: '长生殿.json', title: '长生殿', author: '洪昇', dynasty: '清', category: '传奇', unit: '出/篇', expectedCount: 50 },
  { file: '桃花扇.json', title: '桃花扇', author: '孔尚任', dynasty: '清', category: '传奇', unit: '出/篇', expectedCount: 48 },
  { file: '金瓶梅.json', title: '金瓶梅', author: '兰陵笑笑生（疑）', dynasty: '明代', category: '世情小说', unit: '回', expectedCount: 69 },
  { file: '官场.json', title: '官场现形记', author: '李伯元', dynasty: '晚清', category: '世情小说', unit: '回', expectedCount: 20 },
  { file: '玉娇梨.json', title: '玉娇梨', author: '荑秋散人（一说天花藏主人）', dynasty: '明末清初', category: '世情小说', unit: '回', expectedCount: 20 },
];

function clean(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).replace(/\r\n/g, '\n').trim();
}

// 支持“二十一、廿一、卅三、卌九”等回目编号写法。
export function chineseNumber(value: string): number | null {
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (/^\d+$/.test(value)) return Number(value);
  if (value.startsWith('廿')) return 20 + (digits[value.slice(1)] ?? 0);
  if (value.startsWith('卅')) return 30 + (digits[value.slice(1)] ?? 0);
  if (value.startsWith('卌')) return 40 + (digits[value.slice(1)] ?? 0);
  const hundredAt = value.indexOf('百');
  if (hundredAt >= 0) {
    const hundreds = digits[value.slice(0, hundredAt)] ?? 1;
    const rest = chineseNumber(value.slice(hundredAt + 1));
    return hundreds * 100 + (rest ?? 0);
  }
  const tenAt = value.indexOf('十');
  if (tenAt >= 0) {
    const tens = tenAt === 0 ? 1 : digits[value.slice(0, tenAt)];
    const ones = value.slice(tenAt + 1) ? digits[value.slice(tenAt + 1)] : 0;
    return tens === undefined || ones === undefined ? null : tens * 10 + ones;
  }
  return value.length === 1 && digits[value] !== undefined ? digits[value] : null;
}

export function chapterNumber(title: string): number | null {
  const match = title.match(/(?:第|闰|加)([零〇一二两三四五六七八九十百廿卅卌\d]+)/);
  return match ? chineseNumber(match[1]) : null;
}

export function sortChapterRows(rows: SourceRow[]): SourceRow[] {
  return rows
    .map((row, sourceIndex) => ({ row, sourceIndex, number: chapterNumber(clean(row.题目)) }))
    .sort((left, right) => {
      // 序、跋、凡例等前置篇章没有编号，保持源文件中的相对顺序并置于正文前。
      if (left.number === null || right.number === null) {
        if (left.number === null && right.number === null) return left.sourceIndex - right.sourceIndex;
        return left.number === null ? -1 : 1;
      }
      if (left.number !== right.number) return left.number - right.number;
      const rank = (title: string) => title.startsWith('加') ? -1 : title.startsWith('闰') ? 1 : 0;
      return rank(clean(left.row.题目)) - rank(clean(right.row.题目)) || left.sourceIndex - right.sourceIndex;
    })
    .map(item => item.row);
}

export function readCollection(definition: CollectionDefinition, directory = COLLECTION_DIR) {
  const filePath = path.join(directory, definition.file);
  if (!fs.existsSync(filePath)) throw new Error(`回目数据文件不存在：${filePath}`);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${definition.file} 顶层必须是数组`);
  if (parsed.length !== definition.expectedCount) {
    throw new Error(`${definition.file} 共 ${parsed.length} 条，预期 ${definition.expectedCount} 条`);
  }
  const rows = sortChapterRows(parsed as SourceRow[]);
  return rows.map((row, index) => {
    const title = clean(row.题目);
    const originalText = clean(row.文本);
    if (!title || !originalText) throw new Error(`${definition.file} 第 ${index + 1} 条缺少题目或原文`);
    const keywords = Array.isArray(row.关键词) ? row.关键词.join('、') : clean(row.关键词);
    return {
      order: index + 1,
      title,
      originalText,
      translatedText: clean(row.全文翻译) || null,
      summary: clean(row.梗概) || null,
      keywords: keywords || null,
    };
  });
}

function resolveDatabasePath(): string {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith('file:')) throw new Error('自动备份目前仅支持 SQLite file: DATABASE_URL');
  const rawPath = url.slice('file:'.length).split('?')[0];
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(BACKEND_DIR, 'prisma', rawPath);
}

async function createBackup(): Promise<string> {
  const databasePath = resolveDatabasePath();
  if (!fs.existsSync(databasePath)) throw new Error(`数据库文件不存在：${databasePath}`);
  const backupDir = path.join(path.dirname(databasePath), 'import-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `app-before-collections-${stamp}.db`);
  await prisma.$executeRawUnsafe(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
  return backupPath;
}

export async function runImport(options: { dryRun: boolean; backup: boolean }): Promise<void> {
  const sources = COLLECTIONS.map(definition => ({ definition, chapters: readCollection(definition) }));
  console.log(sources.map(({ definition, chapters }) => `${definition.title}：${chapters.length} ${definition.unit}`).join('\n'));
  if (options.dryRun) {
    console.log('Dry-run 校验通过，未修改数据库。');
    return;
  }

  const backupPath = options.backup ? await createBackup() : null;
  if (backupPath) console.log(`数据库已备份：${backupPath}`);

  await prisma.$transaction(async tx => {
    for (const { definition, chapters } of sources) {
      const description = `《${definition.title}》整本阅读，共收录 ${chapters.length} ${definition.unit}；可在阅读页切换回目。`;
      const summary = `${description}\n${chapters.map(chapter => chapter.title).join('、')}`;
      const existing = await tx.book.findFirst({ where: { title: definition.title, theme: COLLECTION_THEME } });
      const data = {
        title: definition.title,
        author: definition.author,
        dynasty: definition.dynasty,
        description,
        image: DEFAULT_IMAGE,
        category: definition.category,
        theme: COLLECTION_THEME,
        keywords: chapters.map(chapter => chapter.title).join('、'),
        originalText: chapters[0].originalText,
        translatedText: chapters[0].translatedText,
        summary,
      };
      const book = existing
        ? await tx.book.update({ where: { id: existing.id }, data })
        : await tx.book.create({ data });

      // 数据源是完整快照，先清理再写入可避免已删除或重新排序的回目残留。
      await tx.bookChapter.deleteMany({ where: { bookId: book.id } });
      await tx.bookChapter.createMany({ data: chapters.map(chapter => ({ bookId: book.id, ...chapter })) });
    }
  }, { maxWait: 30_000, timeout: 120_000 });

  const imported = await prisma.book.findMany({
    where: { theme: COLLECTION_THEME },
    select: { title: true, _count: { select: { chapters: true } } },
    orderBy: { title: 'asc' },
  });
  if (imported.length !== COLLECTIONS.length) throw new Error(`整本作品数量异常：${imported.length}`);
  for (const book of imported) {
    const expected = COLLECTIONS.find(item => item.title === book.title)?.expectedCount;
    if (book._count.chapters !== expected) throw new Error(`${book.title} 回目数量异常：${book._count.chapters}`);
  }
  console.log(`整本作品导入完成：${imported.map(book => `${book.title} ${book._count.chapters} 篇`).join('；')}`);
}

function parseArgs(args: string[]) {
  return { dryRun: args.includes('--dry-run'), backup: !args.includes('--no-backup') };
}

if (require.main === module) {
  runImport(parseArgs(process.argv.slice(2)))
    .catch(error => { console.error('整本作品导入失败，事务内修改已回滚。'); console.error(error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
