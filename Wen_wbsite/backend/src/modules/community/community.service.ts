import prisma from '../../lib/prisma.js';
import { CREATION_CATEGORIES, type CreationCategory } from './community.types.js';

const PAGE_SIZE = 20;

// 获取社区创作分页；列表接口不返回正文，避免一次加载大量 Markdown。
export async function getRecentCreations(page: number = 1, category?: CreationCategory) {
  const where = category ? { category } : {};
  const [creations, totalCount] = await Promise.all([
    prisma.creation.findMany({
      where,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        bookId: true,
        category: true,
        prompt: true,
        createdAt: true,
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
    }),
    prisma.creation.count({ where }),
  ]);

  return {
    list: creations.map(creation => ({
      ...creation,
      user: { phone: maskPhone(creation.user.phone) },
    })),
    currentPage: page,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
    totalCount,
    pageSize: PAGE_SIZE,
  };
}

// 分类固定展示，即使某类当前为 0 条，也便于用户理解可发布的内容类型。
export async function getCreationCategories() {
  const groups = await prisma.creation.groupBy({ by: ['category'], _count: { _all: true } });
  const counts = new Map(groups.map(group => [group.category, group._count._all]));
  return CREATION_CATEGORIES.map(category => ({ ...category, count: counts.get(category.value) || 0 }));
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
