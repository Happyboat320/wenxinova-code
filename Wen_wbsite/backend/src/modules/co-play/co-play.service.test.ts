import { beforeEach, describe, expect, it, vi } from 'vitest';

const favoriteCharacterMock = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
}));
const bookMock = vi.hoisted(() => ({ findUnique: vi.fn() }));
const bookChapterMock = vi.hoisted(() => ({ findFirst: vi.fn() }));
const characterMock = vi.hoisted(() => ({ findFirst: vi.fn() }));
const userMock = vi.hoisted(() => ({ findUnique: vi.fn() }));
const creationMock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));
const coPlaySessionMock = vi.hoisted(() => ({
  create: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
const coPlayMessageMock = vi.hoisted(() => ({ create: vi.fn() }));
const transactionMock = vi.hoisted(() => vi.fn());

vi.mock('../../lib/prisma.js', () => ({
  default: {
    user: userMock,
    creation: creationMock,
    favoriteCharacter: favoriteCharacterMock,
    book: bookMock,
    bookChapter: bookChapterMock,
    character: characterMock,
    coPlaySession: coPlaySessionMock,
    coPlayMessage: coPlayMessageMock,
    $transaction: transactionMock,
  },
}));

vi.mock('../../lib/deepseek.js', () => ({
  generateCoPlayTurn: vi.fn(),
}));

vi.mock('../../lib/manticore.js', () => ({
  ensureSearchIndexes: vi.fn(),
}));

vi.mock('../search/search.service.js', () => ({
  syncCreationSearchDocument: vi.fn(),
}));

import { addFavoriteCharacter, createSession, MAX_COPLAY_CHARACTERS, persistSessionCreation } from './co-play.service.js';

describe('数字共演角色收藏', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bookMock.findUnique.mockResolvedValue({ title: '任氏传' });
    bookChapterMock.findFirst.mockResolvedValue(null);
    characterMock.findFirst.mockResolvedValue(null);
    favoriteCharacterMock.findFirst.mockResolvedValue(null);
  });

  it('收藏 AI 分析角色时保存主要事迹', async () => {
    favoriteCharacterMock.create.mockResolvedValue({ id: 3, name: '任氏', deeds: '舍身救人' });
    const result = await addFavoriteCharacter(2, {
      bookId: 1,
      name: '任氏',
      description: '狐女，重情守义',
      deeds: '舍身救人',
      sourceType: 'ai',
    });
    expect(result.kind).toBe('created');
    expect(favoriteCharacterMock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 2, name: '任氏', deeds: '舍身救人', sourceTitle: '任氏传' }),
    }));
  });

  it('重复收藏时返回已有记录', async () => {
    favoriteCharacterMock.findFirst.mockResolvedValue({ id: 8, name: '任氏' });
    const result = await addFavoriteCharacter(2, { bookId: 1, name: '任氏', sourceType: 'ai' });
    expect(result.kind).toBe('exists');
    expect(favoriteCharacterMock.create).not.toHaveBeenCalled();
  });
});

describe('数字共演作品保存', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userMock.findUnique.mockResolvedValue({ role: 'user' });
    creationMock.findFirst.mockResolvedValue(null);
  });

  it('从会话消息生成社区草稿内容', async () => {
    coPlaySessionMock.findFirst.mockResolvedValue({
      id: 9,
      userId: 1,
      title: '兰亭共演',
      scene: '兰亭夜话',
      characters: [
        { position: 1, name: '任氏', sourceTitle: '任氏传', description: '重情守义', deeds: '舍身救人' },
        { position: 2, name: '柳毅', sourceTitle: '柳毅传', description: '慷慨赴义', deeds: '传书救人' },
      ],
      messages: [
        { role: 'character', characterName: '任氏', content: '风露虽冷，情义不可负。' },
        { role: 'user', characterName: null, content: '请谈谈各自的选择。' },
      ],
    });
    creationMock.create.mockResolvedValue({ id: 12, status: 'draft' });

    const result = await persistSessionCreation(1, 9, 'draft');

    expect(result.kind).toBe('saved');
    expect(creationMock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        category: 'coplay',
        coPlaySessionId: 9,
        prompt: '数字共演：兰亭共演',
        status: 'draft',
        content: expect.stringContaining('## 共演正文'),
      }),
    }));
  });

  it('普通用户发布时进入待审核，不覆盖已发布作品', async () => {
    coPlaySessionMock.findFirst.mockResolvedValue({
      id: 9,
      userId: 1,
      title: '兰亭共演',
      scene: '兰亭夜话',
      characters: [{ position: 1, name: '任氏', sourceTitle: null, description: null, deeds: null }],
      messages: [{ role: 'character', characterName: '任氏', content: '愿一陈本心。' }],
    });
    creationMock.findFirst.mockResolvedValue(null);
    creationMock.create.mockResolvedValue({ id: 13, status: 'pending' });

    await persistSessionCreation(1, 9, 'publish');

    expect(creationMock.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ['draft', 'rejected'] } }),
    }));
    expect(creationMock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'pending', submittedAt: expect.any(Date), publishedAt: null }),
    }));
  });

  it('没有发言时拒绝保存', async () => {
    coPlaySessionMock.findFirst.mockResolvedValue({
      id: 9,
      userId: 1,
      title: '空会话',
      scene: '兰亭夜话',
      characters: [],
      messages: [],
    });

    const result = await persistSessionCreation(1, 9, 'draft');

    expect(result.kind).toBe('empty');
    expect(creationMock.create).not.toHaveBeenCalled();
  });
});

describe('数字共演会话', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('限制最多选择 10 个角色', async () => {
    const result = await createSession(1, {
      scene: '曲水流觞',
      favoriteCharacterIds: Array.from({ length: MAX_COPLAY_CHARACTERS + 1 }, (_, index) => index + 1),
    });
    expect(result.kind).toBe('invalid');
  });

  it('按用户选择顺序创建角色快照', async () => {
    favoriteCharacterMock.findMany.mockResolvedValue([
      { id: 2, name: '乙', description: null, deeds: null, sourceTitle: '书乙', sourceChapterTitle: null },
      { id: 1, name: '甲', description: null, deeds: null, sourceTitle: '书甲', sourceChapterTitle: null },
    ]);
    coPlaySessionMock.create.mockResolvedValue({ id: 5, characters: [], messages: [] });

    await createSession(7, { scene: '夜宴', favoriteCharacterIds: [1, 2] });

    expect(coPlaySessionMock.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        characters: {
          create: [
            expect.objectContaining({ favoriteCharacterId: 1, position: 1, name: '甲' }),
            expect.objectContaining({ favoriteCharacterId: 2, position: 2, name: '乙' }),
          ],
        },
      }),
    }));
  });
});
