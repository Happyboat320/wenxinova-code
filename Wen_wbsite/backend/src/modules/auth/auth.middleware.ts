import type { NextFunction, Request, Response } from 'express';
import { error } from '../../lib/response.js';
import { AuthError } from './auth.types.js';
import { verifyAccessToken } from './jwt.service.js';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authorization = req.header('authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json(error('请先登录', 401));
    return;
  }

  try {
    const payload = verifyAccessToken(match[1]);
    req.auth = { userId: Number(payload.sub), tokenId: payload.jti };
    next();
  } catch (caught) {
    const message = caught instanceof AuthError ? caught.message : '登录凭证无效';
    res.status(401).json(error(message, 401));
  }
}

// 公共读取接口可选登录；携带凭证时仍会校验，以便返回用户相关状态。
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authorization = req.header('authorization');
  if (!authorization) {
    next();
    return;
  }
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json(error('登录凭证格式无效', 401));
    return;
  }

  try {
    const payload = verifyAccessToken(match[1]);
    req.auth = { userId: Number(payload.sub), tokenId: payload.jti };
    next();
  } catch (caught) {
    const message = caught instanceof AuthError ? caught.message : '登录凭证无效';
    res.status(401).json(error(message, 401));
  }
}
