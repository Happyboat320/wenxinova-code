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

import { addCreationComment, getCreationDetail, getRecentCreations, toggleCreationLike } from './community.service.js';

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
      category: 'other',
      prompt: '测试作品',
      createdAt: new Date(),
      publishedAt: new Date(),
      user: { nickname: '作者', avatar: null },
      book: null,
      _count: { likes: 8, comments: 2 },
    }]);
    creationMock.count.mockResolvedValue(1);
    const result = await getRecentCreations();
    expect(result.list[0]).toMatchObject({ likeCount: 8, commentCount: 2 });
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
