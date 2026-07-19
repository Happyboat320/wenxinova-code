import { Router, Request, Response } from 'express';
import * as userService from './user.service.js';
import { success, error } from '../../lib/response.js';
import { requireAuth } from '../auth/auth.middleware.js';

export const userRouter = Router();

// 保存创作
userRouter.post('/creation', requireAuth, async (req: Request, res: Response) => {
  try {
    const { bookId, prompt, content } = req.body;
    if (typeof prompt !== 'string' || !prompt.trim() || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json(error('参数不完整'));
    }
    const creation = await userService.saveCreation({
      userId: req.auth!.userId,
      bookId: bookId ? Number(bookId) : undefined,
      prompt: prompt.trim(),
      content: content.trim(),
    });
    res.json(success(creation));
  } catch (err: any) {
    console.error('保存创作失败:', err);
    res.status(500).json(error('保存创作失败'));
  }
});

// 获取当前登录用户的创作历史
userRouter.get('/me/creations', requireAuth, async (req: Request, res: Response) => {
  try {
    const creations = await userService.getUserCreations(req.auth!.userId);
    res.json(success(creations));
  } catch (err: any) {
    console.error('获取创作历史失败:', err);
    res.status(500).json(error('获取创作历史失败'));
  }
});
