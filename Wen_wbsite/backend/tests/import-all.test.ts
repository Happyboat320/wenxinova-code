import { describe, expect, it } from 'vitest';
import {
  parseAnnotationBlock,
  parseDocumentAnnotations,
  parseTextSource,
  readDocumentSources,
  readExcelSource,
  readJsonSource,
} from '../scripts/import-all';

describe('一键导入数据源', () => {
  it('读取全部数据并保持标题与去重规则一致', () => {
    const jsonRows = readJsonSource();
    const excelRows = readExcelSource();
    const textRows = parseTextSource();
    const documentRows = readDocumentSources();

    expect(jsonRows).toHaveLength(24_987);
    expect(excelRows).toHaveLength(39);
    expect(textRows).toHaveLength(39);
    expect(documentRows).toHaveLength(523);
    expect(textRows.map((row) => row.title)).toEqual(excelRows.map((row) => row.title));

    const jsonTitles = new Set(jsonRows.map((row) => row.title));
    expect(excelRows.filter((row) => jsonTitles.has(row.title)).map((row) => row.title)).toEqual([
      '红线',
      '昆仑奴',
      '聂隐娘',
      '裴航',
      '崔玄微',
    ]);

    const occupiedTitles = new Set([...jsonTitles, ...excelRows.map((row) => row.title)]);
    const importableDocuments = documentRows.filter((row) => {
      const title = String(row.data.title);
      if (occupiedTitles.has(title)) return false;
      occupiedTitles.add(title);
      return true;
    });
    expect(importableDocuments).toHaveLength(340);
  });

  it('解析多行注释并忽略重复编号', () => {
    expect(parseAnnotationBlock('[1] 第一条\n续行\n2：第二条\n[2] 重复')).toEqual([
      { index: 1, content: '第一条\n续行' },
      { index: 2, content: '第二条' },
    ]);
  });

  it('解析补充文集的行内及无编号注释', () => {
    expect(parseDocumentAnnotations('[1]第一条[2]第二条')).toEqual([
      { index: 1, content: '第一条' },
      { index: 2, content: '第二条' },
    ]);
    expect(parseDocumentAnnotations('一段未编号注释')).toEqual([
      { index: 1, content: '一段未编号注释' },
    ]);
  });
});
