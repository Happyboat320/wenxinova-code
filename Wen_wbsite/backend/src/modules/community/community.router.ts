import { Router, Request, Response } from 'express';
import * as communityService from './community.service.js';
import { success, error } from '../../lib/response.js';
import { isCreationCategory } from './community.types.js';

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
communityRouter.get('/creations/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json(error('无效的创作ID'));
    }
    const detail = await communityService.getCreationDetail(id);
    if (!detail) {
      return res.status(404).json(error('创作不存在'));
    }
    res.json(success(detail));
  } catch (err: any) {
    console.error('获取创作详情失败:', err);
    res.status(500).json(error('获取创作详情失败'));
  }
});
