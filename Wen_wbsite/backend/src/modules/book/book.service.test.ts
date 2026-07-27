import { beforeEach, describe, expect, it, vi } from 'vitest';

const bookMock = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({
  default: { book: bookMock },
}));

import {
  getBookCategories,
  getBookContent,
  getBookList,
  UNCATEGORIZED_VALUE,
} from './book.service.js';

describe('文库实际数据分类', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('直接返回数据库中的全部分类，并将空值显示为未分类', async () => {
    bookMock.groupBy.mockResolvedValue([
      { category: null, _count: { _all: 12 } },
      { category: '散文', _count: { _all: 3790 } },
      { category: '笔记小说', _count: { _all: 20054 } },
    ]);

    await expect(getBookCategories()).resolves.toEqual([
      { value: '笔记小说', label: '笔记小说', count: 20054 },
      { value: '散文', label: '散文', count: 3790 },
      { value: UNCATEGORIZED_VALUE, label: '未分类', count: 12 },
    ]);
    expect(bookMock.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['category'],
    }));
  });

  it('实际分类条件同时作用于作品列表和总数分页', async () => {
    bookMock.findMany.mockResolvedValue([]);
    bookMock.count.mockResolvedValue(0);

    await getBookList(2, '散文');

    expect(bookMock.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { category: '散文' },
      skip: 9,
      take: 9,
    }));
    expect(bookMock.count).toHaveBeenCalledWith({ where: { category: '散文' } });
  });

  it('未分类选项筛选数据库空值', async () => {
    bookMock.findMany.mockResolvedValue([]);
    bookMock.count.mockResolvedValue(0);

    await getBookList(1, UNCATEGORIZED_VALUE);

    expect(bookMock.count).toHaveBeenCalledWith({ where: { category: null } });
  });

  it('长篇作品默认返回首回，并允许选择指定回目', async () => {
    bookMock.findUnique.mockResolvedValue({
      title: '玉娇梨',
      author: '荑秋散人',
      originalText: '兼容原文',
      mainCharacters: null,
      characters: [],
      annotations: [{ index: 1, content: '普通注释' }],
      chapters: [
        { id: 11, order: 1, title: '第一回', originalText: '首回正文', summary: '首回梗概' },
        { id: 12, order: 2, title: '第二回', originalText: '次回正文', summary: null },
      ],
    });

    await expect(getBookContent(7, 12)).resolves.toMatchObject({
      title: '玉娇梨',
      content: '次回正文',
      chapter: { id: 12, title: '第二回' },
      annotations: [],
    });
  });
});
