import { Router, Request, Response } from 'express';
import * as userService from './user.service.js';
import { success, error } from '../../lib/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { isCreationCategory } from '../community/community.types.js';
import { isValidNickname, normalizeNickname } from '../auth/auth.service.js';

export const userRouter = Router();

userRouter.patch('/me/profile', requireAuth, async (req: Request, res: Response) => {
  try {
    const nickname = normalizeNickname(typeof req.body?.nickname === 'string' ? req.body.nickname : '');
    const signature = typeof req.body?.signature === 'string' ? req.body.signature.trim() : '';
    const avatar = req.body?.avatar;
    if (!isValidNickname(nickname)) {
      return res.status(400).json(error('用户名需为 2-20 个字符，且不能包含特殊符号', 400));
    }
    if (Array.from(signature).length > 100) {
      return res.status(400).json(error('签名不能超过 100 个字符', 400));
    }
    if (avatar !== undefined && avatar !== null && (
      typeof avatar !== 'string'
      || avatar.length > 350_000
      || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar)
    )) {
      return res.status(400).json(error('头像格式或大小不符合要求', 400));
    }
    const user = await userService.updateProfile(req.auth!.userId, {
      nickname,
      signature,
      ...(avatar === undefined ? {} : { avatar }),
    });
    res.json(success(user, '个人资料已更新'));
  } catch (err) {
    console.error('更新个人资料失败:', err);
    res.status(500).json(error('更新个人资料失败'));
  }
});

// 保存草稿或提交发布；普通用户进入审核队列，管理员作品直接公开。
userRouter.post('/creation', requireAuth, async (req: Request, res: Response) => {
  try {
    const { bookId, category = 'other', prompt, content, action = 'draft', draftId } = req.body;
    if (typeof prompt !== 'string' || !prompt.trim() || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json(error('参数不完整'));
    }
    if (!isCreationCategory(category)) {
      return res.status(400).json(error('无效的创作分类', 400));
    }
    if (action !== 'draft' && action !== 'publish') {
      return res.status(400).json(error('无效的保存方式', 400));
    }
    const creation = await userService.persistCreation({
      userId: req.auth!.userId,
      bookId: bookId ? Number(bookId) : undefined,
      category,
      prompt: prompt.trim(),
      content: content.trim(),
      action,
      draftId: draftId ? Number(draftId) : undefined,
    });
    if (!creation) return res.status(404).json(error('草稿不存在、正在审核或已发布', 404));
    res.json(success(creation));
  } catch (err: any) {
    console.error('保存创作失败:', err);
    res.status(500).json(error('保存创作失败'));
  }
});

userRouter.get('/me/admin-application', requireAuth, async (req: Request, res: Response) => {
  try {
    res.json(success(await userService.getLatestAdminApplication(req.auth!.userId)));
  } catch (err) {
    console.error('获取管理员申请失败:', err);
    res.status(500).json(error('获取管理员申请失败'));
  }
});

userRouter.post('/me/admin-application', requireAuth, async (req: Request, res: Response) => {
  try {
    const remark = typeof req.body?.remark === 'string' ? req.body.remark.trim() : '';
    if (Array.from(remark).length < 5 || Array.from(remark).length > 500) {
      return res.status(400).json(error('申请备注需为 5-500 个字符', 400));
    }
    const result = await userService.applyForAdmin(req.auth!.userId, remark);
    if (result.kind === 'admin') return res.status(409).json(error('您已经是管理员', 409));
    if (result.kind === 'pending') return res.status(409).json(error('已有待审核申请，请勿重复提交', 409));
    if (result.kind === 'missing') return res.status(404).json(error('用户不存在', 404));
    res.status(201).json(success(result.application, '管理员申请已提交'));
  } catch (err) {
    console.error('提交管理员申请失败:', err);
    res.status(500).json(error('提交管理员申请失败'));
  }
});

// 进入创意工坊时恢复该作品、该类型的最新草稿。
userRouter.get('/me/draft', requireAuth, async (req: Request, res: Response) => {
  try {
    const bookId = Number(req.query.bookId);
    const category = req.query.category;
    if (!Number.isInteger(bookId) || bookId <= 0 || !isCreationCategory(category)) {
      return res.status(400).json(error('无效的草稿查询条件', 400));
    }
    res.json(success(await userService.getDraft(req.auth!.userId, bookId, category)));
  } catch (err) {
    console.error('获取草稿失败:', err);
    res.status(500).json(error('获取草稿失败'));
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
