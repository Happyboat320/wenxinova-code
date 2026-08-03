/**
 * 一键导入全部书库数据。
 *
 * 数据源：
 * 1. data/ancient_prose.json（通用古文库）
 * 2. 小说目录信息.xlsx + texts/唐宋传奇选.txt（精选小说元数据、原文和注释）
 * 3. data/doc 目录及子目录中的 JSON（单篇补充文集）
 *
 * 保留 User、Creation 以及 Creation.bookId；精选与 JSON 同名时忽略精选版本。
 * 已有 JSON 数据按原始导入顺序原位更新，以保持 Book.id 稳定。
 */

import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();
const BACKEND_DIR = path.resolve(__dirname, '..');
const JSON_PATH = path.join(BACKEND_DIR, 'data', 'ancient_prose.json');
const EXCEL_PATH = path.join(BACKEND_DIR, '小说目录信息.xlsx');
const TEXT_PATH = path.join(BACKEND_DIR, 'texts', '唐宋传奇选.txt');
const DOCUMENT_DIR = path.join(BACKEND_DIR, 'data', 'doc');
const DOCUMENT_EXPECTED_COUNT = 523;
const JSON_THEME = '新导入';
const DOCUMENT_THEME_PREFIX = '文档导入：';
const DEFAULT_IMAGE = 'https://img.zcool.cn/community/01e3c85e1f6f5da80120a8957c7227.jpg';
const FOOTNOTE_REGEX = /\\?\[\d+\]/g;

interface JsonSourceRow {
  题目?: string;
  文本?: string;
  全文翻译?: string;
  关键词?: string[];
  梗概?: string;
  体裁?: string;
  朝代?: string;
  来源?: string;
}

interface ExcelSourceRow {
  序号?: number | string;
  篇名?: string;
  年代?: string;
  作者?: string;
  注释数目?: number | string;
  题材体裁?: string;
  类别?: string;
  主题?: string;
  人物?: string;
  关键词?: string;
  梗概?: string;
}

interface DocumentSourceRow {
  题目?: string;
  入话?: string;
  文本?: string;
  注释?: string;
  全文翻译?: string;
  异说?: string;
  关键词?: string[];
  梗概?: string;
  题材体裁?: string;
  朝代?: string;
  来源?: string;
}

interface ParsedAnnotation {
  index: number;
  content: string;
}

interface ParsedTextEntry {
  index: number;
  title: string;
  author: string;
  summary: string | null;
  originalText: string;
  annotations: ParsedAnnotation[];
}

interface ParsedDocumentEntry {
  sourceFile: string;
  data: Prisma.BookUncheckedCreateInput;
  annotations: ParsedAnnotation[];
}

interface ImportOptions {
  dryRun: boolean;
  backup: boolean;
}

const jsonBookSelect = {
  id: true,
  title: true,
  author: true,
  dynasty: true,
  description: true,
  image: true,
  category: true,
  theme: true,
  keywords: true,
  originalText: true,
  translatedText: true,
  summary: true,
} satisfies Prisma.BookSelect;

type JsonBookRecord = Prisma.BookGetPayload<{ select: typeof jsonBookSelect }>;
type BookWriteData = Omit<JsonBookRecord, 'id'>;

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

function stripFootnotes(value: string): string {
  return value.replace(FOOTNOTE_REGEX, '');
}

function cleanSingleLine(value: unknown, removeFootnotes = true): string {
  if (value === undefined || value === null) return '';
  const normalized = normalizeNewlines(String(value)).replace(/\u3000/g, ' ');
  return (removeFootnotes ? stripFootnotes(normalized) : normalized).replace(/\s+/g, ' ').trim();
}

function cleanMultiline(value: unknown, removeFootnotes = true): string {
  if (value === undefined || value === null) return '';
  const normalized = normalizeNewlines(String(value)).replace(/\u3000/g, ' ');
  const processed = (removeFootnotes ? stripFootnotes(normalized) : normalized)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n');
  return processed.replace(/\n{3,}/g, '\n\n').trim();
}

