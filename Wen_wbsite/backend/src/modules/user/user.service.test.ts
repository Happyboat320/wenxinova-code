import { beforeEach, describe, expect, it, vi } from 'vitest';

const creationMock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));
const userMock = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock('../../lib/prisma.js', () => ({
  default: { creation: creationMock, user: userMock },
}));

import { persistCreation } from './user.service.js';

describe('草稿与发布', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userMock.findUnique.mockResolvedValue({ role: 'admin' });
  });

  it('同一作品和分类重复保存时覆盖现有草稿', async () => {
    creationMock.findFirst.mockResolvedValue({ id: 12, status: 'draft' });
    creationMock.update.mockResolvedValue({ id: 12, status: 'draft', content: '新内容' });

    await persistCreation({
      userId: 3,
      bookId: 8,
      category: 'adaptation',
      prompt: '改编要求',
      content: '新内容',
      action: 'draft',
    });

    expect(creationMock.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 3, bookId: 8, category: 'adaptation', status: { in: ['draft', 'rejected'] } },
    }));
    expect(creationMock.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 12 },
      data: expect.objectContaining({ status: 'draft', publishedAt: null }),
    }));
  });

  it('普通用户提交发布时进入待审核状态', async () => {
    userMock.findUnique.mockResolvedValue({ role: 'user' });
    creationMock.findFirst.mockResolvedValue(null);
    creationMock.create.mockResolvedValue({ id: 13, status: 'pending' });

    await persistCreation({
      userId: 4,
      bookId: 8,
      category: 'adaptation',
      prompt: '改编要求',
      content: '待审核内容',
      action: 'publish',
    });

    expect(creationMock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'pending', submittedAt: expect.any(Date), publishedAt: null }),
    }));
  });

  it('发布已保存草稿时将原记录转为已发布', async () => {
    creationMock.findFirst.mockResolvedValue({ id: 12, status: 'draft' });
    creationMock.update.mockResolvedValue({ id: 12, status: 'published' });

    await persistCreation({
      userId: 3,
      bookId: 8,
      category: 'script',
      prompt: '角色',
      content: '剧本',
      action: 'publish',
      draftId: 12,
    });

    expect(creationMock.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 12 },
      data: expect.objectContaining({ status: 'published', publishedAt: expect.any(Date) }),
    }));
  });
});
