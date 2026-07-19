import { Router, Request, Response } from 'express';
import * as adaptService from './adapt.service.js';
import { success, error } from '../../lib/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { aiUsageGuard } from '../auth/rate-limit.js';

export const adaptRouter = Router();

// 书籍改编
adaptRouter.post('/', requireAuth, aiUsageGuard, async (req: Request, res: Response) => {
  try {
    const { translation, prompt, type = 'adapt' } = req.body;

    if (!translation || !prompt) {
      res.status(400).json(error('内容和prompt不能为空', 400));
      return;
    }

    const adaptedContent = await adaptService.adaptBook(translation, type, prompt);
    res.json(success({ adaptedContent }));
  } catch (err) {
    console.error('书籍改编失败:', err);
    res.status(500).json(error('书籍改编失败'));
  }
});
