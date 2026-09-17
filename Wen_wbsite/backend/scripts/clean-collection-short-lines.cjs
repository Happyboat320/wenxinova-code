#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node clean-collection-short-lines.cjs <collection.json> [...]');
  process.exit(1);
}

for (const file of files) {
  const absolutePath = path.resolve(file);
  const rows = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  if (!Array.isArray(rows)) throw new Error(`${file}: JSON top level must be an array`);

  let removed = 0;
  let removedRows = 0;
  for (const [index, row] of rows.entries()) {
    if (typeof row?.文本 !== 'string') throw new Error(`${file}: row ${index + 1} has no 文本 string`);
    const kept = [];
    for (const line of row.文本.replace(/\r\n?/g, '\n').split('\n')) {
      const trimmed = line.trim();
      if ([...trimmed].length < 5) {
        removed += 1;
      } else {
        kept.push(trimmed);
      }
    }
    row.文本 = kept.join('\n');
  }

  const nonEmptyRows = rows.filter(row => {
    if (row.文本) return true;
    removedRows += 1;
    return false;
  });

  fs.writeFileSync(absolutePath, `${JSON.stringify(nonEmptyRows, null, 2)}\n`);
  console.log(`${file}: removed ${removed} lines shorter than 5 characters and ${removedRows} empty rows`);
}
