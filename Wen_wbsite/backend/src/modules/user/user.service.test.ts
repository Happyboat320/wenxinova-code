import { beforeEach, describe, expect, it, vi } from 'vitest';

const creationMock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({
  default: { creation: creationMock, user: {} },
}));

import { persistCreation } from './user.service.js';

describe('草稿与发布', () => {
  beforeEach(() => vi.clearAllMocks());

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
      where: { userId: 3, bookId: 8, category: 'adaptation', status: 'draft' },
    }));
    expect(creationMock.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 12 },
      data: expect.objectContaining({ status: 'draft', publishedAt: null }),
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