function nullable(value: string): string | null {
  return value.trim() || null;
}

function parseAnnotationCount(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number.parseInt(String(value).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function transformJsonRow(row: JsonSourceRow): BookWriteData {
  const summary = row.梗概 || '';
  return {
    title: row.题目 || '未命名',
    author: row.来源 || '未知作者',
    dynasty: row.朝代 || '未知',
    description: summary.length > 200 ? `${summary.slice(0, 197)}...` : summary,
    image: DEFAULT_IMAGE,
    category: row.体裁 || '笔记小说',
    theme: JSON_THEME,
    keywords: row.关键词 ? row.关键词.join(', ') : '',
    originalText: row.文本 || '',
    translatedText: row.全文翻译 || '',
    summary,
  };
}

function readJsonSource(filePath = JSON_PATH): BookWriteData[] {
  if (!fs.existsSync(filePath)) throw new Error(`JSON 数据文件不存在: ${filePath}`);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error('JSON 数据顶层必须是数组');
  return (parsed as JsonSourceRow[]).map(transformJsonRow);
}

function transformExcelRow(row: ExcelSourceRow) {
  const title = cleanSingleLine(row.篇名);
  if (!title) throw new Error(`Excel 第 ${row.序号 ?? '?'} 行缺少篇名`);
  const summary = nullable(cleanMultiline(row.梗概));
  const description = summary ? summary.replace(/\s+/g, ' ').slice(0, 200) : null;
  return {
    title,
    author: cleanSingleLine(row.作者) || '佚名',
    dynasty: nullable(cleanSingleLine(row.年代)),
    category: nullable(cleanSingleLine(row.题材体裁 || row.类别)),
    theme: nullable(cleanSingleLine(row.主题)),
    mainCharacters: nullable(cleanSingleLine(row.人物)),
    keywords: nullable(cleanSingleLine(row.关键词)),
    annotationCount: parseAnnotationCount(row.注释数目),
    description,
    summary,
    image: DEFAULT_IMAGE,
    characterNames: cleanSingleLine(row.人物)
      .split(/[；;，,、]/)
      .map((name) => name.trim())
      .filter(Boolean),
  };
}

function readExcelSource(filePath = EXCEL_PATH) {
  if (!fs.existsSync(filePath)) throw new Error(`Excel 数据文件不存在: ${filePath}`);
  const workbook = XLSX.readFile(filePath);
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error('Excel 中没有工作表');
  const rows = XLSX.utils.sheet_to_json<ExcelSourceRow>(workbook.Sheets[firstSheet], { defval: '' });
  return rows.map(transformExcelRow);
}

function parseDocumentAnnotations(value: unknown): ParsedAnnotation[] {
  const text = cleanMultiline(value, false);
  if (!text) return [];

  const marker = /(?:\\?\[(\d+)\]|【(\d+)】|(?:^|\s)(\d+)[.、：:])\s*/g;
  const matches = [...text.matchAll(marker)];
  if (matches.length === 0) return [{ index: 1, content: text }];

  const unique = new Map<number, ParsedAnnotation>();
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const annotationIndex = Number.parseInt(match[1] ?? match[2] ?? match[3], 10);
    const contentStart = (match.index ?? 0) + match[0].length;
    const contentEnd = matches[index + 1]?.index ?? text.length;
    const content = cleanMultiline(text.slice(contentStart, contentEnd));
    if (content && !unique.has(annotationIndex)) unique.set(annotationIndex, { index: annotationIndex, content });
  }
  return [...unique.values()].sort((left, right) => left.index - right.index);
}

function documentCollection(fileName: string): string {
  return path.basename(fileName, '.json').replace(/——.*$/, '');
}

function transformDocumentRow(row: DocumentSourceRow, sourceFile: string): ParsedDocumentEntry {
  const title = cleanSingleLine(row.题目);
  if (!title) throw new Error(`${sourceFile} 中存在缺少题目的记录`);
  const intro = cleanMultiline(row.入话, false);
  const text = cleanMultiline(row.文本, false);
  const summary = cleanMultiline(row.梗概);
  const variants = cleanMultiline(row.异说);
  const annotations = parseDocumentAnnotations(row.注释);
  const originalText = intro ? `【入话】\n${intro}\n\n【正文】\n${text}` : text;
  const completeSummary = variants ? `${summary}${summary ? '\n\n' : ''}【异说】\n${variants}` : summary;

  return {
    sourceFile,
    data: {
      title,
      author: cleanSingleLine(row.来源) || '未知作者',
      dynasty: nullable(cleanSingleLine(row.朝代)),
      description: nullable(summary.replace(/\s+/g, ' ').slice(0, 200)),
      image: DEFAULT_IMAGE,
      category: nullable(cleanSingleLine(row.题材体裁)),
      theme: `${DOCUMENT_THEME_PREFIX}${documentCollection(sourceFile)}`,
      keywords: nullable(Array.isArray(row.关键词) ? row.关键词.map((value) => cleanSingleLine(value)).filter(Boolean).join(', ') : ''),
      annotationCount: annotations.length,
      originalText,
      translatedText: nullable(cleanMultiline(row.全文翻译)),
      summary: nullable(completeSummary),
    },
    annotations,
  };
}

function listDocumentJsonFiles(dirPath: string): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return listDocumentJsonFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : [];
  }).sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

