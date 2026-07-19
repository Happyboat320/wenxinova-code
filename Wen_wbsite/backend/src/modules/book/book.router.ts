import { Router, Request, Response } from 'express';
import * as bookService from './book.service.js';
import { success, error } from '../../lib/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { aiUsageGuard } from '../auth/rate-limit.js';

export const bookRouter = Router();

// 获取书籍列表
bookRouter.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const result = await bookService.getBookList(page);
    res.json(success(result));
  } catch (err) {
    console.error('获取书籍列表失败:', err);
    res.status(500).json(error('获取书籍列表失败'));
  }
});

// 获取书籍内容和注释
bookRouter.get('/:id/content', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json(error('无效的书籍ID', 400));
      return;
    }

    const data = await bookService.getBookContent(id);
    if (!data) {
      res.status(404).json(error('书籍不存在', 404));
      return;
    }

    res.json(success(data));
  } catch (err) {
    console.error('获取书籍内容失败:', err);
    res.status(500).json(error('获取书籍内容失败'));
  }
});

// 获取书籍译文
bookRouter.post('/:id/translation', requireAuth, aiUsageGuard, async (req: Request, res: Response) => {
  const bookId = parseInt(req.params.id);

  try {
    if (isNaN(bookId)) {
      res.status(400).json(error('无效的书籍ID', 400));
      return;
    }

    const translation = await bookService.getTranslation(bookId);
    res.json(success({ translation }));
  } catch (err) {
    console.error('获取书籍译文失败:', err);
    res.status(500).json(error('获取书籍译文失败'));
  }
});
