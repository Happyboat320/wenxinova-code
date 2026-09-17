import prisma from '../../lib/prisma.js';
import { generateCoPlayTurn, generateFavoriteCharacterReply, generateJinlingParticipationOptions } from '../../lib/deepseek.js';
import { ensureSearchIndexes } from '../../lib/manticore.js';
import { syncCreationSearchDocument } from '../search/search.service.js';

export const MAX_COPLAY_CHARACTERS = 10;

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeOptional(value: unknown, max: number): string | null {
  const text = cleanText(value, max);
  return text || null;
}

function runSearchSync(task: () => Promise<void>, label: string) {
  if (process.env.NODE_ENV === 'test') return;
  // 社区检索索引是可重建的派生数据，不能影响数字共演作品保存结果。
  void ensureSearchIndexes()
    .then(task)
    .catch(error => console.error(`${label}，可运行 npm run search:reindex 修复：`, error));
}

function formatCoPlayContent(session: NonNullable<Awaited<ReturnType<typeof getSession>>>): string {
  const characterLines = session.characters.map(character => [
    `### ${character.position}. ${character.name}`,
    character.sourceTitle ? `来源：${character.sourceTitle}` : null,
    character.description ? `简介：${character.description}` : null,
    character.deeds ? `主要事迹：${character.deeds}` : null,
  ].filter(Boolean).join('\n')).join('\n\n');

  const dialogueLines = session.messages.map(message => {
    const speaker = message.role === 'user' ? '用户引导' : message.characterName || '角色';
    return `**${speaker}**：${message.content.replace(/\r\n/g, '\n').trim()}`;
  }).join('\n\n');

  return [
    `# ${session.title}`,
    '## 共演场景',
    session.scene,
    '## 登场角色',
    characterLines,
    '## 共演正文',
    dialogueLines,
  ].filter(Boolean).join('\n\n');
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

export async function updateFavoriteCharacter(userId: number, id: number, input: {
  description?: unknown;
  deeds?: unknown;
}) {
  const existing = await prisma.favoriteCharacter.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) return { kind: 'missing' as const };

  const description = normalizeOptional(input.description, 240);
  const deeds = normalizeOptional(input.deeds, 4000);
  const favorite = await prisma.favoriteCharacter.update({
    where: { id },
    data: {
      description,
      deeds,
    },
  });
  return { kind: 'updated' as const, favorite };
}

export async function chatWithFavoriteCharacter(userId: number, id: number, input: {
  message?: unknown;
  history?: unknown;
}) {
  const message = cleanText(input.message, 1000);
  if (!message) return { kind: 'invalid' as const };

  const favorite = await prisma.favoriteCharacter.findFirst({ where: { id, userId } });
  if (!favorite) return { kind: 'missing' as const };

  const history = Array.isArray(input.history)
    ? input.history.slice(-20).map(item => ({
        role: item?.role === 'user' ? 'user' : 'character',
        characterName: favorite.name,
        content: cleanText(item?.content, 1200),
      })).filter(item => item.content)
    : [];

  const content = await generateFavoriteCharacterReply({
    name: favorite.name,
    description: favorite.description,
    deeds: favorite.deeds,
    sourceTitle: favorite.sourceChapterTitle
      ? `${favorite.sourceTitle || '未知文本'} · ${favorite.sourceChapterTitle}`
      : favorite.sourceTitle,
  }, history, message);

  return {
    kind: 'created' as const,
    message: {
      role: 'character' as const,
      characterName: favorite.name,
      content,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function createJinlingParticipationOptions(userId: number, input: {
  favoriteCharacterId?: unknown;
  scene?: unknown;
  context?: unknown;
}) {
  const favoriteCharacterId = Number(input.favoriteCharacterId);
  if (!Number.isInteger(favoriteCharacterId) || favoriteCharacterId <= 0) return { kind: 'invalid' as const };

  const favorite = await prisma.favoriteCharacter.findFirst({ where: { id: favoriteCharacterId, userId } });
  if (!favorite) return { kind: 'missing' as const };

  const context = Array.isArray(input.context)
    ? input.context.slice(-8).map(item => ({
        role: item?.role === 'character' ? 'character' : 'system',
        characterName: cleanText(item?.characterName, 40) || null,
        content: cleanText(item?.content, 500),
      })).filter(item => item.content)
    : [];

  const participant = {
    name: favorite.name,
    // 参与发言只需人物核心设定；限制提示词长度可显著减少生成等待。
    description: cleanText(favorite.description, 300) || null,
    deeds: cleanText(favorite.deeds, 600) || null,
    sourceTitle: cleanText(favorite.sourceChapterTitle
      ? `${favorite.sourceTitle || '未知文本'} · ${favorite.sourceChapterTitle}`
      : favorite.sourceTitle, 120) || null,
  };
  // 保持原“梦断金陵”调用签名不变，其他经典剧情按各自场景生成参与回应。
  const options = input.scene === 'sangu'
    ? await generateJinlingParticipationOptions(participant, context, 'sangu')
    : input.scene === 'water-margin'
      ? await generateJinlingParticipationOptions(participant, context, 'water-margin')
      : input.scene === 'journey'
        ? await generateJinlingParticipationOptions(participant, context, 'journey')
      : await generateJinlingParticipationOptions(participant, context);

  return {
    kind: 'created' as const,
    data: {
      character: {
        id: favorite.id,
        name: favorite.name,
      },
      options,
    },
  };
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

export async function persistSessionCreation(userId: number, sessionId: number, action: 'draft' | 'publish') {
  if (action !== 'draft' && action !== 'publish') return { kind: 'invalid' as const };
  const [author, session] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    getSession(userId, sessionId),
  ]);
  if (!author || !session) return { kind: 'missing' as const };
  if (session.messages.length === 0) return { kind: 'empty' as const };

  const publishingStatus = author.role === 'admin' ? 'published' : 'pending';
  const nextStatus = action === 'publish' ? publishingStatus : 'draft';
  const now = new Date();
  const content = formatCoPlayContent(session);
  const prompt = `数字共演：${session.title}`;

  const draft = await prisma.creation.findFirst({
    where: {
      userId,
      coPlaySessionId: sessionId,
      category: 'coplay',
      status: { in: ['draft', 'rejected'] },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const creation = draft
    ? await prisma.creation.update({
        where: { id: draft.id },
        data: {
          prompt,
          content,
          category: 'coplay',
          coPlaySessionId: sessionId,
          status: nextStatus,
          submittedAt: action === 'publish' ? now : null,
          publishedAt: action === 'publish' && publishingStatus === 'published' ? now : null,
          reviewedAt: null,
          reviewedById: null,
          reviewNote: null,
        },
      })
    : await prisma.creation.create({
        data: {
          userId,
          category: 'coplay',
          coPlaySessionId: sessionId,
          prompt,
          content,
          status: nextStatus,
          submittedAt: action === 'publish' ? now : null,
          publishedAt: action === 'publish' && publishingStatus === 'published' ? now : null,
        },
      });

  runSearchSync(() => syncCreationSearchDocument(creation.id), '数字共演作品已保存，但社区检索索引同步失败');
  return { kind: 'saved' as const, creation };
}
