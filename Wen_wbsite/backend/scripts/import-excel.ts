/**
 * Excel 批量导入脚本
 * 从 "小说目录信息.xlsx" 文件批量导入书籍数据到数据库
 *
 * 使用方法:
 *   1. 先安装依赖: npm install xlsx
 *   2. 运行脚本: npx ts-node scripts/import-excel.ts
 *   3. 或者: npm run import:excel
 *
 * Excel 格式要求:
 *   列名: 序号, 篇名, 年代, 作者, 注释数目, 题材体裁, 主题, 人物, 关键词, 梗概
 *   为兼容旧模板，“类别”列仍可作为“题材体裁”的备用列名。
 */

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { resolveBookCover } from '../src/lib/book-covers';

const prisma = new PrismaClient();

// Excel 数据行的接口定义
interface ExcelRow {
  序号?: number | string;
  篇名: string;
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

// 默认 Excel 文件路径
const DEFAULT_EXCEL_PATH = path.join(__dirname, '..', '小说目录信息.xlsx');

const FOOTNOTE_REGEX = /\\?\[\d+\]/g;

function normalizeLineBreaks(value: string): string {
  // Excel 单元格可能携带字面量“\\n”，统一转换为真实换行。
  return value.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function stripFootnotes(value: string): string {
  return value.replace(FOOTNOTE_REGEX, '');
}

function cleanSingleLine(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  const normalized = normalizeLineBreaks(String(value)).replace(/\u3000/g, ' ');
  return stripFootnotes(normalized).replace(/\s+/g, ' ').trim();
}

function cleanMultiline(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  const normalized = normalizeLineBreaks(String(value)).replace(/\u3000/g, ' ');
  const withoutFootnotes = stripFootnotes(normalized)
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n');

  return withoutFootnotes.replace(/\n{3,}/g, '\n\n').trim();
}

function toNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildDescription(summary: string | null, maxLength = 200): string | null {
  if (!summary) {
    return null;
  }

  const condensed = summary.replace(/\s+/g, ' ').trim();
  if (!condensed) {
    return null;
  }

  return condensed.length > maxLength ? condensed.slice(0, maxLength) : condensed;
}

function parseAnnotationCount(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = parseInt(String(value).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 从 Excel 文件读取数据
 */
function readExcelFile(filePath: string): ExcelRow[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Excel 文件不存在: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // 转换为 JSON 数组，缺省值置为空字符串便于统一清洗
  const data = XLSX.utils.sheet_to_json<ExcelRow>(worksheet, { defval: '' });

  console.log(`从 Excel 读取到 ${data.length} 条记录`);
  return data;
}

/**
 * 将 Excel 行转换为数据库记录格式
 */
function transformRow(row: ExcelRow) {
  const title = cleanSingleLine(row.篇名);
  if (!title) {
    throw new Error('Excel 行缺少篇名');
  }

  const author = cleanSingleLine(row.作者) || '佚名';
  const dynasty = toNullable(cleanSingleLine(row.年代));
  // 新模板使用“题材体裁”，旧模板中的“类别”仍可继续导入。
  const category = toNullable(cleanSingleLine(row.题材体裁 || row.类别));
  const theme = toNullable(cleanSingleLine(row.主题));
  const mainCharacters = toNullable(cleanSingleLine(row.人物));
  const keywords = toNullable(cleanSingleLine(row.关键词));
  const summaryText = cleanMultiline(row.梗概);
  const summary = summaryText || null;
  const description = buildDescription(summary);
  const annotationCount = parseAnnotationCount(row.注释数目);

  return {
    title,
    author,
    dynasty,
    category,
    theme,
    mainCharacters,
    keywords,
    annotationCount,
    description,
    summary,
    image: resolveBookCover({ title, category, theme, description, summary, keywords }),
  };
}

/**
 * 解析人物字段，创建角色数据
 */
function parseCharacters(row: ExcelRow, bookId: number) {
  const charactersField = cleanSingleLine(row.人物);
  if (!charactersField) return [];

  // 人物字段格式: "角色1；角色2；角色3" 或 "角色1,角色2"
  const characterNames = charactersField
    .split(/[；;，,、]/)
    .map((name) => name.trim())
    .filter(Boolean);

  const bookTitle = cleanSingleLine(row.篇名) || '该作品';

  return characterNames.map((name) => ({
    bookId,
    name,
    description: `《${bookTitle}》中的角色`,
  }));
}

/**
 * 主导入函数
 */
async function importFromExcel(excelPath: string = DEFAULT_EXCEL_PATH, options: {
  clearExisting?: boolean;
  skipExisting?: boolean;
  limit?: number;
} = {}) {
  const { clearExisting = false, skipExisting = true, limit } = options;

  console.log('='.repeat(50));
  console.log('开始从 Excel 导入书籍数据...');
  console.log(`Excel 文件: ${excelPath}`);
  console.log('='.repeat(50));

  try {
    // 读取 Excel 数据
    let rows = readExcelFile(excelPath);

    // 如果设置了限制数量
    if (limit && limit > 0) {
      rows = rows.slice(0, limit);
      console.log(`限制导入数量: ${limit} 条`);
    }

    // 如果需要清空现有数据
    if (clearExisting) {
      console.log('\n清空现有数据...');
      await prisma.character.deleteMany();
      await prisma.book.deleteMany();
      console.log('已清空现有书籍和角色数据');
    }

    // 统计信息
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    // 逐条导入
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      try {
        const bookData = transformRow(row);

        // 检查是否已存在
        const existing = await prisma.book.findFirst({
          where: { title: bookData.title },
        });

        if (existing && skipExisting) {
          console.log(`[${i + 1}/${rows.length}] 跳过 (已存在): ${bookData.title}`);
          skipCount++;
          continue;
        }

        // 创建或更新书籍
        const book = existing
          ? await prisma.book.update({
              where: { id: existing.id },
              data: bookData,
            })
          : await prisma.book.create({
              data: bookData,
            });

        // 创建角色（如果书籍是新建的）
        if (!existing) {
          const characters = parseCharacters(row, book.id);
          if (characters.length > 0) {
            await prisma.character.createMany({
              data: characters,
            });
          }
        }

        const dynastyLabel = bookData.dynasty || '未知年代';
        console.log(`[${i + 1}/${rows.length}] ${existing ? '更新' : '导入'}: ${bookData.title} (${dynastyLabel} · ${bookData.author})`);
        successCount++;
      } catch (error) {
        const identifier = cleanSingleLine(row.篇名) || String(row.序号 ?? `行${i + 1}`);
        console.error(`[${i + 1}/${rows.length}] 错误: ${identifier}`, error);
        errorCount++;
      }
    }

    // 打印统计信息
    console.log('\n' + '='.repeat(50));
    console.log('导入完成！');
    console.log(`  成功: ${successCount} 条`);
    console.log(`  跳过: ${skipCount} 条`);
    console.log(`  失败: ${errorCount} 条`);
    console.log('='.repeat(50));

    // 显示数据库当前状态
    const totalBooks = await prisma.book.count();
    const totalCharacters = await prisma.character.count();
    console.log(`\n数据库当前状态:`);
    console.log(`  书籍总数: ${totalBooks}`);
    console.log(`  角色总数: ${totalCharacters}`);

  } catch (error) {
    console.error('导入失败:', error);
    throw error;
  }
}

/**
 * 命令行入口
 */
async function main() {
  const args = process.argv.slice(2);

  // 解析命令行参数
  let excelPath = DEFAULT_EXCEL_PATH;
  let clearExisting = false;
  let skipExisting = true;
  let limit: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' || arg === '-f') {
      excelPath = args[++i] || DEFAULT_EXCEL_PATH;
    } else if (arg === '--clear' || arg === '-c') {
      clearExisting = true;
    } else if (arg === '--no-skip') {
      skipExisting = false;
    } else if (arg === '--limit' || arg === '-l') {
      limit = parseInt(args[++i], 10);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Excel 批量导入脚本

用法:
  npx ts-node scripts/import-excel.ts [选项]

选项:
  -f, --file <path>   指定 Excel 文件路径 (默认: 小说目录信息.xlsx)
  -c, --clear         导入前清空现有书籍和角色数据
  --no-skip           已存在的书籍也进行更新 (默认跳过)
  -l, --limit <n>     限制导入数量
  -h, --help          显示帮助信息

示例:
  npx ts-node scripts/import-excel.ts
  npx ts-node scripts/import-excel.ts --clear
  npx ts-node scripts/import-excel.ts --file ./my-books.xlsx --limit 10
      `);
      process.exit(0);
    }
  }

  await importFromExcel(excelPath, { clearExisting, skipExisting, limit });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// 导出函数供其他模块使用
export { importFromExcel, readExcelFile, transformRow, parseCharacters };