function readDocumentSources(dirPath = DOCUMENT_DIR): ParsedDocumentEntry[] {
  if (!fs.existsSync(dirPath)) throw new Error(`补充文集目录不存在: ${dirPath}`);
  // 递归读取可兼容补充文集后续按子目录整理的情况；整本作品不放在此目录。
  const files = listDocumentJsonFiles(dirPath);
  if (files.length === 0) throw new Error(`补充文集目录中没有 JSON 文件: ${dirPath}`);

  const entries: ParsedDocumentEntry[] = [];
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    const sourceFile = path.relative(dirPath, file);
    if (!Array.isArray(parsed)) throw new Error(`${sourceFile} 顶层必须是数组`);
    entries.push(...(parsed as DocumentSourceRow[]).map((row) => transformDocumentRow(row, sourceFile)));
  }
  return entries;
}

function parseAnnotationBlock(block: string): ParsedAnnotation[] {
  const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
  const entries: ParsedAnnotation[] = [];
  let currentIndex: number | null = null;
  let buffer: string[] = [];
  const marker = /^(?:\\?\[(\d+)\]|(\d+)[.：:、])/;
  const flush = () => {
    if (currentIndex === null) return;
    entries.push({ index: currentIndex, content: cleanMultiline(buffer.join('\n'), false) });
  };

  for (const line of lines) {
    const match = line.match(marker);
    if (match) {
      flush();
      currentIndex = Number.parseInt(match[1] ?? match[2], 10);
      const remainder = line.slice(match[0].length).trim();
      buffer = remainder ? [remainder] : [];
    } else if (currentIndex !== null) {
      buffer.push(line);
    }
  }
  flush();

  const unique = new Map<number, ParsedAnnotation>();
  for (const entry of entries) if (!unique.has(entry.index)) unique.set(entry.index, entry);
  return [...unique.values()].sort((left, right) => left.index - right.index);
}

