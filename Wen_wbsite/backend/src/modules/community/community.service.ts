import prisma from '../../lib/prisma.js';
import { CREATION_CATEGORIES, type CreationCategory } from './community.types.js';
import { searchCommunityIds } from '../search/search.service.js';

const PAGE_SIZE = 20;

// 获取社区创作分页；列表接口不返回正文，避免一次加载大量 Markdown。
export async function getRecentCreations(page: number = 1, category?: CreationCategory, query?: string) {
  const where = category ? { category, status: 'published' } : { status: 'published' };
  const select = {
        id: true,
        userId: true,
        bookId: true,
        category: true,
        prompt: true,
        createdAt: true,
        publishedAt: true,
        user: {
          select: {
            nickname: true,
            avatar: true,
          },
        },
        book: {
          select: {
            title: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
  } as const;

  let creations;
  let totalCount;
  if (query) {
    const searchResult = await searchCommunityIds(query, page, PAGE_SIZE, category);
    totalCount = searchResult.total;
    const matches = searchResult.ids.length === 0 ? [] : await prisma.creation.findMany({
      where: { id: { in: searchResult.ids }, status: 'published' },
      select,
    });
    const byId = new Map(matches.map(creation => [creation.id, creation]));
    creations = searchResult.ids.map(id => byId.get(id)).filter((creation): creation is NonNullable<typeof creation> => Boolean(creation));
  } else {
    [creations, totalCount] = await Promise.all([
      prisma.creation.findMany({
        where,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        orderBy: [
          { likes: { _count: 'desc' } },
          { publishedAt: 'desc' },
        ],
        select,
      }),
      prisma.creation.count({ where }),
    ]);
  }

  return {
    list: creations.map(({ _count, ...creation }) => ({
      ...creation,
      likeCount: _count.likes,
      commentCount: _count.comments,
      user: { nickname: creation.user.nickname || '未设置昵称', avatar: creation.user.avatar },
    })),
    currentPage: page,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
    totalCount,
    pageSize: PAGE_SIZE,
  };
}

// 分类固定展示，即使某类当前为 0 条，也便于用户理解可发布的内容类型。
export async function getCreationCategories() {
  const groups = await prisma.creation.groupBy({
    by: ['category'],
    where: { status: 'published' },
    _count: { _all: true },
  });
  const counts = new Map(groups.map(group => [group.category, group._count._all]));
  return CREATION_CATEGORIES.map(category => ({ ...category, count: counts.get(category.value) || 0 }));
}

// 获取某一篇创作详情
export async function getCreationDetail(id: number, currentUserId?: number) {
  const creation = await prisma.creation.findFirst({
    where: { id, status: 'published' },
    include: {
      user: {
        select: {
          nickname: true,
          avatar: true,
        },
      },
      book: {
        select: {
          title: true,
          author: true,
        },
      },
      likes: {
        where: { userId: currentUserId ?? -1 },
        select: { userId: true },
      },
      comments: {
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          content: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              nickname: true,
              avatar: true,
            },
          },
        },
      },
      _count: {
        select: {
          likes: true,
          comments: true,
        },
      },
    },
  });
  if (!creation) return null;
  const { _count, likes, comments, ...detail } = creation;
  return {
    ...detail,
    likeCount: _count.likes,
    commentCount: _count.comments,
    likedByCurrentUser: likes.length > 0,
    comments: comments.map(comment => ({
      ...comment,
      user: { nickname: comment.user.nickname || '未设置昵称', avatar: comment.user.avatar },
    })),
    user: { nickname: creation.user.nickname || '未设置昵称', avatar: creation.user.avatar },
  };
}

export async function toggleCreationLike(creationId: number, userId: number) {
  const creation = await prisma.creation.findFirst({
    where: { id: creationId, status: 'published' },
    select: { id: true },
  });
  if (!creation) return null;

  return prisma.$transaction(async transaction => {
    const existing = await transaction.creationLike.findUnique({
      where: { userId_creationId: { userId, creationId } },
    });
    if (existing) {
      await transaction.creationLike.delete({
        where: { userId_creationId: { userId, creationId } },
      });
    } else {
      await transaction.creationLike.create({ data: { userId, creationId } });
    }
    return {
      liked: !existing,
      likeCount: await transaction.creationLike.count({ where: { creationId } }),
    };
  });
}

export async function addCreationComment(creationId: number, userId: number, content: string) {
  const creation = await prisma.creation.findFirst({
    where: { id: creationId, status: 'published' },
    select: { id: true },
  });
  if (!creation) return null;

  const comment = await prisma.creationComment.create({
    data: { creationId, userId, content },
    select: {
      id: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          nickname: true,
          avatar: true,
        },
      },
    },
  });
  return {
    ...comment,
    user: { nickname: comment.user.nickname || '未设置昵称', avatar: comment.user.avatar },
  };
}
