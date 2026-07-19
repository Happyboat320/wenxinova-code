import { Router, Request, Response } from 'express';
import * as communityService from './community.service.js';
import { success, error } from '../../lib/response.js';

export const communityRouter = Router();

// 获取社区创作列表
communityRouter.get('/creations', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const list = await communityService.getRecentCreations(limit);
    res.json(success(list));
  } catch (err: any) {
    console.error('获取社区列表失败:', err);
    res.status(500).json(error('获取社区列表失败'));
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
