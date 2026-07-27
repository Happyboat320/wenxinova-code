import prisma from '../../lib/prisma.js';
import { ensureSearchIndexes } from '../../lib/manticore.js';
import { syncCreationSearchDocument } from '../search/search.service.js';

function syncCommunityIndex(creationId: number) {
  if (process.env.NODE_ENV === 'test') return;
  void ensureSearchIndexes()
    .then(() => syncCreationSearchDocument(creationId))
    .catch(error => console.error('审核已完成，但社区检索索引同步失败：', error));
}

export async function getDashboard() {
  const [creations, applications] = await Promise.all([
    prisma.creation.findMany({
      where: { status: 'pending' },
      orderBy: { submittedAt: 'asc' },
      include: {
        user: { select: { id: true, phone: true, nickname: true, avatar: true } },
        book: { select: { title: true } },
      },
    }),
    prisma.adminApplication.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, phone: true, nickname: true, avatar: true } } },
    }),
  ]);
  return { creations, applications };
}

export async function reviewCreation(id: number, reviewerId: number, decision: 'approve' | 'reject', reviewNote?: string) {
  const now = new Date();
  const updated = await prisma.creation.updateMany({
    where: { id, status: 'pending' },
    data: {
      status: decision === 'approve' ? 'published' : 'rejected',
      reviewedById: reviewerId,
      reviewedAt: now,
      reviewNote: reviewNote || null,
      publishedAt: decision === 'approve' ? now : null,
    },
  });
  if (updated.count !== 1) return null;
  syncCommunityIndex(id);
  return prisma.creation.findUnique({ where: { id } });
}

export async function reviewAdminApplication(id: number, reviewerId: number, decision: 'approve' | 'reject', reviewNote?: string) {
  return prisma.$transaction(async tx => {
    const application = await tx.adminApplication.findFirst({ where: { id, status: 'pending' } });
    if (!application) return null;
    const now = new Date();
    const reviewed = await tx.adminApplication.update({
      where: { id },
      data: {
        status: decision === 'approve' ? 'approved' : 'rejected',
        reviewerId,
        reviewedAt: now,
        reviewNote: reviewNote || null,
      },
    });
    if (decision === 'approve') {
      await tx.user.update({ where: { id: application.userId }, data: { role: 'admin' } });
    }
    return reviewed;
  });
}
