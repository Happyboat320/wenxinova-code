/**
 * TXT 文本导入脚本
 * 
 * 使用说明：
 * 1. 支持单本小说文本导入与《唐宋传奇选》这类选集拆分导入。
 * 2. 默认从 backend/texts 目录读取文件。
 * 3. 脚本会自动解析“原文：”、“故事梗概：”以及注释标记（如 [1]）。
 * 4. 运行方式：在 backend 目录下执行 npx ts-node scripts/import-text.ts
 * 5. 注意：脚本内部包含针对特定文件（如《唐宋传奇选.txt》）的解析逻辑。
 */

import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';

const prisma = new PrismaClient();

const DEFAULT_TEXT_DIR = path.join(__dirname, '..', 'texts');

type Encoding = 'utf-8' | 'utf8' | 'gbk' | 'gb2312';

const FOOTNOTE_REGEX = /\\?\[\d+\]/g;
const SUMMARY_LABEL = '故事梗概：';
const ORIGINAL_LABEL = '原文：';

interface AnthologyEntry {
  index: number;
  title: string;
  author: string;
  summary: string | null;
  originalText: string;
  annotations: ParsedAnnotation[];
}

interface ImportOptions {
  encoding?: Encoding;
  createIfNotExists?: boolean;
  forcedType?: 'original' | 'translated';
  bookTitleOverride?: string;
}

interface ImportCounts {
  processed: number;
  success: number;
  failure: number;
  skipped: number;
}

interface ParsedAnnotation {
  index: number;
  content: string;
}

function readTextFile(filePath: string, encoding: Encoding = 'utf-8'): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  return fs.readFileSync(filePath, { encoding: encoding as BufferEncoding }).toString().trim();
}

function parseFileName(fileName: string): { bookTitle: string; type: 'original' | 'translated' } {
  const nameWithoutExt = fileName.replace(/\.txt$/i, '');

  if (nameWithoutExt.endsWith('_译文') || nameWithoutExt.endsWith('_翻译') || nameWithoutExt.endsWith('_白话')) {
    return {
      bookTitle: nameWithoutExt.replace(/_(译文|翻译|白话)$/i, ''),
      type: 'translated',
    };
  }

  if (nameWithoutExt.endsWith('_原文') || nameWithoutExt.endsWith('_文言')) {
    return {
      bookTitle: nameWithoutExt.replace(/_(原文|文言)$/i, ''),
      type: 'original',
    };
  }

  return {
    bookTitle: nameWithoutExt,
    type: 'original',
  };
}

function scanTextFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    console.log(`目录不存在，创建: ${dirPath}`);
    fs.mkdirSync(dirPath, { recursive: true });
    return [];
  }

  return fs
    .readdirSync(dirPath)
    .filter((file) => file.toLowerCase().endsWith('.txt'))
    .map((file) => path.join(dirPath, file));
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

function stripFootnotes(value: string): string {
  return value.replace(FOOTNOTE_REGEX, '');
}

function cleanSingleLineText(value: unknown, options: { removeFootnotes?: boolean } = {}): string {
  if (value === undefined || value === null) {
    return '';
  }

  const removeFootnotes = options.removeFootnotes ?? true;
  const normalized = normalizeNewlines(String(value)).replace(/\u3000/g, ' ');
  const processed = removeFootnotes ? stripFootnotes(normalized) : normalized;
  return processed.replace(/\s+/g, ' ').trim();
}

function cleanMultilineText(value: unknown, options: { removeFootnotes?: boolean } = {}): string {
  if (value === undefined || value === null) {
    return '';
  }

  const removeFootnotes = options.removeFootnotes ?? true;
  const normalized = normalizeNewlines(String(value)).replace(/\u3000/g, ' ');
  const processed = (removeFootnotes ? stripFootnotes(normalized) : normalized)
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n');

  return processed.replace(/\n{3,}/g, '\n\n').trim();
}

