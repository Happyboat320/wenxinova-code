import prisma from '../../lib/prisma.js';
import type { CreationCategory } from '../community/community.types.js';
import { toPublicUser } from '../auth/auth.service.js';
import { ensureSearchIndexes } from '../../lib/manticore.js';
import { syncCreationSearchDocument, syncUserPublishedCreations } from '../search/search.service.js';

function runSearchSync(task: () => Promise<void>, label: string) {
  // 单元测试使用模拟数据库，不能把模拟记录写进本机的真实 Manticore 索引。
  if (process.env.NODE_ENV === 'test') return;
  // 检索索引是可重建的派生数据；同步异常不能回滚已经成功写入 SQLite 的业务数据。
  void ensureSearchIndexes()
    .then(task)
    .catch(error => console.error(`${label}，可运行 npm run search:reindex 修复：`, error));
}

// 创建用户
export async function createUser(phone: string) {
  // 检查是否已存在
  const existing = await prisma.user.findUnique({
    where: { phone },
  });

  if (existing) {
    return existing;
  }

  return prisma.user.create({
    data: { phone },
  });
}

// 用户登录 (简化版，仅校验手机号是否存在)
export async function login(phone: string) {
  const user = await prisma.user.findUnique({
    where: { phone },
  });

  if (!user) {
    throw new Error('用户不存在');
  }

  return user;
}

export async function updateProfile(userId: number, data: {
  nickname: string;
  signature: string;
  avatar?: string | null;
}) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      nickname: data.nickname,
      signature: data.signature,
      ...(data.avatar === undefined ? {} : { avatar: data.avatar }),
    },
  });
  runSearchSync(() => syncUserPublishedCreations(userId), '昵称已保存，但社区检索索引同步失败');
  return toPublicUser(user);
}

// 保存草稿或发布创作。同一作品与分类只保留一份活动草稿。
export async function persistCreation(data: {
  userId: number;
  bookId?: number;
  category: CreationCategory;
  prompt: string;
  content: string;
  action: 'draft' | 'publish';
  draftId?: number;
}) {
  const author = await prisma.user.findUnique({ where: { id: data.userId }, select: { role: true } });
  if (!author) return null;
  const publishingStatus = author.role === 'admin' ? 'published' : 'pending';
  const draft = data.draftId
    ? await prisma.creation.findFirst({ where: { id: data.draftId, userId: data.userId, status: { in: ['draft', 'rejected'] } } })
    : await prisma.creation.findFirst({
        where: {
          userId: data.userId,
          bookId: data.bookId ?? null,
          category: data.category,
          status: { in: ['draft', 'rejected'] },
        },
        orderBy: { updatedAt: 'desc' },
      });

  if (data.draftId && !draft) return null;

  if (draft) {
    const creation = await prisma.creation.update({
      where: { id: draft.id },
      data: {
        prompt: data.prompt,
        content: data.content,
        category: data.category,
        status: data.action === 'publish' ? publishingStatus : 'draft',
        submittedAt: data.action === 'publish' ? new Date() : null,
        publishedAt: data.action === 'publish' && publishingStatus === 'published' ? new Date() : null,
        reviewedAt: null,
        reviewedById: null,
        reviewNote: null,
      },
    });
    runSearchSync(() => syncCreationSearchDocument(creation.id), '作品已保存，但社区检索索引同步失败');
    return creation;
  }

  const creation = await prisma.creation.create({
    data: {
      userId: data.userId,
      bookId: data.bookId,
      category: data.category,
      prompt: data.prompt,
      content: data.content,
      status: data.action === 'publish' ? publishingStatus : 'draft',
      submittedAt: data.action === 'publish' ? new Date() : null,
      publishedAt: data.action === 'publish' && publishingStatus === 'published' ? new Date() : null,
    },
  });
  runSearchSync(() => syncCreationSearchDocument(creation.id), '作品已保存，但社区检索索引同步失败');
  return creation;
}

export async function getDraft(userId: number, bookId: number, category: CreationCategory) {
  return prisma.creation.findFirst({
    where: { userId, bookId, category, status: { in: ['draft', 'rejected'] } },
    include: { book: { select: { title: true } } },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function applyForAdmin(userId: number, remark: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return { kind: 'missing' as const };
  if (user.role === 'admin') return { kind: 'admin' as const };
  const pending = await prisma.adminApplication.findFirst({ where: { userId, status: 'pending' } });
  if (pending) return { kind: 'pending' as const, application: pending };
  const application = await prisma.adminApplication.create({ data: { userId, remark } });
  return { kind: 'created' as const, application };
}

export async function getLatestAdminApplication(userId: number) {
  return prisma.adminApplication.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, remark: true, status: true, reviewNote: true, reviewedAt: true, createdAt: true },
  });
}

// 获取用户的创作历史
export async function getUserCreations(userId: number) {
  return prisma.creation.findMany({
    where: { userId },
    include: {
      book: {
        select: {
          title: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
}
