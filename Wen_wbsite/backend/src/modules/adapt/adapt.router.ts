import { Router, Request, Response } from 'express';
import * as adaptService from './adapt.service.js';
import { success, error } from '../../lib/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { aiUsageGuard } from '../auth/rate-limit.js';

export const adaptRouter = Router();

adaptRouter.post('/stream', requireAuth, aiUsageGuard, async (req: Request, res: Response) => {
  const { translation, prompt, type = 'adapt' } = req.body;
  if (typeof translation !== 'string' || !translation.trim() || typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400).json(error('内容和prompt不能为空', 400));
    return;
  }

  const controller = new AbortController();
  res.once('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };
  try {
    await adaptService.adaptBookStream(
      translation,
      type,
      prompt,
      content => send('delta', { content }),
      controller.signal,
    );
    send('done', {});
  } catch (caught) {
    if (!controller.signal.aborted) {
      console.error('流式书籍改编失败:', caught);
      send('error', { message: caught instanceof Error ? caught.message : '书籍改编失败' });
    }
  } finally {
    if (!res.writableEnded && !res.destroyed) res.end();
  }
});

adaptRouter.post('/characters', requireAuth, aiUsageGuard, async (req: Request, res: Response) => {
  try {
    const originalText = typeof req.body?.originalText === 'string' ? req.body.originalText.trim() : '';
    if (!originalText) {
      res.status(400).json(error('原文不能为空', 400));
      return;
    }
    const characters = await adaptService.analyzeCharacters(originalText);
    res.json(success({ characters }));
  } catch (err) {
    console.error('角色分析失败:', err);
    res.status(500).json(error('角色分析失败'));
  }
});

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