function splitTextAndAnnotations(raw: string): { text: string; annotations: ParsedAnnotation[] } {
  const normalized = normalizeNewlines(raw);
  const match = /\n{1,}\s*注释：/.exec(normalized);

  if (!match) {
    return {
      text: normalized.trim(),
      annotations: [],
    };
  }

  const textPart = normalized.slice(0, match.index).trim();
  const annotationsPart = normalized.slice(match.index + match[0].length).trim();

  return {
    text: textPart,
    annotations: parseAnnotationBlock(annotationsPart),
  };
}

function parseAnnotationBlock(block: string): ParsedAnnotation[] {
  if (!block) {
    return [];
  }

  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const entries: ParsedAnnotation[] = [];
  let currentIndex: number | null = null;
  let buffer: string[] = [];

  const startRegex = /^(?:\\?\[(\d+)\]|(\d+)[\.\:：、])/;

  const flushCurrent = () => {
    if (currentIndex === null) {
      return;
    }

    const content = cleanMultilineText(buffer.join('\n'), { removeFootnotes: false });
    entries.push({
      index: currentIndex,
      content,
    });
  };

  for (const line of lines) {
    const match = line.match(startRegex);
    if (match) {
      flushCurrent();
      const marker = match[1] ?? match[2];
      const parsedIndex = marker ? parseInt(marker, 10) : NaN;
      currentIndex = Number.isFinite(parsedIndex) ? parsedIndex : entries.length + 1;
      const remainder = line.slice(match[0].length).trim();
      buffer = remainder ? [remainder] : [];
    } else if (currentIndex !== null) {
      buffer.push(line);
    }
  }

  flushCurrent();

  const unique = new Map<number, ParsedAnnotation>();
  for (const entry of entries) {
    if (!unique.has(entry.index)) {
      unique.set(entry.index, entry);
    }
  }

  return Array.from(unique.values()).sort((a, b) => a.index - b.index);
}

async function replaceBookAnnotations(bookId: number, annotations: ParsedAnnotation[]): Promise<void> {
  await prisma.annotation.deleteMany({ where: { bookId } });

  if (!annotations.length) {
    return;
  }

  await prisma.annotation.createMany({
    data: annotations.map((annotation) => ({
      bookId,
      index: annotation.index,
      content: annotation.content,
    })),
  });
}

function looksLikeAnthology(content: string): boolean {
  const normalized = normalizeNewlines(content);
  const titleMatches = normalized.match(/篇名：/g) || [];
  const numberedMatches = normalized.match(/\n\d+\n/g) || [];
  return titleMatches.length >= 2 && numberedMatches.length >= 2;
}

function parseAnthologyEntries(content: string): AnthologyEntry[] {
  const normalized = normalizeNewlines(content);
  const sections = normalized.split(/\n(?=\d+\n)/);
  const entries: AnthologyEntry[] = [];

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const indexMatch = trimmed.match(/^(\d+)/);
    if (!indexMatch) continue;
    const index = Number(indexMatch[1]);

    const authorMatch = trimmed.match(/作者：([^\n]+)/);
    const titleMatch = trimmed.match(/篇名：([^\n]+)/);
    const summaryIdx = trimmed.indexOf(SUMMARY_LABEL);
    const originalIdx = trimmed.indexOf(ORIGINAL_LABEL);

    if (!authorMatch || !titleMatch || summaryIdx === -1 || originalIdx === -1) {
      continue;
    }

    const author = cleanSingleLineText(authorMatch[1]) || '佚名';
    const title = cleanSingleLineText(titleMatch[1]);
    if (!title) {
      continue;
    }

    const summaryRaw = trimmed.slice(summaryIdx + SUMMARY_LABEL.length, originalIdx).trim();
    const summary = summaryRaw ? cleanMultilineText(summaryRaw) : null;

    const remainder = trimmed.slice(originalIdx + ORIGINAL_LABEL.length);
    const { text: originalSegment, annotations } = splitTextAndAnnotations(remainder);
    const originalText = cleanMultilineText(originalSegment, { removeFootnotes: false });

    if (!originalText) {
      continue;
    }

    entries.push({
      index,
      title,
      author,
      summary,
      originalText,
      annotations,
    });
  }

  return entries;
}

