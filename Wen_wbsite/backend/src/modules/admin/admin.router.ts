import { Router, type Request, type Response } from 'express';
import { error, success } from '../../lib/response.js';
import { requireAdmin } from '../auth/auth.middleware.js';
import * as adminService from './admin.service.js';
import * as knowledgeGraphService from '../book/knowledge-graph.service.js';
import { aiUsageGuard } from '../auth/rate-limit.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    res.json(success(await adminService.getDashboard()));
  } catch (caught) {
    console.error('加载管理审核台失败:', caught);
    res.status(500).json(error('加载管理审核台失败'));
  }
});

function parseReviewBody(req: Request) {
  const decision = req.body?.decision;
  const reviewNote = typeof req.body?.reviewNote === 'string' ? req.body.reviewNote.trim() : '';
  if (decision !== 'approve' && decision !== 'reject') return null;
  if (Array.from(reviewNote).length > 500) return null;
  if (decision === 'reject' && !reviewNote) return null;
  return { decision, reviewNote } as const;
}

adminRouter.post('/creations/:id/review', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const input = parseReviewBody(req);
    if (!Number.isInteger(id) || id <= 0 || !input) {
      return res.status(400).json(error('审核参数无效，驳回时必须填写原因', 400));
    }
    const result = await adminService.reviewCreation(id, req.auth!.userId, input.decision, input.reviewNote);
    if (!result) return res.status(409).json(error('该作品已被其他管理员处理', 409));
    res.json(success(result, input.decision === 'approve' ? '作品已公开' : '作品已驳回'));
  } catch (caught) {
    console.error('审核作品失败:', caught);
    res.status(500).json(error('审核作品失败'));
  }
});

adminRouter.post('/applications/:id/review', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const input = parseReviewBody(req);
    if (!Number.isInteger(id) || id <= 0 || !input) {
      return res.status(400).json(error('审核参数无效，驳回时必须填写原因', 400));
    }
    const result = await adminService.reviewAdminApplication(id, req.auth!.userId, input.decision, input.reviewNote);
    if (!result) return res.status(409).json(error('该申请已被其他管理员处理', 409));
    res.json(success(result, input.decision === 'approve' ? '已授予管理员权限' : '管理员申请已驳回'));
  } catch (caught) {
    console.error('审核管理员申请失败:', caught);
    res.status(500).json(error('审核管理员申请失败'));
  }
});

adminRouter.post('/books/:id/knowledge-graph/regenerate', aiUsageGuard, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json(error('无效的书籍ID', 400));
    const graph = await knowledgeGraphService.generateAndCacheKnowledgeGraph(id, true);
    if (!graph) return res.status(404).json(error('书籍不存在', 404));
    res.json(success(graph, '知识图谱已重新生成'));
  } catch (caught) {
    console.error('重新生成知识图谱失败:', caught);
    res.status(500).json(error(caught instanceof Error ? caught.message : '重新生成知识图谱失败'));
  }
});
