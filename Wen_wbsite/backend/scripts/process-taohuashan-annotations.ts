/**
 * 将《桃花扇》正文中的“○/◎批语。”提取为结构化注释。
 *
 * 正文：……。○批语。下文……  ->  ……。[1]下文……
 * 注释：[{ id: 1, content: '批语。' }]
 *
 * “一六○五”等数字中的圆圈零会保留。
 */
import * as fs from 'fs';
import * as path from 'path';

interface Annotation {
  id: number;
  content: string;
}

interface SourceRow {
  题目?: string;
  文本?: string;
  注释?: Annotation[];
  [key: string]: unknown;
}

const DEFAULT_FILE = path.resolve(__dirname, '..', 'data', 'collections', 'new_version', '桃花扇.json');
const NUMBER_CHAR = /[〇零一二三四五六七八九十百千万\d]/;

function isNumericZero(text: string, index: number): boolean {
  return NUMBER_CHAR.test(text[index - 1] || '') && NUMBER_CHAR.test(text[index + 1] || '');
}

function nextAnnotationMarker(text: string, start: number): number {
  for (let index = start; index < text.length; index += 1) {
    if ((text[index] === '○' || text[index] === '◎') && !isNumericZero(text, index)) return index;
  }
  return -1;
}

export function extractAnnotations(text: string): { text: string; annotations: Annotation[] } {
  const annotations: Annotation[] = [];
  let output = '';
  let cursor = 0;

  for (let index = 0; index < text.length; index += 1) {
    if ((text[index] !== '○' && text[index] !== '◎') || isNumericZero(text, index)) continue;

    const nextMarkerAt = nextAnnotationMarker(text, index + 1);
    let fullStopAt = text.indexOf('。', index + 1);
    if (fullStopAt < 0) throw new Error(`注释标记后缺少句号：${text.slice(index, index + 80)}`);
    if (nextMarkerAt >= 0 && nextMarkerAt < fullStopAt) {
      // 少数批语以问号或叹号结束，下一条批语又位于下一个句号之前。
      // 此时在下一标记前的最后一个句末标点处截止，避免合并两条注释。
      const prefix = text.slice(index + 1, nextMarkerAt);
      const relativeEnd = Math.max(prefix.lastIndexOf('。'), prefix.lastIndexOf('！'), prefix.lastIndexOf('？'));
      if (relativeEnd >= 0) {
        fullStopAt = index + 1 + relativeEnd;
      } else {
        // 原文中有三条极短批语未加句末标点，但均在首个换行处结束。
        const lineEnd = prefix.indexOf('\n');
        if (lineEnd < 0) throw new Error(`相邻注释之间缺少边界：${text.slice(index, nextMarkerAt + 20)}`);
        fullStopAt = index + 1 + lineEnd - 1;
      }
    }
    const content = text.slice(index + 1, fullStopAt + 1).trim();
    if (!content) throw new Error(`发现空注释，位置 ${index}`);

    const id = annotations.length + 1;
    output += text.slice(cursor, index) + `[${id}]`;
    annotations.push({ id, content });
    cursor = fullStopAt + 1;
    index = fullStopAt;
  }

  output += text.slice(cursor);
  return { text: output, annotations };
}

export function processRows(rows: SourceRow[]) {
  let annotationCount = 0;
  const processed = rows.map((row, rowIndex) => {
    const originalText = String(row.文本 || '');
    const result = extractAnnotations(originalText);
    if (!result.annotations.length) return row;
    if (Array.isArray(row.注释) && row.注释.length) {
      throw new Error(`第 ${rowIndex + 1} 条《${row.题目 || '未命名'}》已有注释，拒绝覆盖`);
    }
    annotationCount += result.annotations.length;
    return { ...row, 文本: result.text, 注释: result.annotations };
  });
  return { rows: processed, annotationCount };
}

function main() {
  const args = process.argv.slice(2);
  const fileAt = args.indexOf('--file');
  const filePath = fileAt >= 0 ? path.resolve(args[fileAt + 1] || '') : DEFAULT_FILE;
  if (!fs.existsSync(filePath)) throw new Error(`数据文件不存在：${filePath}`);
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error('《桃花扇》JSON 顶层必须是数组');

  const result = processRows(parsed as SourceRow[]);
  console.log(`共 ${result.rows.length} 条，提取 ${result.annotationCount} 条注释。`);
  if (args.includes('--dry-run')) {
    console.log('Dry-run 通过，未修改文件。');
    return;
  }
  if (!result.annotationCount) {
    console.log('没有待提取的注释，文件未修改。');
    return;
  }

  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(result.rows, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, filePath);
  console.log(`已更新：${filePath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