function mergeCounts(target: ImportCounts, delta: ImportCounts): ImportCounts {
  return {
    processed: target.processed + delta.processed,
    success: target.success + delta.success,
    failure: target.failure + delta.failure,
    skipped: target.skipped + delta.skipped,
  };
}

function formatCountsSummary(label: string, counts: ImportCounts): string {
  if (counts.processed <= 1) {
    if (counts.success >= 1) {
      return `${label}: 导入成功`;
    }
    if (counts.skipped >= 1) {
      return `${label}: 无需更新`;
    }
    return `${label}: 导入失败`;
  }

  return `${label}: 处理 ${counts.processed} 篇，成功 ${counts.success}，跳过 ${counts.skipped}，失败 ${counts.failure}`;
}

async function importPlainTextFile(filePath: string, content: string, options: ImportOptions): Promise<ImportCounts> {
  const { createIfNotExists = false, forcedType, bookTitleOverride } = options;
  const fileName = path.basename(filePath);
  const parsed = parseFileName(fileName);
  const bookTitle = bookTitleOverride ?? parsed.bookTitle;
  const textType = forcedType ?? parsed.type;

  const parsedContent = textType === 'original'
    ? splitTextAndAnnotations(content)
    : { text: content, annotations: [] as ParsedAnnotation[] };

  const cleanedContent = textType === 'original'
    ? cleanMultilineText(parsedContent.text, { removeFootnotes: false })
    : cleanMultilineText(parsedContent.text);
  if (!cleanedContent) {
    console.log(`✗ 《${bookTitle}》: 文本内容为空，跳过`);
    return { processed: 1, success: 0, failure: 1, skipped: 0 };
  }

  const annotations = textType === 'original'
    ? parsedContent.annotations.map((annotation) => ({
        index: annotation.index,
        content: cleanMultilineText(annotation.content),
      }))
    : [];

  let book = await prisma.book.findFirst({ where: { title: bookTitle } });
  if (!book) {
    if (!createIfNotExists) {
      console.log(`✗ 《${bookTitle}》: 书籍不存在，使用 --create 选项或先导入 Excel`);
      return { processed: 1, success: 0, failure: 1, skipped: 0 };
    }

    const data = {
      title: bookTitle,
      author: '佚名',
      description: textType === 'original' ? (cleanedContent)?.slice(0, 200) : null,
      summary: null,
      originalText: textType === 'original' ? cleanedContent : null,
      translatedText: textType === 'translated' ? cleanedContent : null,
      annotationCount: textType === 'original' ? annotations.length : undefined,
    };

    book = await prisma.book.create({ data });

    console.log(`＋ 《${bookTitle}》: 创建新书籍 (ID: ${book.id})，写入${textType === 'original' ? '原文' : '译文'} (${cleanedContent.length} 字)`);

    if (textType === 'original') {
      await replaceBookAnnotations(book.id, annotations);
    }

    return { processed: 1, success: 1, failure: 0, skipped: 0 };
  }

  const updateData: Record<string, unknown> = {};

  if (textType === 'original') {
    updateData.originalText = cleanedContent;
    updateData.annotationCount = annotations.length;
  } else {
    updateData.translatedText = cleanedContent;
  }

  await prisma.book.update({
    where: { id: book.id },
    data: updateData,
  });

  console.log(`✓ 《${bookTitle}》: 更新${textType === 'original' ? '原文' : '译文'} (${cleanedContent.length} 字)`);

  if (textType === 'original') {
    await replaceBookAnnotations(book.id, annotations);
  }

  return { processed: 1, success: 1, failure: 0, skipped: 0 };
}

