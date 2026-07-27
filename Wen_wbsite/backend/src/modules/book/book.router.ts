import { Router, Request, Response } from 'express';
import * as bookService from './book.service.js';
import { success, error } from '../../lib/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { aiUsageGuard } from '../auth/rate-limit.js';
import { isSearchQueryTooLong, normalizeSearchQuery } from '../search/search.service.js';
import { SearchUnavailableError } from '../../lib/manticore.js';
import * as knowledgeGraphService from './knowledge-graph.service.js';

export const bookRouter = Router();

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
