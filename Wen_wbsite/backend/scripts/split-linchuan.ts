/** 将《临川四梦》按来源拆分为四个可单独导入的 JSON。 */
import * as fs from 'fs';
import * as path from 'path';

const BACKEND_DIR = path.resolve(__dirname, '..');
const DEFAULT_SOURCE = path.join(BACKEND_DIR, 'data', 'collections', 'new_version', '临川.json');
const DEFAULT_OUTPUT_DIR = path.join(BACKEND_DIR, 'data', 'collections', 'new_version', 'tmp');
const TITLES = ['紫钗记', '牡丹亭', '南柯记', '邯郸记'] as const;
const EXPECTED_COUNTS: Record<(typeof TITLES)[number], number> = {
  紫钗记: 53,
  牡丹亭: 55,
  南柯记: 44,
  邯郸记: 30,
};

interface SourceRow {
  题目?: string;
  来源?: string;
  [key: string]: unknown;
}

export function splitLinchuan(rows: SourceRow[]) {
  return Object.fromEntries(TITLES.map(title => {
    const selected = rows.filter(row => String(row.来源 || '').includes(title));
    if (selected.length !== EXPECTED_COUNTS[title]) {
      throw new Error(`《${title}》共 ${selected.length} 条，预期 ${EXPECTED_COUNTS[title]} 条`);
    }
    return [title, selected];
  })) as Record<(typeof TITLES)[number], SourceRow[]>;
}

function main() {
  const args = process.argv.slice(2);
  const sourceAt = args.indexOf('--source');
  const outputAt = args.indexOf('--output-dir');
  const sourcePath = sourceAt >= 0 ? path.resolve(args[sourceAt + 1] || '') : DEFAULT_SOURCE;
  const outputDir = outputAt >= 0 ? path.resolve(args[outputAt + 1] || '') : DEFAULT_OUTPUT_DIR;
  const parsed = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as unknown;
  if (!Array.isArray(parsed)) throw new Error('《临川四梦》JSON 顶层必须是数组');
  const split = splitLinchuan(parsed as SourceRow[]);
  for (const title of TITLES) console.log(`${title}：${split[title].length} 条`);
  if (args.includes('--dry-run')) {
    console.log('Dry-run 通过，未修改文件。');
    return;
  }
  fs.mkdirSync(outputDir, { recursive: true });
  for (const title of TITLES) {
    const target = path.join(outputDir, `${title}.json`);
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(split[title], null, 2)}\n`, 'utf8');
    fs.renameSync(temporary, target);
  }
  console.log(`已写入：${outputDir}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

