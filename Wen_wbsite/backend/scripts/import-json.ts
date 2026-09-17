/**
 * JSON 数据导入脚本
 * 
 * 使用说明：
 * 1. 确保数据文件位于 backend/data/collections/new_version/ancient_prose.json
 * 2. 数据格式应为包含多个条目的 JSON 数组，每个条目包含：题目、文本、全文翻译、关键词、梗概等字段
 * 3. 在 backend 目录下运行：npm run import:json (需在 package.json 中配置该命令)
 *    或直接运行：npx ts-node scripts/import-json.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { resolveBookCover } from '../src/lib/book-covers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

const JSON_PATH = path.join(__dirname, '..', 'data', 'collections', 'new_version', 'ancient_prose.json');
const DEFAULT_BOOK_NAME = '新导入';

interface ProseEntry {
  题目?: string;
  文本?: string;
  全文翻译?: string;
  关键词?: string[];
  梗概?: string;
  体裁?: string;
  朝代?: string;
  来源?: string;
}

async function main() {
  console.log('开始导入 JSON 数据...');

  if (!fs.existsSync(JSON_PATH)) {
    console.error(`找不到文件: ${JSON_PATH}`);
    return;
  }

  const rawData = fs.readFileSync(JSON_PATH, 'utf-8');
  const entries: ProseEntry[] = JSON.parse(rawData);

  console.log(`载入 ${entries.length} 条数据`);

  let count = 0;
  for (const entry of entries) {
    try {
      // 映射字段
      const title = entry.题目 || '未命名';
      const originalText = entry.文本 || '';
      const translatedText = entry.全文翻译 || '';
      const keywords = entry.关键词 ? entry.关键词.join(', ') : '';
      const summary = entry.梗概 || '';
      const category = entry.体裁 || '笔记小说';
      const dynasty = entry.朝代 || '未知';
      const author = entry.来源 || '未知作者';
      
      // 因为没有书本的名字，所以加上书本名字为”新导入“
      // 我们暂且将其放入 theme 字段中，作为分类标识
      const theme = DEFAULT_BOOK_NAME;

      await prisma.book.create({
        data: {
          title,
          author,
          dynasty,
          originalText,
          translatedText,
          summary,
          keywords,
          category,
          theme,
          image: resolveBookCover({ title, category, theme, summary, keywords }),
          description: summary.length > 200 ? summary.slice(0, 197) + '...' : summary,
        },
      });

      count++;
      if (count % 10 === 0) {
        console.log(`已导入 ${count} 条...`);
      }
    } catch (error) {
      console.error(`导入条目 "${entry.题目}" 失败:`, error);
    }
  }

  console.log(`导入完成，成功导入 ${count} 条书籍数据。`);
}

main()
  .catch((e) => {
    console.error('导入过程中发生错误:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