async function importAnthologyFile(filePath: string, content: string, options: ImportOptions): Promise<ImportCounts> {
  const { createIfNotExists = false } = options;
  const entries = parseAnthologyEntries(content);

  if (entries.length === 0) {
    console.log(`✗ ${path.basename(filePath)}: 未识别到篇章结构，跳过`);
    return { processed: 0, success: 0, failure: 1, skipped: 0 };
  }

  console.log(`\n📘 解析选集: ${path.basename(filePath)} (共 ${entries.length} 篇)`);
  const preview = entries.slice(0, 5).map((entry) => `《${entry.title}》`).join('、');
  console.log(`示例篇名: ${preview}${entries.length > 5 ? ' ...' : ''}`);

  let counts: ImportCounts = { processed: entries.length, success: 0, failure: 0, skipped: 0 };

  for (const entry of entries) {
    try {
      const book = await prisma.book.findFirst({ where: { title: entry.title } });
      const sanitizedAnnotations = entry.annotations.map((annotation) => ({
        index: annotation.index,
        content: cleanMultilineText(annotation.content),
      }));

      if (!book) {
        if (!createIfNotExists) {
          console.log(`✗ 第${entry.index}篇《${entry.title}》: 书籍不存在，跳过`);
          counts.failure += 1;
          continue;
        }

        const condensed = (entry.summary);
        const created = await prisma.book.create({
          data: {
            title: entry.title,
            author: entry.author || '佚名',
            summary: entry.summary,
            description: condensed ? condensed.slice(0, 200) : null,
            originalText: entry.originalText,
            annotationCount: sanitizedAnnotations.length,
          },
        });

        console.log(`＋ 第${entry.index}篇《${entry.title}》: 创建新书籍 (ID: ${created.id})`);
        await replaceBookAnnotations(created.id, sanitizedAnnotations);
        counts.success += 1;
        continue;
      }

      const updateData: Record<string, unknown> = {
        originalText: entry.originalText,
        annotationCount: sanitizedAnnotations.length,
      };

      if (entry.summary && (!book.summary || !book.summary.trim())) {
        updateData.summary = entry.summary;
      }

      if (entry.summary && (!book.description || !book.description.trim())) {
        const condensed = (entry.summary);
        if (condensed) {
          updateData.description = condensed.slice(0, 200);
        }
      }

      if (entry.author && (!book.author || book.author.trim() === '' || book.author.trim() === '佚名')) {
        updateData.author = entry.author;
      }

      if (Object.keys(updateData).length === 1 && updateData.originalText === book.originalText) {
        console.log(`- 第${entry.index}篇《${entry.title}》: 数据已最新，跳过`);
        counts.skipped += 1;
        continue;
      }

      const updated = await prisma.book.update({
        where: { id: book.id },
        data: updateData,
      });

      console.log(`✓ 第${entry.index}篇《${entry.title}》: 更新原文 (${entry.originalText.length} 字)`);
      await replaceBookAnnotations(updated.id, sanitizedAnnotations);
      counts.success += 1;
    } catch (error) {
      console.error(`✗ 第${entry.index}篇《${entry.title}》导入失败`, error);
      counts.failure += 1;
    }
  }

  return counts;
}

async function processTextFile(filePath: string, options: ImportOptions): Promise<ImportCounts> {
  const { encoding = 'utf-8' } = options;
  const resolvedPath = path.resolve(filePath);
  const content = readTextFile(resolvedPath, encoding);

  if (looksLikeAnthology(content)) {
    return importAnthologyFile(resolvedPath, content, options);
  }

  return importPlainTextFile(resolvedPath, content, options);
}

