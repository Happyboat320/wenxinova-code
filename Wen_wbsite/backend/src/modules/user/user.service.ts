import prisma from '../../lib/prisma.js';
import type { CreationCategory } from '../community/community.types.js';
import { toPublicUser } from '../auth/auth.service.js';

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
  const draft = data.draftId
    ? await prisma.creation.findFirst({ where: { id: data.draftId, userId: data.userId, status: 'draft' } })
    : await prisma.creation.findFirst({
        where: {
          userId: data.userId,
          bookId: data.bookId ?? null,
          category: data.category,
          status: 'draft',
        },
        orderBy: { updatedAt: 'desc' },
      });

  if (data.draftId && !draft) return null;

  if (draft) {
    return prisma.creation.update({
      where: { id: draft.id },
      data: {
        prompt: data.prompt,
        content: data.content,
        category: data.category,
        status: data.action === 'publish' ? 'published' : 'draft',
        publishedAt: data.action === 'publish' ? new Date() : null,
      },
    });
  }

  return prisma.creation.create({
    data: {
      userId: data.userId,
      bookId: data.bookId,
      category: data.category,
      prompt: data.prompt,
      content: data.content,
      status: data.action === 'publish' ? 'published' : 'draft',
      publishedAt: data.action === 'publish' ? new Date() : null,
    },
  });
}

export async function getDraft(userId: number, bookId: number, category: CreationCategory) {
  return prisma.creation.findFirst({
    where: { userId, bookId, category, status: 'draft' },
    include: { book: { select: { title: true } } },
    orderBy: { updatedAt: 'desc' },
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
