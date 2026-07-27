import prisma from '../../lib/prisma.js';
import * as deepseek from '../../lib/deepseek.js';
import { searchLibraryIds } from '../search/search.service.js';

export const UNCATEGORIZED_VALUE = '__uncategorized__';

// 获取书籍列表；分类条件必须同时用于列表和总数，保证分页统计一致。
export async function getBookList(page: number = 1, category?: string, query?: string) {
  const pageSize = 9;
  const skip = (page - 1) * pageSize;
  const where = category === UNCATEGORIZED_VALUE
    ? { category: null }
    : category ? { category } : {};

  if (query) {
    const searchResult = await searchLibraryIds(query, page, pageSize, category);
    if (searchResult.ids.length === 0) {
      return { list: [], totalPages: Math.ceil(searchResult.total / pageSize), currentPage: page, totalCount: searchResult.total };
    }
    const matches = await prisma.book.findMany({
      where: { id: { in: searchResult.ids } },
      select: {
        id: true,
        title: true,
        author: true,
        category: true,
        description: true,
        summary: true,
      },
    });
    const byId = new Map(matches.map(book => [book.id, book]));
    return {
      // Prisma 的 IN 查询不保证顺序，按 Manticore 相关度顺序重新排列。
      list: searchResult.ids.map(id => byId.get(id)).filter((book): book is NonNullable<typeof book> => Boolean(book)),
      totalPages: Math.ceil(searchResult.total / pageSize),
      currentPage: page,
      totalCount: searchResult.total,
    };
  }

  const [books, total] = await Promise.all([
    prisma.book.findMany({
      select: {
        id: true,
        title: true,
        author: true,
        category: true,
        description: true,
        summary: true,
      },
      where,
      orderBy: { id: 'asc' },
      skip,
      take: pageSize,
    }),
    prisma.book.count({ where }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return {
    list: books,
    totalPages,
    currentPage: page,
    totalCount: total,
  };
}

// 获取书籍内容；长篇作品可指定回目，普通单篇作品保持原有返回方式。
export async function getBookContent(id: number, chapterId?: number) {
  const book = await prisma.book.findUnique({
    where: { id },
    select: {
      title: true,
      author: true,
      originalText: true,
      mainCharacters: true,
      characters: {
        select: {
          id: true,
          name: true,
          description: true,
        },
        orderBy: { id: 'asc' },
      },
      annotations: {
        select: {
          index: true,
          content: true,
        },
        orderBy: {
          index: 'asc',
        },
      },
      chapters: {
        select: {
          id: true,
          order: true,
          title: true,
          originalText: true,
          summary: true,
        },
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!book) return null;

  const activeChapter = chapterId === undefined
    ? book.chapters[0]
    : book.chapters.find(chapter => chapter.id === chapterId);
  if (chapterId !== undefined && !activeChapter) return null;

  return {
    title: book.title,
    author: book.author,
    content: activeChapter?.originalText || book.originalText || '',
    chapter: activeChapter ? {
      id: activeChapter.id,
      order: activeChapter.order,
      title: activeChapter.title,
      summary: activeChapter.summary,
    } : null,
    chapters: book.chapters.map(chapter => ({ id: chapter.id, order: chapter.order, title: chapter.title })),
    // 保留数据库里的真实序号；注释可能不是从 1 连续排列，不能再用数组下标猜测序号。
    annotations: activeChapter ? [] : book.annotations,
    characters: book.characters.length > 0
      ? book.characters
      : (book.mainCharacters || '')
          .split(/[、，,；;\s]+/)
          .map((name, index) => ({ id: -(index + 1), name: name.trim(), description: null }))
          .filter(character => character.name),
  };
}

// 分类完全取自数据库实际值；空值作为“未分类”返回，不维护易失真的硬编码名单。
export async function getBookCategories() {
  const groups = await prisma.book.groupBy({
    by: ['category'],
    _count: { _all: true },
  });

  return groups
    // 使用 _all 才能让 category 为空的“未分类”也按真实数量参与排序。
    .sort((left, right) => (
      right._count._all - left._count._all
      || (left.category || '未分类').localeCompare(right.category || '未分类', 'zh-CN')
    ))
    .map(group => ({
      value: group.category || UNCATEGORIZED_VALUE,
      label: group.category || '未分类',
      count: group._count._all,
    }));
}

// 获取书籍译文；回目译文独立缓存，避免切换回目时串用其他篇章内容。
export async function getTranslation(id: number, chapterId?: number): Promise<string> {
  const book = await prisma.book.findUnique({
    where: { id },
    select: {
      originalText: true,
      translatedText: true,
      chapters: {
        select: { id: true, order: true, originalText: true, translatedText: true },
        orderBy: { order: 'asc' },
      },
    },
  });

  const chapter = chapterId === undefined
    ? book?.chapters[0]
    : book?.chapters.find(item => item.id === chapterId);
  if (chapterId !== undefined && !chapter) throw new Error('回目不存在或不属于当前作品');
  const originalText = chapter?.originalText || book?.originalText;
  const cachedTranslation = chapter?.translatedText || book?.translatedText;

  if (!book || !originalText) {
    throw new Error('书籍原文不存在');
  }

  // 先尝试从数据库获取
  if (cachedTranslation) {
    return cachedTranslation;
  }

  // 获取不到则调用 AI 翻译
  const translation = await deepseek.translateToModernChinese(originalText);

  // 翻译后存入数据库
  if (chapter) {
    await prisma.bookChapter.update({ where: { id: chapter.id }, data: { translatedText: translation } });
    // 首回同时更新兼容字段，供旧客户端及知识图谱等既有逻辑使用。
    if (chapter.order === 1) await prisma.book.update({ where: { id }, data: { translatedText: translation } });
  } else {
    await prisma.book.update({ where: { id }, data: { translatedText: translation } });
  }

  return translation;
}

// 流式获取书籍译文 (保留兼容性)
export async function streamTranslation(id: number, res: any, chapterId?: number) {
  const translation = await getTranslation(id, chapterId);
  res.write(translation);
  res.end();
}
