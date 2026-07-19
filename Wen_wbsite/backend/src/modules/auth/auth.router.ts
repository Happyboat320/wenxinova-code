import { Router, type Request, type Response } from 'express';
import { error, success } from '../../lib/response.js';
import { requireAuth } from './auth.middleware.js';
import * as authService from './auth.service.js';
import { AuthError } from './auth.types.js';
import { consumeLimit } from './rate-limit.js';

export const authRouter = Router();
const REFRESH_COOKIE = 'wenxin_refresh';

function getCookie(req: Request, name: string): string | undefined {
  const item = req.headers.cookie
    ?.split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(`${name}=`));
  if (!item) return undefined;
  try {
    return decodeURIComponent(item.slice(name.length + 1));
  } catch {
    return undefined;
  }
}

function cookieOptions(maxAge?: number) {
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;
  return {
    httpOnly: true,
    secure: process.env.AUTH_COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    path: '/api/auth',
    domain,
    ...(maxAge === undefined ? {} : { maxAge }),
  };
}

function setRefreshCookie(res: Response, token: string, expiresIn: number): void {
  res.cookie(REFRESH_COOKIE, token, cookieOptions(expiresIn * 1000));
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
}

function metadata(req: Request) {
  return { ipAddress: req.ip, userAgent: req.get('user-agent') };
}

function sendAuthError(res: Response, caught: unknown, fallback: string): void {
  if (caught instanceof AuthError) {
    res.status(caught.status).json(error(caught.message, caught.status));
    return;
  }
  console.error(`${fallback}（详细错误已隐藏）`);
  res.status(500).json(error(fallback, 500));
}

authRouter.post('/sms/send', async (req, res) => {
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  if (!authService.PHONE_PATTERN.test(phone)) {
    res.status(400).json(error('请输入正确的中国大陆手机号', 400));
    return;
  }
  try {
    consumeLimit(`sms:phone:minute:${phone}`, 1, 60_000);
    consumeLimit(`sms:phone:hour:${phone}`, 5, 3_600_000);
    consumeLimit(`sms:phone:day:${phone}`, 15, 86_400_000);
    consumeLimit(`sms:ip:hour:${req.ip}`, 20, 3_600_000);
    consumeLimit(`sms:ip:day:${req.ip}`, 60, 86_400_000);
    await authService.sendSms(phone);
    console.info(`验证码已发送: ${phone.slice(0, 3)}****${phone.slice(-4)}`);
    res.json(success({ retryAfter: 60 }, '验证码已发送'));
  } catch (caught) {
    const retryAfter = (caught as { retryAfter?: number }).retryAfter;
    if (retryAfter) {
      res.setHeader('Retry-After', retryAfter);
      res.status(429).json(error('发送过于频繁，请稍后重试', 429));
      return;
    }
    sendAuthError(res, caught, '验证码发送失败');
  }
});

authRouter.post('/sms/verify', async (req, res) => {
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!authService.PHONE_PATTERN.test(phone) || !authService.CODE_PATTERN.test(code)) {
    res.status(400).json(error('手机号或验证码格式不正确', 400));
    return;
  }
  try {
    consumeLimit(`verify:phone:${phone}`, 8, 10 * 60_000);
    consumeLimit(`verify:ip:${req.ip}`, 30, 10 * 60_000);
    const result = await authService.verifySmsAndLogin(phone, code, metadata(req));
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresIn);
    res.json(success({ accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user }, '登录成功'));
  } catch (caught) {
    const retryAfter = (caught as { retryAfter?: number }).retryAfter;
    if (retryAfter) {
      res.setHeader('Retry-After', retryAfter);
      res.status(429).json(error('验证码尝试过于频繁，请稍后再试', 429));
      return;
    }
    sendAuthError(res, caught, '登录失败');
  }
});

authRouter.post('/refresh', async (req, res) => {
  const refreshToken = getCookie(req, REFRESH_COOKIE);
  if (!refreshToken) {
    clearRefreshCookie(res);
    res.status(401).json(error('未找到登录会话', 401));
    return;
  }
  try {
    const result = await authService.refreshSession(refreshToken, metadata(req));
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresIn);
    res.json(success({ accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user }, '登录状态已刷新'));
  } catch (caught) {
    clearRefreshCookie(res);
    sendAuthError(res, caught, '刷新登录状态失败');
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  try {
    res.json(success(await authService.getCurrentUser(req.auth!.userId)));
  } catch (caught) {
    sendAuthError(res, caught, '获取用户信息失败');
  }
});

authRouter.post('/logout', async (req, res) => {
  await authService.logoutSession(getCookie(req, REFRESH_COOKIE));
  clearRefreshCookie(res);
  res.json(success(null, '已退出登录'));
});

authRouter.post('/logout-all', requireAuth, async (req, res) => {
  await authService.logoutAll(req.auth!.userId);
  clearRefreshCookie(res);
  res.json(success(null, '已退出所有设备'));
});