function parseTextSource(filePath = TEXT_PATH): ParsedTextEntry[] {
  if (!fs.existsSync(filePath)) throw new Error(`TXT 数据文件不存在: ${filePath}`);
  const content = normalizeNewlines(fs.readFileSync(filePath, 'utf8'));
  const sections = content.split(/\n(?=\d+\n)/);
  const entries: ParsedTextEntry[] = [];

  for (const section of sections) {
    const trimmed = section.trim();
    const indexMatch = trimmed.match(/^(\d+)/);
    const authorMatch = trimmed.match(/作者：([^\n]+)/);
    const titleMatch = trimmed.match(/篇名：([^\n]+)/);
    const summaryMatch = /(?:故事)?梗概：/.exec(trimmed);
    const originalIndex = trimmed.indexOf('原文：');
    if (!indexMatch || !authorMatch || !titleMatch || !summaryMatch) continue;

    const summaryStart = summaryMatch.index + summaryMatch[0].length;
    const implicitOriginalIndex = originalIndex < 0 ? trimmed.indexOf('\n\n', summaryStart) : -1;
    const summaryEnd = originalIndex >= 0 ? originalIndex : implicitOriginalIndex;
    if (summaryEnd < 0) continue;
    const originalStart = originalIndex >= 0 ? originalIndex + '原文：'.length : summaryEnd;
    const remainder = trimmed.slice(originalStart).trimStart();
    const annotationMatch = /\n+\s*注释：/.exec(remainder);
    const originalPart = annotationMatch ? remainder.slice(0, annotationMatch.index) : remainder;
    const annotationPart = annotationMatch
      ? remainder.slice(annotationMatch.index + annotationMatch[0].length)
      : '';
    const originalText = cleanMultiline(originalPart, false);
    if (!originalText) continue;

    entries.push({
      index: Number.parseInt(indexMatch[1], 10),
      title: cleanSingleLine(titleMatch[1]),
      author: cleanSingleLine(authorMatch[1]) || '佚名',
      summary: nullable(cleanMultiline(trimmed.slice(summaryStart, summaryEnd))),
      originalText,
      annotations: parseAnnotationBlock(annotationPart).map((annotation) => ({
        ...annotation,
        content: cleanMultiline(annotation.content),
      })),
    });
  }
  return entries;
}

function sameJsonBook(existing: JsonBookRecord, expected: BookWriteData): boolean {
  return (Object.keys(expected) as Array<keyof BookWriteData>)
    .every((key) => existing[key] === expected[key]);
}

function sameDocumentBook(
  existing: Record<string, unknown> & { annotations: ParsedAnnotation[] },
  expected: ParsedDocumentEntry,
): boolean {
  const sameFields = Object.entries(expected.data).every(([key, value]) => existing[key] === value);
  const actualAnnotations = existing.annotations.map(({ index, content }) => ({ index, content }));
  return sameFields && JSON.stringify(actualAnnotations) === JSON.stringify(expected.annotations);
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function resolveDatabasePath(): string {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith('file:')) throw new Error('一键备份目前仅支持 SQLite file: DATABASE_URL');
  const rawPath = url.slice('file:'.length).split('?')[0];
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(BACKEND_DIR, 'prisma', rawPath);
}

