import prisma from '../../lib/prisma.js';
import * as deepseek from '../../lib/deepseek.js';
import { EXACT_COVER_TITLE_ORDER, getGeneralLibraryCover, getTitleCover } from '../../lib/book-covers.js';
import { searchLibraryIds } from '../search/search.service.js';
import type { Prisma } from '@prisma/client';

export const UNCATEGORIZED_VALUE = '__uncategorized__';
export const NOTE_STYLE_CATEGORY = '笔记小说';
export const DISPLAY_CATEGORIES = [
  NOTE_STYLE_CATEGORY,
  '神怪小说',
  '唐宋传奇',
  '明清传奇',
  '拟话本',
  '话本',
  '世情小说',
  '公案小说',
  '历史演义',
] as const;

const displayCategorySources: Record<string, string[]> = {
  神怪小说: ['神怪小说'],
  唐宋传奇: ['传奇'],
  明清传奇: ['明清传奇'],
  拟话本: ['拟话本'],
  话本: ['话本'],
  世情小说: ['世情小说'],
  公案小说: ['公案小说'],
  历史演义: ['历史演义', '历史演演义'],
};

const nonNoteSourceCategories = Object.values(displayCategorySources).flat();
const FEATURED_TITLE_RANK = new Map<string, number>(
  EXACT_COVER_TITLE_ORDER.map((title, index) => [title, index]),
);
const BOOK_LIST_PAGE_SIZE = 9;

// 兼容历史导入数据：部分记录把换行保存成字面量“\\n”，读取时统一还原为真正换行。
function normalizeBookText(text: string): string {
  return text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

type BookListItem = {
  id: number;
  title: string;
  author: string;
  category: string | null;
  description: string | null;
  summary: string | null;
  image: string | null;
};

function categoryLabel(category: string | null): string | null {
  if (!category) return NOTE_STYLE_CATEGORY;
  for (const [label, sources] of Object.entries(displayCategorySources)) {
    if (sources.includes(category)) return label;
  }
  return NOTE_STYLE_CATEGORY;
}

function normalizeCategoryFilter(category?: string): Prisma.BookWhereInput {
  if (!category) return {};
  if (category === NOTE_STYLE_CATEGORY || category === UNCATEGORIZED_VALUE) {
    return {
      OR: [
        { category: null },
        { category: { notIn: nonNoteSourceCategories } },
      ],
    };
  }
  const sourceCategories = displayCategorySources[category];
  if (!sourceCategories) return {};
  return sourceCategories.length === 1 ? { category: sourceCategories[0] } : { category: { in: sourceCategories } };
}

function combineWhere(...clauses: Prisma.BookWhereInput[]): Prisma.BookWhereInput {
  const activeClauses = clauses.filter(clause => Object.keys(clause).length > 0);
  if (activeClauses.length === 0) return {};
  if (activeClauses.length === 1) return activeClauses[0];
  return { AND: activeClauses };
}

function sortFeaturedBooks<T extends { id: number; title: string }>(books: T[]): T[] {
  return [...books].sort((left, right) => {
    const leftRank = FEATURED_TITLE_RANK.get(left.title) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = FEATURED_TITLE_RANK.get(right.title) ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || right.id - left.id;
  });
}

function selectFeaturedBooks<T extends { id: number; title: string }>(books: T[]): T[] {
  const seenTitles = new Set<string>();
  return sortFeaturedBooks(books)
    .filter(book => FEATURED_TITLE_RANK.has(book.title))
    .filter(book => {
      if (seenTitles.has(book.title)) return false;
      seenTitles.add(book.title);
      return true;
    });
}

function normalizeSearchCategoryFilter(category?: string): { category?: string | string[]; categoryNot?: string[] } {
  if (!category) return {};
  if (category === NOTE_STYLE_CATEGORY || category === UNCATEGORIZED_VALUE) {
    return { categoryNot: nonNoteSourceCategories };
  }
  const sourceCategories = displayCategorySources[category];
  return sourceCategories ? { category: sourceCategories } : {};
}

function presentBookCategory<T extends { category: string | null; title?: string; image?: string | null }>(book: T, coverIndex?: number): T {
  const titleCover = book.title ? getTitleCover(book.title) : null;
  return {
    ...book,
    category: categoryLabel(book.category),
    ...(book.title && 'image' in book ? {
      image: titleCover || getGeneralLibraryCover(coverIndex ?? 0),
    } : {}),
  };
}

// 获取书籍列表；分类条件必须同时用于列表和总数，保证分页统计一致。
export async function getBookList(page: number = 1, category?: string, query?: string) {
  const pageSize = BOOK_LIST_PAGE_SIZE;
  const skip = (page - 1) * pageSize;
  const where = normalizeCategoryFilter(category);

  if (query) {
    const searchResult = await searchLibraryIds(query, page, pageSize, normalizeSearchCategoryFilter(category));
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
        image: true,
      },
    });
    const byId = new Map(matches.map(book => [book.id, book]));
    return {
      // Prisma 的 IN 查询不保证顺序，按 Manticore 相关度顺序重新排列。
      list: searchResult.ids
        .map(id => byId.get(id))
        .filter((book): book is NonNullable<typeof book> => Boolean(book))
        .map((book, index) => presentBookCategory(book, index)),
      totalPages: Math.ceil(searchResult.total / pageSize),
      currentPage: page,
      totalCount: searchResult.total,
    };
  }

  const featuredWhere = combineWhere(where, { title: { in: [...EXACT_COVER_TITLE_ORDER] } });
  const [featuredMatches, total] = await Promise.all([
    prisma.book.findMany({
      select: {
        id: true,
        title: true,
        author: true,
        category: true,
        description: true,
        summary: true,
        image: true,
      },
      orderBy: { id: 'desc' },
      where: featuredWhere,
    }),
    prisma.book.count({ where }),
  ]);

  const featuredBooks = selectFeaturedBooks(featuredMatches);
  const featuredIds = featuredBooks.map(book => book.id);
  const books: BookListItem[] = featuredBooks.slice(skip, skip + pageSize);

  if (books.length < pageSize) {
    const regularSkip = Math.max(skip - featuredBooks.length, 0);
    const regularWhere = combineWhere(
      where,
      featuredIds.length > 0 ? { id: { notIn: featuredIds } } : {},
    );
    const regularBooks = await prisma.book.findMany({
      select: {
        id: true,
        title: true,
        author: true,
        category: true,
        description: true,
        summary: true,
        image: true,
      },
      where: regularWhere,
      // 非专属封面作品仍按新导入优先，避免新增整本作品沉到两万余条旧数据之后。
      orderBy: { id: 'desc' },
      skip: regularSkip,
      take: pageSize - books.length,
    });
    books.push(...regularBooks);
  }

  const totalPages = Math.ceil(total / pageSize);

  return {
    list: books.map((book, index) => presentBookCategory(book, index)),
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
          annotationsJson: true,
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
    content: normalizeBookText(activeChapter?.originalText || book.originalText || ''),
    chapter: activeChapter ? {
      id: activeChapter.id,
      order: activeChapter.order,
      title: activeChapter.title,
      summary: activeChapter.summary,
    } : null,
    chapters: book.chapters.map(chapter => ({ id: chapter.id, order: chapter.order, title: chapter.title })),
    // 保留数据库里的真实序号；注释可能不是从 1 连续排列，不能再用数组下标猜测序号。
    annotations: activeChapter ? parseChapterAnnotations(activeChapter.annotationsJson) : book.annotations,
    characters: book.characters.length > 0
      ? book.characters
      : (book.mainCharacters || '')
          .split(/[、，,；;\s]+/)
          .map((name, index) => ({ id: -(index + 1), name: name.trim(), description: null }))
          .filter(character => character.name),
  };
}

