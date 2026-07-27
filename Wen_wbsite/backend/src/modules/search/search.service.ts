import prisma from '../../lib/prisma.js';
import {
  COMMUNITY_INDEX,
  LIBRARY_INDEX,
  bulkInsertSearchDocuments,
  deleteSearchDocument,
  ensureSearchIndexes,
  replaceSearchDocument,
  searchDocumentIds,
  truncateSearchIndex,
} from '../../lib/manticore.js';

const REINDEX_BATCH_SIZE = 300;

export function normalizeSearchQuery(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || undefined;
}

export function isSearchQueryTooLong(query?: string): boolean {
  return Boolean(query && Array.from(query).length > 100);
}

export function searchLibraryIds(query: string, page: number, pageSize: number, category?: string) {
  return searchDocumentIds({
    index: LIBRARY_INDEX,
    query,
    fields: ['title', 'author', 'summary'],
    offset: (page - 1) * pageSize,
    limit: pageSize,
    category,
  });
}

export function searchCommunityIds(query: string, page: number, pageSize: number, category?: string) {
  return searchDocumentIds({
    index: COMMUNITY_INDEX,
    query,
    fields: ['nickname', 'source_title', 'content'],
    offset: (page - 1) * pageSize,
    limit: pageSize,
    category,
  });
}

function libraryDocument(book: {
  title: string;
  author: string;
  summary: string | null;
  category: string | null;
}) {
  return {
    title: book.title,
    author: book.author,
    summary: book.summary || '',
    category: book.category || '__uncategorized__',
  };
}

function communityDocument(creation: {
  category: string;
  content: string;
  publishedAt: Date | null;
  user: { nickname: string | null };
  book: { title: string } | null;
}) {
  return {
    // 按产品约定只索引昵称，不把手机号等私密账号信息写入搜索引擎。
    nickname: creation.user.nickname || '',
    source_title: creation.book?.title || '',
    content: creation.content,
    category: creation.category,
    published_at: Math.floor((creation.publishedAt || new Date()).getTime() / 1000),
  };
}

export async function syncCreationSearchDocument(creationId: number): Promise<void> {
  const creation = await prisma.creation.findUnique({
    where: { id: creationId },
    select: {
      id: true,
      status: true,
      category: true,
      content: true,
      publishedAt: true,
      user: { select: { nickname: true } },
      book: { select: { title: true } },
    },
  });
  if (!creation || creation.status !== 'published') {
    await deleteSearchDocument(COMMUNITY_INDEX, creationId);
    return;
  }
  await replaceSearchDocument(COMMUNITY_INDEX, creation.id, communityDocument(creation));
}

export async function syncUserPublishedCreations(userId: number): Promise<void> {
  const creations = await prisma.creation.findMany({
    where: { userId, status: 'published' },
    select: { id: true },
  });
  await Promise.all(creations.map(creation => syncCreationSearchDocument(creation.id)));
}

export async function rebuildSearchIndexes(onProgress?: (message: string) => void): Promise<void> {
  await ensureSearchIndexes();
  await truncateSearchIndex(LIBRARY_INDEX);
  await truncateSearchIndex(COMMUNITY_INDEX);

  let cursor = 0;
  let indexedBooks = 0;
  while (true) {
    const books = await prisma.book.findMany({
      where: { id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: REINDEX_BATCH_SIZE,
      select: { id: true, title: true, author: true, summary: true, category: true },
    });
    if (books.length === 0) break;
    await bulkInsertSearchDocuments(LIBRARY_INDEX, books.map(book => ({ id: book.id, doc: libraryDocument(book) })));
    cursor = books[books.length - 1].id;
    indexedBooks += books.length;
    onProgress?.(`已索引文库 ${indexedBooks} 部`);
  }

  cursor = 0;
  let indexedCreations = 0;
  while (true) {
    const creations = await prisma.creation.findMany({
      where: { id: { gt: cursor }, status: 'published' },
      orderBy: { id: 'asc' },
      take: REINDEX_BATCH_SIZE,
      select: {
        id: true,
        category: true,
        content: true,
        publishedAt: true,
        user: { select: { nickname: true } },
        book: { select: { title: true } },
      },
    });
    if (creations.length === 0) break;
    await bulkInsertSearchDocuments(COMMUNITY_INDEX, creations.map(creation => ({ id: creation.id, doc: communityDocument(creation) })));
    cursor = creations[creations.length - 1].id;
    indexedCreations += creations.length;
  }
  onProgress?.(`索引重建完成：文库 ${indexedBooks} 部，社区 ${indexedCreations} 篇`);
}
