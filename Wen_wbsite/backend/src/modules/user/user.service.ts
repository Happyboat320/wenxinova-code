import prisma from '../../lib/prisma.js';
import type { CreationCategory } from '../community/community.types.js';

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

// 保存创作记录
export async function saveCreation(data: {
  userId: number;
  bookId?: number;
  category: CreationCategory;
  prompt: string;
  content: string;
}) {
  return prisma.creation.create({
    data: {
      userId: data.userId,
      bookId: data.bookId,
      category: data.category,
      prompt: data.prompt,
      content: data.content,
    },
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
    orderBy: { createdAt: 'desc' },
  });
}