function parseChapterAnnotations(value: string | null): Array<{ index: number; content: string }> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((annotation): annotation is { index: number; content: string } => (
      annotation !== null
      && typeof annotation === 'object'
      && Number.isInteger((annotation as { index?: unknown }).index)
      && typeof (annotation as { content?: unknown }).content === 'string'
    ));
  } catch {
    return [];
  }
}

// 分类取自数据库实际值，并按产品口径合并为八个固定展示类。
export async function getBookCategories() {
  const groups = await prisma.book.groupBy({
    by: ['category'],
    _count: { _all: true },
  });

  const mergedGroups = new Map<string, { value: string; label: string; count: number }>(
    DISPLAY_CATEGORIES.map(category => [category, { value: category, label: category, count: 0 }]),
  );
  for (const group of groups) {
    const label = categoryLabel(group.category) || NOTE_STYLE_CATEGORY;
    const existing = mergedGroups.get(label);
    if (existing) existing.count += group._count._all;
  }

  return DISPLAY_CATEGORIES.map(category => mergedGroups.get(category)!);
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

// 管理员覆盖文库内容，并把修改前后的完整文本写入审计表。
export async function updateBookContent(
  bookId: number,
  chapterId: number | undefined,
  field: 'original' | 'translation',
  content: string,
  editorId: number,
) {
  const text = content.trim();
  if (!text) throw new Error('内容不能为空');
  return prisma.$transaction(async tx => {
    const book = await tx.book.findUnique({ where: { id: bookId }, select: { originalText: true, translatedText: true, chapters: { select: { id: true, originalText: true, translatedText: true } } } });
    if (!book) return null;
    const chapter = chapterId === undefined ? undefined : book.chapters.find(item => item.id === chapterId);
    if (chapterId !== undefined && !chapter) throw new Error('回目不存在或不属于当前作品');
    const oldContent = chapter ? (field === 'original' ? chapter.originalText : chapter.translatedText) : (field === 'original' ? book.originalText : book.translatedText);
    if (oldContent == null) throw new Error('译文尚未生成，暂不可修改');
    if (chapter) {
      await tx.bookChapter.update({ where: { id: chapter.id }, data: field === 'original' ? { originalText: text } : { translatedText: text } });
    } else {
      await tx.book.update({ where: { id: bookId }, data: field === 'original' ? { originalText: text } : { translatedText: text } });
    }
    await tx.bookContentEdit.create({ data: { bookId, chapterId: chapter?.id, editorId, field, oldContent, newContent: text } });
    return text;
  });
}
