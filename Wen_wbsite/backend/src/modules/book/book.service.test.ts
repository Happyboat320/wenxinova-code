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
  DISPLAY_CATEGORIES,
  getBookCategories,
  getBookContent,
  getBookList,
  NOTE_STYLE_CATEGORY,
} from './book.service.js';

describe('文库实际数据分类', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('将非保留题材体裁合并为笔记小说，并固定返回九个展示类', async () => {
    bookMock.groupBy.mockResolvedValue([
      { category: null, _count: { _all: 12 } },
      { category: '散文', _count: { _all: 3790 } },
      { category: '诗', _count: { _all: 20 } },
      { category: '笔记小说', _count: { _all: 20054 } },
      { category: '公案小说', _count: { _all: 100 } },
      { category: '神怪小说', _count: { _all: 8 } },
      { category: '明清传奇', _count: { _all: 3 } },
      { category: '传奇', _count: { _all: 5 } },
      { category: '历史演演义', _count: { _all: 2 } },
    ]);

    const categories = await getBookCategories();
    expect(categories).toEqual([
      { value: NOTE_STYLE_CATEGORY, label: NOTE_STYLE_CATEGORY, count: 23876 },
      { value: '神怪小说', label: '神怪小说', count: 8 },
      { value: '唐宋传奇', label: '唐宋传奇', count: 5 },
      { value: '明清传奇', label: '明清传奇', count: 3 },
      { value: '拟话本', label: '拟话本', count: 0 },
      { value: '话本', label: '话本', count: 0 },
      { value: '世情小说', label: '世情小说', count: 0 },
      { value: '公案小说', label: '公案小说', count: 100 },
      { value: '历史演义', label: '历史演义', count: 2 },
    ]);
    expect(categories.map(category => category.value)).toEqual([...DISPLAY_CATEGORIES]);
    expect(bookMock.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ['category'],
    }));
  });

  it('笔记小说分类条件同时作用于作品列表和总数分页', async () => {
    bookMock.findMany.mockResolvedValue([]);
    bookMock.count.mockResolvedValue(0);

    await getBookList(2, NOTE_STYLE_CATEGORY);

    const regularListCall = bookMock.findMany.mock.calls
      .map(([args]) => args)
      .find(args => args.skip === 9 && args.take === 9);
    expect(regularListCall).toEqual(expect.objectContaining({
      where: {
        OR: [
          { category: null },
          { category: { notIn: expect.arrayContaining(['神怪小说', '传奇', '明清传奇', '拟话本', '话本', '世情小说', '公案小说', '历史演义']) } },
        ],
      },
      orderBy: { id: 'desc' },
    }));
    expect(bookMock.count).toHaveBeenCalledWith({
      where: {
        OR: [
          { category: null },
          { category: { notIn: expect.arrayContaining(['神怪小说', '传奇', '明清传奇', '拟话本', '话本', '世情小说', '公案小说', '历史演义']) } },
        ],
      },
    });
  });

  it('将有专属图片的篇目优先排在文库首页，并用普通作品补齐当前页', async () => {
    bookMock.findMany
      .mockResolvedValueOnce([
        { id: 20, title: '桃花扇', author: '', category: '明清传奇', description: null, summary: null, image: '/library-covers/《桃花扇》插图.png' },
        { id: 40, title: '隋唐演义', author: '', category: '历史演义', description: null, summary: null, image: '/library-covers/《隋唐演义》插图.png' },
        { id: 10, title: '隋唐演义', author: '', category: '笔记小说', description: null, summary: null, image: '/library-covers/《隋唐演义》插图.png' },
      ])
      .mockResolvedValueOnce([
        { id: 30, title: '普通后取', author: '', category: '散文', description: null, summary: null, image: null },
        { id: 39, title: '普通作品', author: '', category: '散文', description: null, summary: null, image: null },
      ]);
    bookMock.count.mockResolvedValue(4);

    const result = await getBookList(1);

    expect(result.list.map(book => book.title)).toEqual(['隋唐演义', '桃花扇', '普通后取', '普通作品']);
    expect(result.list.map(book => book.image)).toEqual([
      '/library-covers/《隋唐演义》插图.png',
      '/library-covers/《桃花扇》插图.png',
      '/library-covers/通用插图 (3).png',
      '/library-covers/通用插图 (4).png',
    ]);
    expect(bookMock.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { title: { in: expect.arrayContaining(['隋唐演义', '桃花扇']) } },
    }));
    expect(bookMock.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { id: { notIn: [40, 20] } },
      skip: 0,
      take: 7,
    }));
  });

  it('保留类别筛选映射到对应源类别', async () => {
    bookMock.findMany.mockResolvedValue([]);
    bookMock.count.mockResolvedValue(0);

    await getBookList(1, '唐宋传奇');

    expect(bookMock.count).toHaveBeenCalledWith({ where: { category: '传奇' } });

    vi.clearAllMocks();
    bookMock.findMany.mockResolvedValue([]);
    bookMock.count.mockResolvedValue(0);

    await getBookList(1, '明清传奇');

    expect(bookMock.count).toHaveBeenCalledWith({ where: { category: '明清传奇' } });

    vi.clearAllMocks();
    bookMock.findMany.mockResolvedValue([]);
    bookMock.count.mockResolvedValue(0);

    await getBookList(1, '公案小说');

    expect(bookMock.count).toHaveBeenCalledWith({ where: { category: '公案小说' } });
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
