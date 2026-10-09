/**
 * 清理《桃花扇》同一回目内重复的正文行。
 *
 * 先将 CRLF、CR、LF、垂直制表、换页符、NEL 及 Unicode 行/段分隔符
 * 统一为 LF，再删除每行中的全部 Unicode 空白和常见零宽间隔字符。
 * 然后从前向后检查每个非空物理行：若整行已作为连续子串出现在
 * 该回目更早的某一行中，则删除该行。最后将连续换行压缩为一个换行。
 */
import * as fs from 'fs';
import * as path from 'path';

interface SourceRow {
  题目?: string;
  文本?: string;
  [key: string]: unknown;
}

const DEFAULT_FILE = path.resolve(__dirname, '..', 'data', 'collections', 'new_version', '桃花扇.json');
export function dedupeRepeatedLines(text: string) {
  let removedSpaces = 0;
  const normalizedLineBreaks = text.replace(/\r\n|[\r\v\f\u0085\u2028\u2029]/g, '\n');
  const lines = normalizedLineBreaks.split('\n').map(line => line.replace(/[\p{White_Space}\u200B\u2060\uFEFF]/gu, () => {
    removedSpaces += 1;
    return '';
  }));
  let removed = 0;
  const output: string[] = [];
  for (const line of lines) {
    if (line && output.some(previousLine => previousLine.includes(line))) {
      removed += 1;
      continue;
    }
    output.push(line);
  }
  const joined = output.join('\n');
  const collapsed = joined.replace(/\n{2,}/g, '\n');
  return { text: collapsed, removed, removedSpaces, collapsedNewlines: joined.length - collapsed.length };
}

export function processRows(rows: SourceRow[]) {
  let removed = 0;
  let removedSpaces = 0;
  let collapsedNewlines = 0;
  const processed = rows.map(row => {
    const result = dedupeRepeatedLines(String(row.文本 || ''));
    removed += result.removed;
    removedSpaces += result.removedSpaces;
    collapsedNewlines += result.collapsedNewlines;
    return result.text !== String(row.文本 || '') ? { ...row, 文本: result.text } : row;
  });
  return { rows: processed, removed, removedSpaces, collapsedNewlines };
}

function backupPathFor(filePath: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${filePath.replace(/\.json$/i, '')}.before-line-dedupe-${stamp}.json.bak`;
}

function main() {
  const args = process.argv.slice(2);
  const fileAt = args.indexOf('--file');
  const filePath = fileAt >= 0 ? path.resolve(args[fileAt + 1] || '') : DEFAULT_FILE;
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error('《桃花扇》JSON 顶层必须是数组');

  const result = processRows(parsed as SourceRow[]);
  console.log(`共 ${result.rows.length} 个回目，将删除 ${result.removedSpaces} 个空格、${result.removed} 行，并压缩 ${result.collapsedNewlines} 个多余换行。`);
  if (args.includes('--dry-run')) {
    console.log('Dry-run 通过，未修改文件。');
    return;
  }
  if (!result.removedSpaces && !result.removed && !result.collapsedNewlines) {
    console.log('未发现待删除的空格、重复行或连续换行，文件未修改。');
    return;
  }

  const backupPath = backupPathFor(filePath);
  fs.copyFileSync(filePath, backupPath, fs.constants.COPYFILE_EXCL);
  console.log(`备份已保存：${backupPath}`);
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
