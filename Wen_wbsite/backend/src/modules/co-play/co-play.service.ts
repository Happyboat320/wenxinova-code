import prisma from '../../lib/prisma.js';
import { generateCoPlayTurn } from '../../lib/deepseek.js';

export const MAX_COPLAY_CHARACTERS = 10;

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeOptional(value: unknown, max: number): string | null {
  const text = cleanText(value, max);
  return text || null;
}

export async function listFavoriteCharacters(userId: number) {
  return prisma.favoriteCharacter.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function addFavoriteCharacter(userId: number, input: {
  bookId?: number;
  chapterId?: number;
  characterId?: number;
  name: unknown;
  description?: unknown;
  deeds?: unknown;
  sourceType?: unknown;
  sourceTitle?: unknown;
  sourceChapterTitle?: unknown;
}) {
  const name = cleanText(input.name, 40);
  if (!name) return { kind: 'invalid' as const };
  const bookId = Number.isInteger(input.bookId) && input.bookId! > 0 ? input.bookId : undefined;
  const chapterId = Number.isInteger(input.chapterId) && input.chapterId! > 0 ? input.chapterId : undefined;
  const characterId = Number.isInteger(input.characterId) && input.characterId! > 0 ? input.characterId : undefined;
  const book = bookId ? await prisma.book.findUnique({ where: { id: bookId }, select: { title: true } }) : null;
  if (bookId && !book) return { kind: 'missing-book' as const };
  const chapter = chapterId ? await prisma.bookChapter.findFirst({
    where: { id: chapterId, ...(bookId ? { bookId } : {}) },
    select: { title: true },
  }) : null;
  if (chapterId && !chapter) return { kind: 'missing-chapter' as const };
  const character = characterId ? await prisma.character.findFirst({
    where: { id: characterId, ...(bookId ? { bookId } : {}) },
    select: { description: true },
  }) : null;
  if (characterId && !character) return { kind: 'missing-character' as const };

  const sourceType = cleanText(input.sourceType, 20) || (characterId ? 'database' : 'ai');
  const sourceTitle = normalizeOptional(input.sourceTitle, 80) || book?.title || null;
  const sourceChapterTitle = normalizeOptional(input.sourceChapterTitle, 100) || chapter?.title || null;
  const description = normalizeOptional(input.description, 240) || character?.description || null;
  const deeds = normalizeOptional(input.deeds, 1000);

  const existing = await prisma.favoriteCharacter.findFirst({
    where: {
      userId,
      name,
      sourceType,
      bookId: bookId ?? null,
      chapterId: chapterId ?? null,
      characterId: characterId ?? null,
    },
  });
  if (existing) return { kind: 'exists' as const, favorite: existing };

  const favorite = await prisma.favoriteCharacter.create({
    data: {
      userId,
      bookId,
      chapterId,
      characterId,
      name,
      description,
      deeds,
      sourceType,
      sourceTitle,
      sourceChapterTitle,
    },
  });
  return { kind: 'created' as const, favorite };
}

export async function removeFavoriteCharacter(userId: number, id: number): Promise<boolean> {
  const existing = await prisma.favoriteCharacter.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) return false;
  await prisma.favoriteCharacter.delete({ where: { id } });
  return true;
}

export async function listSessions(userId: number) {
  return prisma.coPlaySession.findMany({
    where: { userId },
    include: {
      characters: { orderBy: { position: 'asc' } },
      messages: { orderBy: { order: 'desc' }, take: 1 },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getSession(userId: number, id: number) {
  return prisma.coPlaySession.findFirst({
    where: { id, userId },
    include: {
      characters: { orderBy: { position: 'asc' } },
      messages: { orderBy: { order: 'asc' } },
    },
  });
}

export async function createSession(userId: number, input: {
  title?: unknown;
  scene: unknown;
  favoriteCharacterIds: unknown;
}) {
  const scene = cleanText(input.scene, 2000);
  const ids = Array.isArray(input.favoriteCharacterIds)
    ? input.favoriteCharacterIds.map(Number).filter(id => Number.isInteger(id) && id > 0)
    : [];
  const uniqueIds = Array.from(new Set(ids));
  if (!scene || uniqueIds.length < 2 || uniqueIds.length > MAX_COPLAY_CHARACTERS || uniqueIds.length !== ids.length) {
    return { kind: 'invalid' as const };
  }

  const favorites = await prisma.favoriteCharacter.findMany({
    where: { userId, id: { in: uniqueIds } },
  });
  if (favorites.length !== uniqueIds.length) return { kind: 'missing-favorite' as const };
  const byId = new Map(favorites.map(character => [character.id, character]));
  const orderedFavorites = uniqueIds.map(id => byId.get(id)!);
  const fallbackTitle = orderedFavorites.slice(0, 3).map(character => character.name).join('、');
  const title = cleanText(input.title, 80) || `${fallbackTitle} 共演`;

  const session = await prisma.coPlaySession.create({
    data: {
      userId,
      title,
      scene,
      characters: {
        create: orderedFavorites.map((character, index) => ({
          favoriteCharacterId: character.id,
          position: index + 1,
          name: character.name,
          description: character.description,
          deeds: character.deeds,
          sourceTitle: character.sourceChapterTitle
            ? `${character.sourceTitle || '未知作品'} · ${character.sourceChapterTitle}`
            : character.sourceTitle,
        })),
      },
    },
    include: {
      characters: { orderBy: { position: 'asc' } },
      messages: { orderBy: { order: 'asc' } },
    },
  });
  return { kind: 'created' as const, session };
}

export async function advanceTurn(userId: number, sessionId: number, userMessage?: unknown) {
  const session = await getSession(userId, sessionId);
  if (!session) return { kind: 'missing' as const };
  if (session.characters.length < 2 || session.characters.length > MAX_COPLAY_CHARACTERS) {
    return { kind: 'invalid-characters' as const };
  }

  const inputMessage = normalizeOptional(userMessage, 1000);
  const historyForAi = [
    ...session.messages.slice(-30).map(message => ({
      role: message.role,
      characterName: message.characterName,
      content: message.content,
    })),
    ...(inputMessage ? [{ role: 'user', characterName: null, content: inputMessage }] : []),
  ];
  const aiMessages = await generateCoPlayTurn(
    session.scene,
    session.characters.map(character => ({
      name: character.name,
      description: character.description,
      deeds: character.deeds,
      sourceTitle: character.sourceTitle,
    })),
    historyForAi,
  );

  const lastOrder = session.messages.at(-1)?.order ?? 0;
  let nextOrder = lastOrder + 1;
  const created = await prisma.$transaction(async tx => {
    const records = [];
    if (inputMessage) {
      records.push(await tx.coPlayMessage.create({
        data: { sessionId, role: 'user', content: inputMessage, order: nextOrder++ },
      }));
    }
    for (const message of aiMessages) {
      records.push(await tx.coPlayMessage.create({
        data: {
          sessionId,
          role: 'character',
          characterName: message.characterName,
          content: message.content,
          order: nextOrder++,
        },
      }));
    }
    await tx.coPlaySession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } });
    return records;
  });
  return { kind: 'created' as const, messages: created };
}

export async function deleteSession(userId: number, id: number): Promise<boolean> {
  const existing = await prisma.coPlaySession.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) return false;
  await prisma.coPlaySession.delete({ where: { id } });
  return true;
}