async function createBackup(): Promise<string> {
  const databasePath = resolveDatabasePath();
  if (!fs.existsSync(databasePath)) throw new Error(`数据库文件不存在: ${databasePath}`);
  const backupDir = path.join(path.dirname(databasePath), 'import-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `app-before-import-${stamp}.db`);
  const escaped = backupPath.replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${escaped}'`);
  return backupPath;
}

async function runImport(options: ImportOptions): Promise<void> {
  console.log('读取并校验数据源...');
  const jsonRows = readJsonSource();
  const excelRows = readExcelSource();
  const textRows = parseTextSource();
  const documentRows = readDocumentSources();
  const jsonTitles = new Set(jsonRows.map((row) => row.title));
  const ignoredTitles = excelRows.map((row) => row.title).filter((title) => jsonTitles.has(title));
  const selectedExcelRows = excelRows.filter((row) => !jsonTitles.has(row.title));
  const selectedTitles = new Set(selectedExcelRows.map((row) => row.title));
  const selectedTextRows = textRows.filter((row) => selectedTitles.has(row.title));

  if (excelRows.length !== 39 || textRows.length !== 39) {
    throw new Error(`精选数据数量异常：Excel ${excelRows.length} 篇，TXT ${textRows.length} 篇（预期均为 39）`);
  }
  const excelTitles = new Set(excelRows.map((row) => row.title));
  const missingText = excelRows.filter((row) => !textRows.some((text) => text.title === row.title)).map((row) => row.title);
  const extraText = textRows.filter((row) => !excelTitles.has(row.title)).map((row) => row.title);
  if (missingText.length || extraText.length) {
    throw new Error(`Excel/TXT 标题不一致；缺少正文: ${missingText.join('、') || '无'}；多余正文: ${extraText.join('、') || '无'}`);
  }
  if (new Set(ignoredTitles).size !== ignoredTitles.length) throw new Error('Excel 中存在重复篇名');

  if (documentRows.length !== DOCUMENT_EXPECTED_COUNT) {
    throw new Error(`补充文集数量异常：读取到 ${documentRows.length} 条（预期 ${DOCUMENT_EXPECTED_COUNT}）`);
  }
  const occupiedTitles = new Set([...jsonTitles, ...excelTitles]);
  const ignoredDocumentRows: ParsedDocumentEntry[] = [];
  const selectedDocumentRows: ParsedDocumentEntry[] = [];
  for (const row of documentRows) {
    const title = String(row.data.title);
    if (occupiedTitles.has(title)) {
      ignoredDocumentRows.push(row);
      continue;
    }
    occupiedTitles.add(title);
    selectedDocumentRows.push(row);
  }
  const selectedDocumentTitles = new Set(selectedDocumentRows.map((row) => String(row.data.title)));

  const [existingJsonBooks, existingDocumentBooks, usersBefore, creationsBefore] = await Promise.all([
    prisma.book.findMany({ where: { theme: JSON_THEME }, select: jsonBookSelect, orderBy: { id: 'asc' } }),
    prisma.book.findMany({
      where: { theme: { startsWith: DOCUMENT_THEME_PREFIX } },
      include: { annotations: { select: { index: true, content: true }, orderBy: { index: 'asc' } } },
      orderBy: { id: 'asc' },
    }),
    prisma.user.count(),
    prisma.creation.findMany({ select: { id: true, userId: true, bookId: true }, orderBy: { id: 'asc' } }),
  ]);
  if (existingJsonBooks.length !== 0 && existingJsonBooks.length !== jsonRows.length) {
    throw new Error(`数据库中标记为“${JSON_THEME}”的书有 ${existingJsonBooks.length} 本，源数据有 ${jsonRows.length} 本；为避免错误关联，已停止导入`);
  }
  const existingDocumentTitles = existingDocumentBooks.map((book) => book.title);
  const duplicateExistingDocuments = existingDocumentTitles.filter((title, index) => existingDocumentTitles.indexOf(title) !== index);
  if (duplicateExistingDocuments.length) {
    throw new Error(`数据库中补充文集存在重复标题: ${[...new Set(duplicateExistingDocuments)].join('、')}`);
  }

  const selectedMatches = await prisma.book.findMany({
    where: { title: { in: [...selectedTitles] } },
    select: { title: true },
  });
  const matchCounts = new Map<string, number>();
  for (const row of selectedMatches) matchCounts.set(row.title, (matchCounts.get(row.title) ?? 0) + 1);
  const duplicateSelected = [...matchCounts].filter(([, count]) => count > 1).map(([title]) => title);
  if (duplicateSelected.length) {
    throw new Error(`精选书目在数据库中存在多条同名记录: ${duplicateSelected.join('、')}`);
  }

  const existingDocumentMap = new Map(existingDocumentBooks.map((book) => [book.title, book]));
  const missingDocumentSources = existingDocumentBooks
    .filter((book) => !selectedDocumentTitles.has(book.title))
    .map((book) => book.title);
  if (missingDocumentSources.length) {
    throw new Error(`数据库中已有补充文集不在当前源数据内: ${missingDocumentSources.join('、')}`);
  }
  const unrelatedDocumentMatches = await prisma.book.findMany({
    where: {
      title: { in: [...selectedDocumentTitles] },
      NOT: { theme: { startsWith: DOCUMENT_THEME_PREFIX } },
    },
    select: { title: true },
  });
  if (unrelatedDocumentMatches.length) {
    throw new Error(`补充文集标题与数据库其他记录冲突: ${unrelatedDocumentMatches.map((row) => row.title).join('、')}`);
  }

  const jsonChanges = existingJsonBooks.length === 0
    ? jsonRows.length
    : existingJsonBooks.filter((book, index) => !sameJsonBook(book, jsonRows[index])).length;
  const documentChanges = selectedDocumentRows.filter((row) => {
    const existing = existingDocumentMap.get(String(row.data.title));
    return !existing || !sameDocumentBook(
      existing as unknown as Record<string, unknown> & { annotations: ParsedAnnotation[] },
      row,
    );
  }).length;
  console.log(`JSON：${jsonRows.length} 条，需新增/更新 ${jsonChanges} 条`);
  console.log(`精选：39 篇；忽略同名 ${ignoredTitles.length} 篇（${ignoredTitles.join('、')}）；导入 ${selectedExcelRows.length} 篇`);
  console.log(`精选现有 ${selectedMatches.length} 篇，预计新增 ${selectedExcelRows.length - selectedMatches.length} 篇`);
  console.log(`补充文集：${documentRows.length} 条；忽略同名 ${ignoredDocumentRows.length} 条；导入 ${selectedDocumentRows.length} 条；需新增/更新 ${documentChanges} 条`);

  if (options.dryRun) {
    console.log('Dry-run 校验通过，未修改数据库。');
    return;
  }

  let backupPath: string | null = null;
  if (options.backup) {
    backupPath = await createBackup();
    console.log(`数据库已备份：${backupPath}`);
  }

  await prisma.$transaction(async (tx) => {
    if (existingJsonBooks.length === 0) {
      for (const batch of chunks(jsonRows, 300)) await tx.book.createMany({ data: batch });
    } else {
      const changed = existingJsonBooks
        .map((book, index) => ({ book, data: jsonRows[index] }))
        .filter(({ book, data }) => !sameJsonBook(book, data));
      let completed = 0;
      for (const batch of chunks(changed, 100)) {
        await Promise.all(batch.map(({ book, data }) => tx.book.update({ where: { id: book.id }, data })));
        completed += batch.length;
        if (changed.length > 0 && (completed % 1_000 === 0 || completed === changed.length)) {
          console.log(`JSON 更新进度：${completed}/${changed.length}`);
        }
      }
    }

    for (const row of selectedExcelRows) {
      const existing = await tx.book.findFirst({ where: { title: row.title } });
      const { characterNames, ...bookData } = row;
      const book = existing
        ? await tx.book.update({ where: { id: existing.id }, data: bookData })
        : await tx.book.create({ data: bookData });

      await tx.character.deleteMany({ where: { bookId: book.id } });
      if (characterNames.length) {
        await tx.character.createMany({
          data: characterNames.map((name) => ({
            bookId: book.id,
            name,
            description: `《${row.title}》中的角色`,
          })),
        });
      }
    }

    for (const text of selectedTextRows) {
      const book = await tx.book.findFirstOrThrow({ where: { title: text.title } });
      await tx.book.update({
        where: { id: book.id },
        data: { originalText: text.originalText, annotationCount: text.annotations.length },
      });
      await tx.annotation.deleteMany({ where: { bookId: book.id } });
      if (text.annotations.length) {
        await tx.annotation.createMany({
          data: text.annotations.map((annotation) => ({ bookId: book.id, ...annotation })),
        });
      }
    }

    for (const row of selectedDocumentRows) {
      const existing = existingDocumentMap.get(String(row.data.title));
      if (existing && sameDocumentBook(
        existing as unknown as Record<string, unknown> & { annotations: ParsedAnnotation[] },
        row,
      )) continue;

      const book = existing
        ? await tx.book.update({ where: { id: existing.id }, data: row.data })
        : await tx.book.create({ data: row.data });
      await tx.annotation.deleteMany({ where: { bookId: book.id } });
      if (row.annotations.length) {
        await tx.annotation.createMany({
          data: row.annotations.map((annotation) => ({ bookId: book.id, ...annotation })),
        });
      }
    }
  }, { maxWait: 30_000, timeout: 10 * 60_000 });

  const [jsonCount, selectedBooks, documentBooks, usersAfter, creationsAfter] = await Promise.all([
    prisma.book.count({ where: { theme: JSON_THEME } }),
    prisma.book.findMany({
      where: { title: { in: [...selectedTitles] } },
      select: { title: true, originalText: true, annotationCount: true, _count: { select: { annotations: true } } },
    }),
    prisma.book.findMany({
      where: { theme: { startsWith: DOCUMENT_THEME_PREFIX } },
      select: { title: true, originalText: true, annotationCount: true, _count: { select: { annotations: true } } },
    }),
    prisma.user.count(),
    prisma.creation.findMany({ select: { id: true, userId: true, bookId: true }, orderBy: { id: 'asc' } }),
  ]);
  if (jsonCount !== jsonRows.length) throw new Error(`导入后 JSON 书目数异常: ${jsonCount}`);
  if (selectedBooks.length !== selectedExcelRows.length) throw new Error(`导入后精选书目数异常: ${selectedBooks.length}`);
  if (documentBooks.length !== selectedDocumentRows.length) throw new Error(`导入后补充文集数异常: ${documentBooks.length}`);
  const invalidSelected = selectedBooks.filter((book) =>
    !book.originalText || book.annotationCount !== book._count.annotations);
  if (invalidSelected.length) throw new Error(`精选正文或注释校验失败: ${invalidSelected.map((book) => book.title).join('、')}`);
  const invalidDocuments = documentBooks.filter((book) =>
    !book.originalText || book.annotationCount !== book._count.annotations);
  if (invalidDocuments.length) throw new Error(`补充文集正文或注释校验失败: ${invalidDocuments.map((book) => book.title).join('、')}`);
  if (usersAfter !== usersBefore) throw new Error(`用户数量发生变化: ${usersBefore} -> ${usersAfter}`);
  if (JSON.stringify(creationsAfter) !== JSON.stringify(creationsBefore)) throw new Error('创作记录或书籍关联发生变化');

  const totalBooks = await prisma.book.count();
  const totalAnnotations = selectedBooks.reduce((sum, book) => sum + book._count.annotations, 0);
  const documentAnnotations = documentBooks.reduce((sum, book) => sum + book._count.annotations, 0);
  console.log('='.repeat(60));
  console.log('一键导入完成');
  console.log(`书籍总数：${totalBooks}；JSON：${jsonCount}；精选：${selectedBooks.length}；补充文集：${documentBooks.length}`);
  console.log(`精选注释：${totalAnnotations}；补充文集注释：${documentAnnotations}；用户：${usersAfter}；创作：${creationsAfter.length}`);
  console.log(`创作—书籍关联保持不变；备份：${backupPath ?? '已禁用'}`);
}

function parseArgs(args: string[]): ImportOptions {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('用法: pnpm import:all [-- --dry-run] [--no-backup]\n\n  --dry-run    只校验并显示导入计划\n  --no-backup  不创建导入前数据库备份（不推荐）');
    process.exit(0);
  }
  return { dryRun: args.includes('--dry-run'), backup: !args.includes('--no-backup') };
}

async function main() {
  await runImport(parseArgs(process.argv.slice(2)));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('一键导入失败；事务内错误会自动回滚，可使用导入前备份恢复。');
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}

export {
  parseAnnotationBlock,
  parseDocumentAnnotations,
  parseTextSource,
  readDocumentSources,
  readExcelSource,
  readJsonSource,
  runImport,
  transformJsonRow,
};
