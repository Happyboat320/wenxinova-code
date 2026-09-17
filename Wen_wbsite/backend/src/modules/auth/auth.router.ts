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
  const retryAfter = Number((caught as { retryAfter?: number }).retryAfter || 0);
  if (retryAfter > 0) {
    res.setHeader('Retry-After', retryAfter);
    res.status(429).json(error('尝试次数过多，请稍后再试', 429));
    return;
  }
  console.error(`${fallback}（详细错误已隐藏）`);
  res.status(500).json(error(fallback, 500));
}

function readCredentials(req: Request) {
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!authService.PHONE_PATTERN.test(phone)) {
    throw new AuthError('请输入正确的中国大陆手机号', 400, 'INVALID_PHONE');
  }
  if (!authService.isValidPassword(password)) {
    throw new AuthError(`密码至少 ${authService.PASSWORD_MIN_LENGTH} 位，且不能超过 ${authService.PASSWORD_MAX_BYTES} 字节`, 400, 'INVALID_PASSWORD');
  }
  return { phone, password };
}

authRouter.post('/register/code', async (req, res) => {
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  if (!authService.PHONE_PATTERN.test(phone)) {
    res.status(400).json(error('请输入正确的中国大陆手机号', 400));
    return;
  }
  try {
    consumeLimit(`register-code:phone:minute:${phone}`, 1, 60_000);
    consumeLimit(`register-code:phone:hour:${phone}`, 5, 3_600_000);
    consumeLimit(`register-code:ip:hour:${req.ip}`, 20, 3_600_000);
    await authService.sendRegistrationCode(phone);
    res.json(success({ retryAfter: 60 }, '验证码已发送'));
  } catch (caught) {
    sendAuthError(res, caught, '验证码发送失败');
  }
});

authRouter.post('/register', async (req, res) => {
  try {
    const { phone, password } = readCredentials(req);
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const nickname = authService.normalizeNickname(typeof req.body?.nickname === 'string' ? req.body.nickname : '');
    if (!authService.CODE_PATTERN.test(code)) throw new AuthError('请输入正确的验证码', 400, 'INVALID_SMS_CODE');
    if (!authService.isValidNickname(nickname)) {
      throw new AuthError(`用户名需为 ${authService.NICKNAME_MIN_LENGTH}-${authService.NICKNAME_MAX_LENGTH} 个字符，且不能包含特殊符号`, 400, 'INVALID_NICKNAME');
    }
    consumeLimit(`register:ip:${req.ip}`, 10, 60 * 60_000);
    const result = await authService.register(phone, password, code, nickname, metadata(req));
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresIn);
    res.status(201).json(success({ accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user }, '注册成功'));
  } catch (caught) {
    sendAuthError(res, caught, '注册失败');
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const { phone, password } = readCredentials(req);
    consumeLimit(`login:phone:${phone}`, 10, 10 * 60_000);
    consumeLimit(`login:ip:${req.ip}`, 40, 10 * 60_000);
    const result = await authService.login(phone, password, metadata(req));
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresIn);
    res.json(success({ accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user }, '登录成功'));
  } catch (caught) {
    sendAuthError(res, caught, '登录失败');
  }
});

authRouter.post('/password/reset/code', async (req, res) => {
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  if (!authService.PHONE_PATTERN.test(phone)) return res.status(400).json(error('请输入正确的中国大陆手机号', 400));
  try { consumeLimit(`password-reset-code:phone:${phone}`, 1, 60_000); consumeLimit(`password-reset-code:ip:${req.ip}`, 10, 3_600_000); await authService.sendRegistrationCode(phone); res.json(success({ retryAfter: 60 }, '验证码已发送')); }
  catch (caught) { sendAuthError(res, caught, '验证码发送失败'); }
});

authRouter.post('/password/reset', async (req, res) => {
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  try { if (!authService.PHONE_PATTERN.test(phone) || !authService.CODE_PATTERN.test(code)) throw new AuthError('手机号或验证码格式错误', 400); await authService.resetPassword(phone, password, code); res.json(success(null, '密码重置成功')); }
  catch (caught) { sendAuthError(res, caught, '密码重置失败'); }
});

authRouter.post('/password/change/code', requireAuth, async (req, res) => {
  try { const user = await authService.getCurrentUser(req.auth!.userId); consumeLimit(`password-change-code:user:${user.id}`, 1, 60_000); await authService.sendRegistrationCode(user.phone); res.json(success({ retryAfter: 60 }, '验证码已发送')); }
  catch (caught) { sendAuthError(res, caught, '验证码发送失败'); }
});

authRouter.post('/password/change', requireAuth, async (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : ''; const password = typeof req.body?.password === 'string' ? req.body.password : '';
  try { if (!authService.CODE_PATTERN.test(code)) throw new AuthError('请输入正确的短信验证码', 400); await authService.changePassword(req.auth!.userId, password, code); res.json(success(null, '密码修改成功，请重新登录')); }
  catch (caught) { sendAuthError(res, caught, '密码修改失败'); }
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
