import { Router, Request, Response } from 'express';
import * as communityService from './community.service.js';
import { success, error } from '../../lib/response.js';
import { isCreationCategory } from './community.types.js';
import { optionalAuth, requireAuth } from '../auth/auth.middleware.js';

export const communityRouter = Router();

// 获取社区创作列表
communityRouter.get('/creations', async (req: Request, res: Response) => {
  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const category = req.query.category;
    if (category !== undefined && !isCreationCategory(category)) {
      return res.status(400).json(error('无效的社区分类', 400));
    }
    res.json(success(await communityService.getRecentCreations(page, category)));
  } catch (err: any) {
    console.error('获取社区列表失败:', err);
    res.status(500).json(error('获取社区列表失败'));
  }
});

communityRouter.get('/categories', async (_req: Request, res: Response) => {
  try {
    res.json(success(await communityService.getCreationCategories()));
  } catch (err) {
    console.error('获取社区分类失败:', err);
    res.status(500).json(error('获取社区分类失败'));
  }
});

// 获取创作详情
communityRouter.get('/creations/:id', optionalAuth, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json(error('无效的创作ID'));
    }
    const detail = await communityService.getCreationDetail(id, req.auth?.userId);
    if (!detail) {
      return res.status(404).json(error('创作不存在'));
    }
    res.json(success(detail));
  } catch (err: any) {
    console.error('获取创作详情失败:', err);
    res.status(500).json(error('获取创作详情失败'));
  }
});

// 点赞采用切换语义：再次点击即取消点赞。
communityRouter.post('/creations/:id/like', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json(error('无效的创作ID', 400));
    }
    const result = await communityService.toggleCreationLike(id, req.auth!.userId);
    if (!result) {
      return res.status(404).json(error('创作不存在', 404));
    }
    res.json(success(result, result.liked ? '点赞成功' : '已取消点赞'));
  } catch (err) {
    console.error('更新点赞失败:', err);
    res.status(500).json(error('更新点赞失败'));
  }
});

communityRouter.post('/creations/:id/comments', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json(error('无效的创作ID', 400));
    }
    if (!content) {
      return res.status(400).json(error('评论内容不能为空', 400));
    }
    if (Array.from(content).length > 500) {
      return res.status(400).json(error('评论不能超过 500 个字符', 400));
    }
    const comment = await communityService.addCreationComment(id, req.auth!.userId, content);
    if (!comment) {
      return res.status(404).json(error('创作不存在', 404));
    }
    res.status(201).json(success(comment, '评论发布成功'));
  } catch (err) {
    console.error('发布评论失败:', err);
    res.status(500).json(error('发布评论失败'));
  }
});
