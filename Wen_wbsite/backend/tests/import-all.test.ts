import { describe, expect, it } from 'vitest';
import {
  parseAnnotationBlock,
  parseDocumentAnnotations,
  parseTextSource,
  readDocumentSources,
  readExcelSource,
  readJsonSource,
} from '../scripts/import-all';
import { chapterNumber, readCollection, sortChapterRows } from '../scripts/import-collections';

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

describe('整本作品回目导入', () => {
  it('识别常见中文回目编号并将前置篇章置顶', () => {
    expect(chapterNumber('第卅三出 神诉')).toBe(33);
    expect(chapterNumber('闰二十出 闲话')).toBe(20);
    expect(chapterNumber('春秋配（第1则）')).toBeNull();
    expect(chapterNumber('桃花扇小引')).toBeNull();
    expect(sortChapterRows([
      { 题目: '序' },
      { 题目: '第二回 后篇' },
      { 题目: '第一回 前篇' },
    ]).map(row => row.题目)).toEqual(['序', '第一回 前篇', '第二回 后篇']);
    expect(sortChapterRows([
      { 题目: '第二回 后篇' },
      { 题目: '序' },
      { 题目: '第一回 前篇' },
      { 题目: '附录' },
    ]).map(row => row.题目)).toEqual(['第一回 前篇', '第二回 后篇', '序', '附录']);
  });

  it('整理案名尾号并保留正文后附录', () => {
    expect(sortChapterRows([
      { 题目: '漆屏案 三' },
      { 题目: '漆屏案 一' },
      { 题目: '漆屏案 二' },
      { 题目: '太子棺' },
    ]).map(row => row.题目)).toEqual(['漆屏案 一', '漆屏案 二', '漆屏案 三', '太子棺']);
    expect(sortChapterRows([
      { 题目: '小引' },
      { 题目: '第二出' },
      { 题目: '第一出' },
      { 题目: '砌抹' },
    ]).map(row => row.题目)).toEqual(['小引', '第一出', '第二出', '砌抹']);
  });

  it('读取整本作品并按回目编号排序', () => {
    const longLife = readCollection({
      file: '长生殿.json', title: '长生殿', author: '洪昇', dynasty: '清',
      category: '明清传奇', unit: '出/篇', expectedCount: 50,
    });
    expect(longLife).toHaveLength(50);
    expect(longLife.slice(0, 4).map(chapter => chapter.title)).toEqual([
      '第一出 传概', '第二出 定情', '第三出 贿权', '第四出 春睡',
    ]);
    const officialdom = readCollection({
      file: '官场.json', title: '官场现形记', author: '李伯元', dynasty: '晚清',
      category: '世情小说', unit: '回', expectedCount: 60,
    });
    expect(officialdom).toHaveLength(60);
    expect(officialdom[0].title.startsWith('第一回')).toBe(true);
    const purpleHairpin = readCollection({
      file: 'tmp/紫钗记.json', title: '紫钗记', author: '汤显祖', dynasty: '明',
      category: '传奇', unit: '出/篇', expectedCount: 53,
    });
    expect(purpleHairpin).toHaveLength(53);
    expect(purpleHairpin.slice(0, 3).map(chapter => chapter.title)).toEqual([
      '紫钗记第一出　本传开宗', '紫钗记第二出 春日言怀', '紫钗记第三出　插钗新赏',
    ]);
  });
});
