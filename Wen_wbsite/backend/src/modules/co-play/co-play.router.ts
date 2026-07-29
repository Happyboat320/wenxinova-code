import { Router, Request, Response } from 'express';
import { success, error } from '../../lib/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { aiUsageGuard } from '../auth/rate-limit.js';
import * as coPlayService from './co-play.service.js';

export const coPlayRouter = Router();

coPlayRouter.get('/favorites', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json(success(await coPlayService.listFavoriteCharacters(req.auth!.userId)));
  } catch (caught) {
    console.error('获取收藏角色失败:', caught);
    res.status(500).json(error('获取收藏角色失败'));
  }
});

coPlayRouter.post('/favorites', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await coPlayService.addFavoriteCharacter(req.auth!.userId, {
      bookId: req.body?.bookId ? Number(req.body.bookId) : undefined,
      chapterId: req.body?.chapterId ? Number(req.body.chapterId) : undefined,
      characterId: req.body?.characterId ? Number(req.body.characterId) : undefined,
      name: req.body?.name,
      description: req.body?.description,
      deeds: req.body?.deeds,
      sourceType: req.body?.sourceType,
      sourceTitle: req.body?.sourceTitle,
      sourceChapterTitle: req.body?.sourceChapterTitle,
    });
    if (result.kind === 'invalid') return res.status(400).json(error('角色名称不能为空', 400));
    if (result.kind === 'missing-book') return res.status(404).json(error('来源作品不存在', 404));
    if (result.kind === 'missing-chapter') return res.status(404).json(error('来源回目不存在', 404));
    if (result.kind === 'missing-character') return res.status(404).json(error('来源角色不存在', 404));
    res.status(result.kind === 'created' ? 201 : 200).json(success(result.favorite, result.kind === 'exists' ? '角色已在收藏夹' : '角色已收藏'));
  } catch (caught) {
    console.error('收藏角色失败:', caught);
    res.status(500).json(error('收藏角色失败'));
  }
});

coPlayRouter.delete('/favorites/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json(error('无效的角色收藏 ID', 400));
    const removed = await coPlayService.removeFavoriteCharacter(req.auth!.userId, id);
    if (!removed) return res.status(404).json(error('收藏角色不存在', 404));
    res.json(success({ removed: true }));
  } catch (caught) {
    console.error('取消收藏角色失败:', caught);
    res.status(500).json(error('取消收藏角色失败'));
  }
});

coPlayRouter.get('/sessions', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json(success(await coPlayService.listSessions(req.auth!.userId)));
  } catch (caught) {
    console.error('获取数字共演会话失败:', caught);
    res.status(500).json(error('获取数字共演会话失败'));
  }
});

coPlayRouter.post('/sessions', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await coPlayService.createSession(req.auth!.userId, {
      title: req.body?.title,
      scene: req.body?.scene,
      favoriteCharacterIds: req.body?.favoriteCharacterIds,
    });
    if (result.kind === 'invalid') return res.status(400).json(error(`请选择 2-${coPlayService.MAX_COPLAY_CHARACTERS} 个收藏角色，并填写场景背景`, 400));
    if (result.kind === 'missing-favorite') return res.status(404).json(error('所选收藏角色不存在', 404));
    res.status(201).json(success(result.session, '会话已创建'));
  } catch (caught) {
    console.error('创建数字共演会话失败:', caught);
    res.status(500).json(error('创建数字共演会话失败'));
  }
});

coPlayRouter.get('/sessions/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json(error('无效的会话 ID', 400));
    const session = await coPlayService.getSession(req.auth!.userId, id);
    if (!session) return res.status(404).json(error('会话不存在', 404));
    res.json(success(session));
  } catch (caught) {
    console.error('获取数字共演会话详情失败:', caught);
    res.status(500).json(error('获取数字共演会话详情失败'));
  }
});

coPlayRouter.post('/sessions/:id/turn', requireAuth, aiUsageGuard, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json(error('无效的会话 ID', 400));
    const result = await coPlayService.advanceTurn(req.auth!.userId, id, req.body?.userMessage);
    if (result.kind === 'missing') return res.status(404).json(error('会话不存在', 404));
    if (result.kind === 'invalid-characters') return res.status(400).json(error('会话角色数量不符合要求', 400));
    res.json(success(result.messages, '本轮发言已生成'));
  } catch (caught) {
    console.error('生成数字共演发言失败:', caught);
    res.status(500).json(error('生成数字共演发言失败'));
  }
});

coPlayRouter.post('/sessions/:id/creation', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json(error('无效的会话 ID', 400));
    const action = req.body?.action === 'publish' ? 'publish' : req.body?.action === 'draft' ? 'draft' : null;
    if (!action) return res.status(400).json(error('无效的保存动作', 400));
    const result = await coPlayService.persistSessionCreation(req.auth!.userId, id, action);
    if (result.kind === 'invalid') return res.status(400).json(error('无效的保存动作', 400));
    if (result.kind === 'missing') return res.status(404).json(error('会话不存在', 404));
    if (result.kind === 'empty') return res.status(400).json(error('至少生成一轮发言后才能保存为作品', 400));
    res.status(action === 'publish' ? 201 : 200).json(success(
      result.creation,
      action === 'publish'
        ? (result.creation.status === 'published' ? '已发布到社区' : '已提交社区审核')
        : '已保存为作品草稿',
    ));
  } catch (caught) {
    console.error('保存数字共演作品失败:', caught);
    res.status(500).json(error('保存数字共演作品失败'));
  }
});

coPlayRouter.delete('/sessions/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json(error('无效的会话 ID', 400));
    const removed = await coPlayService.deleteSession(req.auth!.userId, id);
    if (!removed) return res.status(404).json(error('会话不存在', 404));
    res.json(success({ removed: true }));
  } catch (caught) {
    console.error('删除数字共演会话失败:', caught);
    res.status(500).json(error('删除数字共演会话失败'));
  }
});
