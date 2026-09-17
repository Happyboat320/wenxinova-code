/**
 * 清理《桃花扇》正文中重复的独立舞台提示行。
 *
 * 若某行只包含一个“〔...〕”（允许首尾空白），且完全相同的
 * “〔...〕”在同一回目的前 20 个物理行中出现过，则删除该独立行。
 */
import * as fs from 'fs';
import * as path from 'path';

interface SourceRow {
  题目?: string;
  文本?: string;
  [key: string]: unknown;
}

const DEFAULT_FILE = path.resolve(__dirname, '..', 'data', 'collections', 'new_version', '桃花扇.json');
const DEFAULT_WINDOW = 20;
const STANDALONE_DIRECTION = /^\s*(〔[^\r\n]*〕)\s*$/;

export function dedupeStageDirections(text: string, windowSize = DEFAULT_WINDOW) {
  const lines = text.split('\n');
  let removed = 0;
  const output: string[] = [];
  for (const line of lines) {
    const match = line.match(STANDALONE_DIRECTION);
    if (match) {
      const direction = match[1];
      const seenAbove = output
        .slice(Math.max(0, output.length - windowSize))
        .some(previousLine => previousLine.includes(direction));
      if (seenAbove) {
        removed += 1;
        continue;
      }
    }
    output.push(line);
  }
  return { text: output.join('\n'), removed };
}

export function processRows(rows: SourceRow[], windowSize = DEFAULT_WINDOW) {
  let removed = 0;
  const processed = rows.map(row => {
    const result = dedupeStageDirections(String(row.文本 || ''), windowSize);
    removed += result.removed;
    return result.removed ? { ...row, 文本: result.text } : row;
  });
  return { rows: processed, removed };
}

function backupPathFor(filePath: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${filePath.replace(/\.json$/i, '')}.before-stage-dedupe-${stamp}.json.bak`;
}

function main() {
  const args = process.argv.slice(2);
  const fileAt = args.indexOf('--file');
  const filePath = fileAt >= 0 ? path.resolve(args[fileAt + 1] || '') : DEFAULT_FILE;
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error('《桃花扇》JSON 顶层必须是数组');

  const result = processRows(parsed as SourceRow[]);
  console.log(`共 ${result.rows.length} 条，将删除 ${result.removed} 个重复的独立舞台提示行。`);
  if (args.includes('--dry-run')) {
    console.log('Dry-run 通过，未修改文件。');
    return;
  }
  if (!result.removed) {
    console.log('未发现待删除的重复行，文件未修改。');
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
