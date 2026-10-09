/**
 * 清理《桃花扇》每个回目内的重复注释，并同步正文注释序号。
 *
 * 注释内容忽略 Unicode 空白及常见零宽间隔字符后相同，即视为重复：
 * 保留首次出现的注释，删除后续重复注释及其正文标记；其余注释按原顺序
 * 从 1 重新编号，并通过旧序号到新序号的映射更新正文中的 [n]。
 */
import * as fs from 'fs';
import * as path from 'path';

interface Annotation {
  id?: number | string;
  content?: string;
  [key: string]: unknown;
}

interface SourceRow {
  题目?: string;
  文本?: string;
  注释?: Annotation[];
  [key: string]: unknown;
}

const DEFAULT_FILE = path.resolve(__dirname, '..', 'data', 'collections', 'new_version', '桃花扇.json');
const MARKER_PATTERN = /\[(\d+)\]/g;

function contentKey(content: string): string {
  return content.replace(/[\p{White_Space}\u200B\u2060\uFEFF]/gu, '');
}

export function dedupeAnnotations(row: SourceRow, rowIndex: number) {
  const annotations = Array.isArray(row.注释) ? row.注释 : [];
  if (!annotations.length) return { row, removed: 0, removedMarkers: 0, renumberedMarkers: 0 };

  const seenContent = new Set<string>();
  const seenIds = new Set<number>();
  const oldToNew = new Map<number, number>();
  const deletedIds = new Set<number>();
  const kept: Array<Annotation & { id: number; content: string }> = [];

  for (const [annotationIndex, annotation] of annotations.entries()) {
    const oldId = Number(annotation.id);
    const content = String(annotation.content ?? '');
    if (!Number.isInteger(oldId) || oldId < 1 || !content.trim()) {
      throw new Error(`第 ${rowIndex + 1} 条《${row.题目 || '未命名'}》的第 ${annotationIndex + 1} 条注释无效`);
    }
    if (seenIds.has(oldId)) throw new Error(`第 ${rowIndex + 1} 条《${row.题目 || '未命名'}》存在重复注释序号 ${oldId}`);
    seenIds.add(oldId);

    const key = contentKey(content);
    if (seenContent.has(key)) {
      deletedIds.add(oldId);
      continue;
    }
    seenContent.add(key);
    const newId = kept.length + 1;
    oldToNew.set(oldId, newId);
    kept.push({ ...annotation, id: newId, content });
  }

  let removedMarkers = 0;
  let renumberedMarkers = 0;
  const originalText = String(row.文本 || '');
  const text = originalText.replace(MARKER_PATTERN, (marker, digits: string) => {
    const oldId = Number(digits);
    if (deletedIds.has(oldId)) {
      removedMarkers += 1;
      return '';
    }
    const newId = oldToNew.get(oldId);
    if (newId === undefined) return marker;
    if (newId !== oldId) renumberedMarkers += 1;
    return `[${newId}]`;
  });

  const removed = annotations.length - kept.length;
  return {
    row: removed || text !== originalText ? { ...row, 文本: text, 注释: kept } : row,
    removed,
    removedMarkers,
    renumberedMarkers,
  };
}

export function processRows(rows: SourceRow[]) {
  let removed = 0;
  let removedMarkers = 0;
  let renumberedMarkers = 0;
  const processed = rows.map((row, rowIndex) => {
    const result = dedupeAnnotations(row, rowIndex);
    removed += result.removed;
    removedMarkers += result.removedMarkers;
    renumberedMarkers += result.renumberedMarkers;
    return result.row;
  });
  return { rows: processed, removed, removedMarkers, renumberedMarkers };
}

function main() {
  const args = process.argv.slice(2);
  const fileAt = args.indexOf('--file');
  const filePath = fileAt >= 0 ? path.resolve(args[fileAt + 1] || '') : DEFAULT_FILE;
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error('《桃花扇》JSON 顶层必须是数组');

  const result = processRows(parsed as SourceRow[]);
  console.log(`共 ${result.rows.length} 个回目：删除 ${result.removed} 条重复注释、${result.removedMarkers} 个对应标记，重编号 ${result.renumberedMarkers} 个正文标记。`);
  if (args.includes('--dry-run')) {
    console.log('Dry-run 通过，未修改文件。');
    return;
  }
  if (!result.removed && !result.removedMarkers && !result.renumberedMarkers) {
    console.log('未发现待处理的重复注释或序号，文件未修改。');
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath.replace(/\.json$/i, '')}.before-annotation-dedupe-${stamp}.json.bak`;
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
