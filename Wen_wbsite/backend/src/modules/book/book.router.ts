import { Router, Request, Response } from 'express';
import * as bookService from './book.service.js';
import { success, error } from '../../lib/response.js';
import { requireAuth, requireAdmin } from '../auth/auth.middleware.js';
import { aiUsageGuard } from '../auth/rate-limit.js';
import { isSearchQueryTooLong, normalizeSearchQuery } from '../search/search.service.js';
import { SearchUnavailableError } from '../../lib/manticore.js';
import * as knowledgeGraphService from './knowledge-graph.service.js';

export const bookRouter = Router();

// 兼容前端代理未区分管理路由的情况：管理员也可通过书籍路径保存内容。
bookRouter.patch('/:id/content', requireAdmin, async (req: Request, res: Response) => {
  try {
    const bookId = Number(req.params.id);
    const chapterId = req.body?.chapterId === undefined ? undefined : Number(req.body.chapterId);
    const field = req.body?.field;
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    if (!Number.isInteger(bookId) || bookId <= 0 || (chapterId !== undefined && (!Number.isInteger(chapterId) || chapterId <= 0)) || (field !== 'original' && field !== 'translation')) return res.status(400).json(error('修改参数无效', 400));
    const updated = await bookService.updateBookContent(bookId, chapterId, field, content, req.auth!.userId);
    if (updated === null) return res.status(404).json(error('书籍不存在', 404));
    res.json(success({ content: updated }, '内容已保存'));
  } catch (caught) { res.status(400).json(error(caught instanceof Error ? caught.message : '保存内容失败', 400)); }
});

// 获取书籍列表
bookRouter.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : undefined;
    const query = normalizeSearchQuery(req.query.q);
    if (isSearchQueryTooLong(query)) {
      return res.status(400).json(error('检索关键词不能超过 100 个字符', 400));
    }
    const result = await bookService.getBookList(page, category || undefined, query);
    res.json(success(result));
  } catch (err) {
    console.error('获取书籍列表失败:', err);
    if (err instanceof SearchUnavailableError) {
      return res.status(503).json(error('检索服务暂时不可用，请稍后重试', 503));
    }
    res.status(500).json(error('获取书籍列表失败'));
  }
});

// 分类路由需放在 /:id 之前，避免 categories 被当作书籍 ID。
bookRouter.get('/categories', async (_req: Request, res: Response) => {
  try {
    res.json(success(await bookService.getBookCategories()));
  } catch (err) {
    console.error('获取书籍分类失败:', err);
    res.status(500).json(error('获取书籍分类失败'));
  }
});

// 已生成的知识图谱公开读取；首次生成需登录并受 AI 调用限流保护。
bookRouter.get('/:id/knowledge-graph', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json(error('无效的书籍ID', 400));
    res.json(success(await knowledgeGraphService.getKnowledgeGraph(id)));
  } catch (caught) {
    console.error('获取知识图谱失败:', caught);
    res.status(500).json(error('获取知识图谱失败'));
  }
});

bookRouter.post('/:id/knowledge-graph', requireAuth, aiUsageGuard, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json(error('无效的书籍ID', 400));
    const graph = await knowledgeGraphService.generateAndCacheKnowledgeGraph(id);
    if (!graph) return res.status(404).json(error('书籍不存在', 404));
    res.json(success(graph, '知识图谱已生成'));
  } catch (caught) {
    console.error('生成知识图谱失败:', caught);
    res.status(500).json(error(caught instanceof Error ? caught.message : '生成知识图谱失败'));
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

    const rawChapterId = req.query.chapterId;
    const chapterId = typeof rawChapterId === 'string' && rawChapterId !== '' ? Number(rawChapterId) : undefined;
    if (chapterId !== undefined && (!Number.isInteger(chapterId) || chapterId <= 0)) {
      res.status(400).json(error('无效的回目ID', 400));
      return;
    }

    const data = await bookService.getBookContent(id, chapterId);
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

// 流式获取书籍译文，关闭 Nginx 缓冲后浏览器可实时看到新增文本。
bookRouter.post('/:id/translation/stream', requireAuth, aiUsageGuard, async (req: Request, res: Response) => {
  const bookId = Number(req.params.id);
  const chapterId = req.body?.chapterId === undefined ? undefined : Number(req.body.chapterId);
  if (!Number.isInteger(bookId) || bookId <= 0 || (chapterId !== undefined && (!Number.isInteger(chapterId) || chapterId <= 0))) {
    res.status(400).json(error('无效的书籍或回目ID', 400));
    return;
  }

  const controller = new AbortController();
  res.once('close', () => { if (!res.writableEnded) controller.abort(); });
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (event: string, data: unknown) => {
    if (!res.writableEnded && !res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await bookService.streamTranslation(bookId, content => send('delta', { content }), chapterId, controller.signal);
    send('done', {});
  } catch (caught) {
    if (!controller.signal.aborted) {
      console.error('流式获取书籍译文失败:', caught);
      send('error', { message: caught instanceof Error ? caught.message : '获取书籍译文失败' });
    }
  } finally {
    if (!res.writableEnded && !res.destroyed) res.end();
  }
});

// 保留普通译文接口，兼容尚未升级的客户端。
bookRouter.post('/:id/translation', requireAuth, aiUsageGuard, async (req: Request, res: Response) => {
  const bookId = parseInt(req.params.id);

  try {
    if (isNaN(bookId)) {
      res.status(400).json(error('无效的书籍ID', 400));
      return;
    }

    const chapterId = req.body?.chapterId === undefined ? undefined : Number(req.body.chapterId);
    if (chapterId !== undefined && (!Number.isInteger(chapterId) || chapterId <= 0)) {
      res.status(400).json(error('无效的回目ID', 400));
      return;
    }
    const translation = await bookService.getTranslation(bookId, chapterId);
    res.json(success({ translation }));
  } catch (err) {
    console.error('获取书籍译文失败:', err);
    res.status(500).json(error('获取书籍译文失败'));
  }
});
