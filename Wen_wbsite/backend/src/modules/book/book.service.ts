import prisma from '../../lib/prisma.js';
import * as deepseek from '../../lib/deepseek.js';

// 获取书籍列表
export async function getBookList(page: number = 1) {
  const pageSize = 9;
  const skip = (page - 1) * pageSize;

  const [books, total] = await Promise.all([
    prisma.book.findMany({
      select: {
        id: true,
        title: true,
        author: true,
        description: true,
        summary: true,
      },
      orderBy: { id: 'asc' },
      skip,
      take: pageSize,
    }),
    prisma.book.count(),
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
