import { beforeEach, describe, expect, it, vi } from 'vitest';

const creation = vi.hoisted(() => ({ updateMany: vi.fn(), findUnique: vi.fn() }));
const adminApplication = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn() }));
const user = vi.hoisted(() => ({ update: vi.fn() }));
const transaction = vi.hoisted(() => vi.fn());

vi.mock('../../lib/prisma.js', () => ({
  default: { creation, adminApplication, user, $transaction: transaction },
}));

import { reviewAdminApplication, reviewCreation } from './admin.service.js';

describe('管理员审核', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transaction.mockImplementation(async callback => callback({ adminApplication, user }));
  });

  it('通过待审核作品时记录审核人并公开', async () => {
    creation.updateMany.mockResolvedValue({ count: 1 });
    creation.findUnique.mockResolvedValue({ id: 8, status: 'published' });
    await expect(reviewCreation(8, 2, 'approve', '内容合规')).resolves.toMatchObject({ status: 'published' });
    expect(creation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 8, status: 'pending' },
      data: expect.objectContaining({ status: 'published', reviewedById: 2, publishedAt: expect.any(Date) }),
    }));
  });

  it('通过管理员申请时在同一事务中赋予角色', async () => {
    adminApplication.findFirst.mockResolvedValue({ id: 5, userId: 9, status: 'pending' });
    adminApplication.update.mockResolvedValue({ id: 5, status: 'approved' });
    user.update.mockResolvedValue({ id: 9, role: 'admin' });
    await expect(reviewAdminApplication(5, 2, 'approve')).resolves.toMatchObject({ status: 'approved' });
    expect(user.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { role: 'admin' } });
  });
});