async function importFromDirectory(dirPath: string = DEFAULT_TEXT_DIR, options: ImportOptions = {}) {
  const resolvedDir = path.resolve(dirPath);
  console.log('='.repeat(50));
  console.log('开始批量导入文本文件...');
  console.log(`目录: ${resolvedDir}`);
  console.log('='.repeat(50));

  const files = scanTextFiles(resolvedDir);

  if (files.length === 0) {
    console.log('\n目录为空，没有找到 txt 文件');
    console.log(`\n请将 txt 文件放入: ${resolvedDir}`);
    return;
  }

  console.log(`找到 ${files.length} 个文本文件\n`);

  let totals: ImportCounts = { processed: 0, success: 0, failure: 0, skipped: 0 };

  for (const file of files) {
    console.log(`\n--- 处理文件: ${path.basename(file)} ---`);
    try {
      const counts = await processTextFile(file, options);
      totals = mergeCounts(totals, counts);
    } catch (error) {
      console.error(`✗ 处理文件失败: ${file}`, error);
      totals = mergeCounts(totals, { processed: 1, success: 0, failure: 1, skipped: 0 });
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('导入完成！');
  console.log(`  处理篇章: ${totals.processed}`);
  console.log(`  成功: ${totals.success}`);
  console.log(`  跳过: ${totals.skipped}`);
  console.log(`  失败: ${totals.failure}`);
  console.log('='.repeat(50));

  const booksWithText = await prisma.book.count({
    where: {
      OR: [
        { originalText: { not: '' } },
        { translatedText: { not: '' } },
      ],
    },
  });

  console.log(`已有文本的书籍总数: ${booksWithText}`);
}

async function importSingleText(
  filePath: string,
  options: ImportOptions = {}
): Promise<{ success: boolean; message: string }> {
  const counts = await processTextFile(filePath, options);
  return {
    success: counts.failure === 0,
    message: formatCountsSummary(path.basename(filePath), counts),
  };
}

async function importByBookTitle(
  bookTitle: string,
  textPath: string,
  type: 'original' | 'translated' = 'original',
  encoding: Encoding = 'utf-8',
  createIfNotExists = false,
) {
  const content = readTextFile(textPath, encoding);
  const counts = await importPlainTextFile(textPath, content, {
    forcedType: type,
    bookTitleOverride: bookTitle,
    createIfNotExists,
  });
  return counts.failure === 0;
}

async function main() {
  const args = process.argv.slice(2);

  let dirPath = DEFAULT_TEXT_DIR;
  let encoding: Encoding = 'utf-8';
  let createIfNotExists = false;
  let singleFile: string | undefined;
  let bookTitle: string | undefined;
  let textType: 'original' | 'translated' = 'original';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dir' || arg === '-d') {
      dirPath = args[++i] || DEFAULT_TEXT_DIR;
    } else if (arg === '--encoding' || arg === '-e') {
      encoding = (args[++i] || 'utf-8') as Encoding;
    } else if (arg === '--create') {
      createIfNotExists = true;
    } else if (arg === '--file' || arg === '-f') {
      singleFile = args[++i];
    } else if (arg === '--book' || arg === '-b') {
      bookTitle = args[++i];
    } else if (arg === '--type' || arg === '-t') {
      const typeArg = (args[++i] || '').toLowerCase();
      textType = typeArg === 'translated' || typeArg === '译文' ? 'translated' : 'original';
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
TXT 文本导入脚本

用法:
  npx ts-node scripts/import-text.ts [选项]

选项:
  -d, --dir <path>       指定文本目录 (默认: backend/texts/)
  -f, --file <path>      导入单个文件 (自动识别类型)
  -b, --book <title>     指定书名 (与 --file 配合使用)
  -t, --type <type>      文本类型: original(原文) 或 translated(译文)
  -e, --encoding <enc>   文件编码 (默认: utf-8)
  --create               如果书籍不存在则自动创建
  -h, --help             显示帮助信息

示例:
  npx ts-node scripts/import-text.ts --dir ./texts
  npx ts-node scripts/import-text.ts --file ./texts/任氏传.txt
  npx ts-node scripts/import-text.ts --file ./texts/唐宋传奇选.txt --create
  npx ts-node scripts/import-text.ts --file ./texts/任氏传_白话.txt --book 任氏传 --type translated
      `);
      process.exit(0);
    }
  }

  const baseOptions: ImportOptions = { encoding, createIfNotExists };

  if (singleFile) {
    const resolvedFile = path.resolve(singleFile);
    if (bookTitle) {
      const ok = await importByBookTitle(bookTitle, resolvedFile, textType, encoding, createIfNotExists);
      console.log(ok ? '导入成功' : '导入失败');
    } else {
      const result = await importSingleText(resolvedFile, { ...baseOptions, forcedType: textType });
      console.log(result.message);
    }
    return;
  }

  await importFromDirectory(dirPath, baseOptions);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

export { importFromDirectory, importSingleText, importByBookTitle, scanTextFiles };
