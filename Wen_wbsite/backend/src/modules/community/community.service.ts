import prisma from '../../lib/prisma.js';

// 获取最近的社区创作列表
export async function getRecentCreations(limit: number = 20) {
  const creations = await prisma.creation.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      userId: true,
      bookId: true,
      prompt: true,
      createdAt: true,
      // 不返回 content 字段
      user: {
        select: {
          phone: true,
        },
      },
      book: {
        select: {
          title: true,
        },
      },
    },
  });
  return creations.map(creation => ({
    ...creation,
    user: { phone: maskPhone(creation.user.phone) },
  }));
}

// 获取某一篇创作详情
export async function getCreationDetail(id: number) {
  const creation = await prisma.creation.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          phone: true,
        },
      },
      book: {
        select: {
          title: true,
          author: true,
        },
      },
    },
  });
  return creation ? { ...creation, user: { phone: maskPhone(creation.user.phone) } } : null;
}

function maskPhone(phone: string): string {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}
