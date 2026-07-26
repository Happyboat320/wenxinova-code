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
  BOOK_CATEGORIES,
  getBookCategories,
  getBookList,
  isBookCategory,
} from './book.service.js';

describe('文库题材体裁分类', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('只接受约定的八个一级分类', () => {
    expect(BOOK_CATEGORIES).toHaveLength(8);
    expect(isBookCategory('传奇')).toBe(true);
    expect(isBookCategory('历史演义')).toBe(true);
    expect(isBookCategory('散文')).toBe(false);
  });

  it('分类列表顺序固定，并为暂无作品的分类补零', async () => {
    bookMock.groupBy.mockResolvedValue([
      { category: '传奇', _count: { _all: 3 } },
      { category: '笔记小说', _count: { _all: 12 } },
    ]);

    const result = await getBookCategories();

    expect(result.map(item => item.value)).toEqual(BOOK_CATEGORIES);
    expect(result.find(item => item.value === '传奇')?.count).toBe(3);
    expect(result.find(item => item.value === '神怪小说')?.count).toBe(0);
  });

  it('分类条件同时作用于作品列表和总数分页', async () => {
    bookMock.findMany.mockResolvedValue([]);
    bookMock.count.mockResolvedValue(0);

    await getBookList(2, '话本');

    expect(bookMock.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { category: '话本' },
      skip: 9,
      take: 9,
    }));
    expect(bookMock.count).toHaveBeenCalledWith({ where: { category: '话本' } });
  });
});
