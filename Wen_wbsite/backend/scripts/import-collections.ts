/**
 * 导入按“整部作品—多个回目”组织的古典小说/传奇。
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
  unit: string;
  expectedCount: number;
  cleanupDocumentTheme?: string;
}

const BASE_COLLECTIONS: CollectionDefinition[] = [
  // 归入书库已有“传奇”分类，避免与同义的“明清传奇”拆成两个筛选项。
  { file: '长生殿.json', title: '长生殿', author: '洪昇', dynasty: '清', category: '传奇', unit: '出/篇', expectedCount: 50 },
  { file: '桃花扇.json', title: '桃花扇', author: '孔尚任', dynasty: '清', category: '传奇', unit: '出/篇', expectedCount: 53 },
  { file: '金瓶梅.json', title: '金瓶梅', author: '兰陵笑笑生（疑）', dynasty: '明代', category: '世情小说', unit: '回', expectedCount: 100 },
  { file: '官场.json', title: '官场现形记', author: '李伯元', dynasty: '晚清', category: '世情小说', unit: '回', expectedCount: 60 },
  { file: '玉娇梨.json', title: '玉娇梨', author: '荑秋散人（一说天花藏主人）', dynasty: '明末清初', category: '世情小说', unit: '回', expectedCount: 20 },
  { file: '隋唐演义.json', title: '隋唐演义', author: '褚人获', dynasty: '清', category: '历史演义', unit: '回', expectedCount: 100 },
  { file: '大唐狄公案.json', title: '大唐狄公案', author: '高罗佩', dynasty: '现代', category: '公案小说', unit: '出/篇', expectedCount: 88 },
  { file: '大宋中兴通俗演义.json', title: '大宋中兴通俗演义', author: '熊大木', dynasty: '明', category: '历史演义', unit: '回', expectedCount: 74 },
];

const TMP_COLLECTIONS: CollectionDefinition[] = [
  { file: 'tmp/八段锦.json', title: '八段锦', author: '佚名', dynasty: '明末', category: '世情小说', unit: '段/篇', expectedCount: 8 },
  { file: 'tmp/包公演义.json', title: '包公演义', author: '佚名', dynasty: '明', category: '公案小说', unit: '回', expectedCount: 100 },
  { file: 'tmp/南柯记.json', title: '南柯记', author: '汤显祖', dynasty: '明', category: '传奇', unit: '出/篇', expectedCount: 44 },
  { file: 'tmp/新增才子九云记.json', title: '新增才子九云记', author: '佚名', dynasty: '清', category: '世情小说', unit: '回', expectedCount: 31 },
  { file: 'tmp/春秋配.json', title: '春秋配', author: '佚名', dynasty: '清初', category: '世情小说', unit: '回/篇', expectedCount: 16 },
  { file: 'tmp/牡丹亭.json', title: '牡丹亭', author: '汤显祖', dynasty: '明', category: '传奇', unit: '出/篇', expectedCount: 55 },
  { file: 'tmp/皇明诸司廉明奇判公案.json', title: '皇明诸司廉明奇判公案', author: '余象斗编刊', dynasty: '明', category: '公案小说', unit: '则/篇', expectedCount: 59 },
  { file: 'tmp/紫钗记.json', title: '紫钗记', author: '汤显祖', dynasty: '明', category: '传奇', unit: '出/篇', expectedCount: 53 },
  { file: 'tmp/蜜蜂计.json', title: '蜜蜂计', author: '佚名', dynasty: '清', category: '世情小说', unit: '回', expectedCount: 5 },
  { file: 'tmp/蜜蜂记.json', title: '蜜蜂记', author: '佚名', dynasty: '清', category: '世情小说', unit: '回', expectedCount: 5 },
  { file: 'tmp/蝴蝶杯.json', title: '蝴蝶杯', author: '佚名', dynasty: '清', category: '世情小说', unit: '回', expectedCount: 10 },
  { file: 'tmp/邯郸记.json', title: '邯郸记', author: '汤显祖', dynasty: '明', category: '传奇', unit: '出/篇', expectedCount: 30 },
  { file: 'tmp/霞笺记.json', title: '霞笺记', author: '佚名', dynasty: '明末清初', category: '世情小说', unit: '回', expectedCount: 11 },
  { file: 'tmp/鸳鸯配.json', title: '鸳鸯配', author: '佚名', dynasty: '清初', category: '世情小说', unit: '回/篇', expectedCount: 12 },
].map(definition => ({
  ...definition,
  // 这些书曾被误按单篇补充文集导入，聚合导入前先清理对应旧主题。
  cleanupDocumentTheme: `文档导入：${definition.title}`,
}));

const COLLECTIONS: CollectionDefinition[] = [...BASE_COLLECTIONS, ...TMP_COLLECTIONS];

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
  const match = title.match(/(?:第|闰|加)([零〇一二两三四五六七八九十百廿卅卌\d]+)(?:回|出|段|卷)/);
  return match ? chineseNumber(match[1]) : null;
}

export function sortChapterRows(rows: SourceRow[]): SourceRow[] {
  const items = rows.map((row, sourceIndex) => {
    const title = clean(row.题目);
    const number = chapterNumber(title);
    const trailingMatch = number === null ? title.match(/^(.*?)[\s　]+([零〇一二两三四五六七八九十百廿卅卌\d]+)$/) : null;
    const trailingNumber = trailingMatch ? chineseNumber(trailingMatch[2]) : null;
    return {
      row,
      sourceIndex,
      title,
      number,
      trailingGroup: trailingNumber === null ? null : trailingMatch?.[1].trim() || null,
      trailingNumber,
    };
  });
  const firstNumberedIndex = items.find(item => item.number !== null)?.sourceIndex ?? -1;
  const firstTrailingGroupIndex = new Map<string, number>();
  for (const item of items) {
    if (item.trailingGroup && !firstTrailingGroupIndex.has(item.trailingGroup)) {
      firstTrailingGroupIndex.set(item.trailingGroup, item.sourceIndex);
    }
  }
  return items
    .sort((left, right) => {
      if (firstNumberedIndex >= 0) {
        const section = (item: typeof left) => item.number === null
          ? item.sourceIndex < firstNumberedIndex ? 0 : 2
          : 1;
        const leftSection = section(left);
        const rightSection = section(right);
        if (leftSection !== rightSection) return leftSection - rightSection;
        if (leftSection !== 1) return left.sourceIndex - right.sourceIndex;
        if (left.number !== right.number) return (left.number ?? 0) - (right.number ?? 0);
        const rank = (title: string) => title.startsWith('加') ? -1 : title.startsWith('闰') ? 1 : 0;
        return rank(left.title) - rank(right.title) || left.sourceIndex - right.sourceIndex;
      }

      // 《大唐狄公案》这类标题没有“第几回”，用“案名 一/二/三”的尾号整理同组篇章。
      const groupOrder = (item: typeof left) => item.trailingGroup
        ? firstTrailingGroupIndex.get(item.trailingGroup) ?? item.sourceIndex
        : item.sourceIndex;
      const leftGroupOrder = groupOrder(left);
      const rightGroupOrder = groupOrder(right);
      if (leftGroupOrder !== rightGroupOrder) return leftGroupOrder - rightGroupOrder;
      if (left.trailingGroup && right.trailingGroup && left.trailingGroup === right.trailingGroup) {
        return (left.trailingNumber ?? 0) - (right.trailingNumber ?? 0) || left.sourceIndex - right.sourceIndex;
      }
      return left.sourceIndex - right.sourceIndex;
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
  const cleanupThemes = COLLECTIONS
    .map(definition => definition.cleanupDocumentTheme)
    .filter((theme): theme is string => Boolean(theme));
  const cleanupCount = cleanupThemes.length
    ? await prisma.book.count({ where: { theme: { in: cleanupThemes } } })
    : 0;
  console.log(sources.map(({ definition, chapters }) => `${definition.title}：${chapters.length} ${definition.unit}`).join('\n'));
  if (cleanupCount) console.log(`将清理误按单篇导入的旧记录：${cleanupCount} 部`);
  if (options.dryRun) {
    console.log('Dry-run 校验通过，未修改数据库。');
    return;
  }

  const backupPath = options.backup ? await createBackup() : null;
  if (backupPath) console.log(`数据库已备份：${backupPath}`);

  await prisma.$transaction(async tx => {
    if (cleanupThemes.length) {
      // 聚合导入是唯一来源，先清理旧的单篇 Book，避免文库中出现同一作品的散篇副本。
      await tx.book.deleteMany({ where: { theme: { in: cleanupThemes } } });
    }

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
