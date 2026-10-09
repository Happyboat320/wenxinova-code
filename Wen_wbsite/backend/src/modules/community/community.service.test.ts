import { beforeEach, describe, expect, it, vi } from 'vitest';

const creationMock = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
}));
const creationLikeMock = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
}));
const creationCommentMock = vi.hoisted(() => ({ create: vi.fn() }));
const transactionMock = vi.hoisted(() => vi.fn());

vi.mock('../../lib/prisma.js', () => ({
  default: {
    creation: creationMock,
    creationLike: creationLikeMock,
    creationComment: creationCommentMock,
    $transaction: transactionMock,
  },
}));

import { addCreationComment, getCreationCategories, getCreationDetail, getRecentCreations, toggleCreationLike } from './community.service.js';

describe('UGC 草稿隔离', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(async callback => callback({ creationLike: creationLikeMock }));
  });

  it('社区列表只查询已发布作品', async () => {
    creationMock.findMany.mockResolvedValue([]);
    creationMock.count.mockResolvedValue(0);
    await getRecentCreations(1, 'adaptation');
    expect(creationMock.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { category: 'adaptation', status: 'published' },
      orderBy: [
        { likes: { _count: 'desc' } },
        { publishedAt: 'desc' },
      ],
    }));
    expect(creationMock.count).toHaveBeenCalledWith({ where: { category: 'adaptation', status: 'published' } });
  });

  it('剧本杀筛选同时查询剧本与线索子类型', async () => {
    creationMock.findMany.mockResolvedValue([]);
    creationMock.count.mockResolvedValue(0);
    await getRecentCreations(1, 'script');
    expect(creationMock.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { category: { in: ['script', 'props'] }, status: 'published' },
    }));
    expect(creationMock.count).toHaveBeenCalledWith({
      where: { category: { in: ['script', 'props'] }, status: 'published' },
    });
  });

  it('社区详情也不允许通过 ID 读取草稿', async () => {
    creationMock.findFirst.mockResolvedValue(null);
    await expect(getCreationDetail(9)).resolves.toBeNull();
    expect(creationMock.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 9, status: 'published' },
    }));
  });

  it('社区列表返回点赞和评论数量', async () => {
    creationMock.findMany.mockResolvedValue([{
      id: 3,
      userId: 1,
      bookId: null,
      category: 'props',
      prompt: '测试作品',
      createdAt: new Date(),
      publishedAt: new Date(),
      user: { nickname: '作者', avatar: null },
      book: null,
      _count: { likes: 8, comments: 2 },
    }]);
    creationMock.count.mockResolvedValue(1);
    const result = await getRecentCreations();
    expect(result.list[0]).toMatchObject({ category: 'script', likeCount: 8, commentCount: 2 });
  });

  it('社区仅展示三类，并将剧本和线索数量合并', async () => {
    creationMock.groupBy.mockResolvedValue([
      { category: 'adaptation', _count: { _all: 3 } },
      { category: 'script', _count: { _all: 2 } },
      { category: 'props', _count: { _all: 4 } },
      { category: 'coplay', _count: { _all: 1 } },
    ]);

    await expect(getCreationCategories()).resolves.toEqual([
      { value: 'adaptation', label: '风格化改编', count: 3 },
      { value: 'script', label: '剧本杀', count: 6 },
      { value: 'coplay', label: '数字共演', count: 1 },
    ]);
  });

  it('点赞接口创建首次点赞并返回最新数量', async () => {
    creationMock.findFirst.mockResolvedValue({ id: 3 });
    creationLikeMock.findUnique.mockResolvedValue(null);
    creationLikeMock.create.mockResolvedValue({ userId: 2, creationId: 3 });
    creationLikeMock.count.mockResolvedValue(4);
    await expect(toggleCreationLike(3, 2)).resolves.toEqual({ liked: true, likeCount: 4 });
    expect(creationLikeMock.create).toHaveBeenCalledWith({ data: { userId: 2, creationId: 3 } });
  });

  it('评论只允许添加到已发布作品并返回作者信息', async () => {
    creationMock.findFirst.mockResolvedValue({ id: 3 });
    creationCommentMock.create.mockResolvedValue({
      id: 5,
      content: '写得很好',
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { nickname: null, avatar: null },
    });
    const result = await addCreationComment(3, 2, '写得很好');
    expect(result).toMatchObject({ id: 5, content: '写得很好', user: { nickname: '未设置昵称' } });
  });
});
