import prisma from '../../lib/prisma.js';
import * as deepseek from '../../lib/deepseek.js';

// 文库只提供产品约定的八个“题材体裁”一级分类，避免把数据库中的其他文体混入导航。
export const BOOK_CATEGORIES = [
  '传奇',
  '神怪小说',
  '话本',
  '拟话本',
  '笔记小说',
  '公案小说',
  '世情小说',
  '历史演义',
] as const;

export type BookCategory = (typeof BOOK_CATEGORIES)[number];

export function isBookCategory(value: unknown): value is BookCategory {
  return typeof value === 'string' && BOOK_CATEGORIES.some(category => category === value);
}

// 获取书籍列表；分类条件必须同时用于列表和总数，保证分页统计一致。
export async function getBookList(page: number = 1, category?: BookCategory) {
  const pageSize = 9;
  const skip = (page - 1) * pageSize;
  const where = category ? { category } : {};

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

// 获取书籍内容和注释
export async function getBookContent(id: number) {
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
    },
  });

  if (!book) return null;

  return {
    title: book.title,
    author: book.author,
    content: book.originalText || '',
    // 保留数据库里的真实序号；注释可能不是从 1 连续排列，不能再用数组下标猜测序号。
    annotations: book.annotations,
    characters: book.characters.length > 0
      ? book.characters
      : (book.mainCharacters || '')
          .split(/[、，,；;\s]+/)
          .map((name, index) => ({ id: -(index + 1), name: name.trim(), description: null }))
          .filter(character => character.name),
  };
}

// 即使某个分类暂时没有作品也要返回，确保前端始终完整展示八个一级分类。
export async function getBookCategories() {
  const groups = await prisma.book.groupBy({
    by: ['category'],
    _count: { _all: true },
    where: { category: { in: [...BOOK_CATEGORIES] } },
  });

  const counts = new Map(groups.map(group => [group.category, group._count._all]));
  return BOOK_CATEGORIES.map(category => ({
    value: category,
    label: category,
    count: counts.get(category) || 0,
  }));
}

// 获取书籍译文
export async function getTranslation(id: number): Promise<string> {
  const book = await prisma.book.findUnique({
    where: { id },
    select: {
      originalText: true,
      translatedText: true,
    },
  });

  if (!book || !book.originalText) {
    throw new Error('书籍原文不存在');
  }

  // 先尝试从数据库获取
  if (book.translatedText) {
    return book.translatedText;
  }

  // 获取不到则调用 AI 翻译
  const translation = await deepseek.translateToModernChinese(book.originalText);

  // 翻译后存入数据库
  await prisma.book.update({
    where: { id },
    data: { translatedText: translation },
  });

  return translation;
}

// 流式获取书籍译文 (保留兼容性)
export async function streamTranslation(id: number, res: any) {
  const translation = await getTranslation(id);
  res.write(translation);
  res.end();
}
