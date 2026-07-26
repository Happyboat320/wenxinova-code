import { beforeEach, describe, expect, it, vi } from 'vitest';

const bookMock = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({
  default: { book: bookMock },
}));

import {
  getBookCategories,
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
      { value: UNCATEGORIZED_VALUE, label: '未分类', count: 12 },
      { value: '散文', label: '散文', count: 3790 },
      { value: '笔记小说', label: '笔记小说', count: 20054 },
    ]);
    expect(bookMock.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['category'],
      orderBy: { category: 'asc' },
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
});
