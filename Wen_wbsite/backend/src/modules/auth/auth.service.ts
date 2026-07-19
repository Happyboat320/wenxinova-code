import prisma from '../../lib/prisma.js';
import type { RefreshSession } from '@prisma/client';
import { checkVerifyCode, sendVerifyCode } from './aliyun-sms.service.js';
import { AuthError, type PublicUser, type RequestMetadata } from './auth.types.js';
import {
  hashToken,
  newSessionId,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from './jwt.service.js';

export const PHONE_PATTERN = /^1[3-9]\d{9}$/;
export const CODE_PATTERN = /^\d{4,8}$/;

export function toPublicUser(user: PublicUser): PublicUser {
  return {
    id: user.id,
    phone: user.phone,
    status: user.status,
    phoneVerifiedAt: user.phoneVerifiedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function sendSms(phone: string): Promise<void> {
  await sendVerifyCode(phone);
}

async function createSession(userId: number, metadata: RequestMetadata) {
  const sessionId = newSessionId();
  const refresh = signRefreshToken(userId, sessionId);
  await prisma.refreshSession.create({
    data: {
      id: sessionId,
      userId,
      tokenHash: hashToken(refresh.token),
      expiresAt: refresh.expiresAt,
      userAgent: metadata.userAgent?.slice(0, 500),
      ipAddress: metadata.ipAddress?.slice(0, 64),
    },
  });
  return refresh;
}

export async function verifySmsAndLogin(phone: string, code: string, metadata: RequestMetadata) {
  const verified = await checkVerifyCode(phone, code);
  if (!verified) throw new AuthError('验证码错误或已过期', 400, 'INVALID_SMS_CODE');

  const now = new Date();
  const user = await prisma.user.upsert({
    where: { phone },
    update: { phoneVerifiedAt: now },
    create: { phone, phoneVerifiedAt: now },
  });
  if (user.status !== 'active') throw new AuthError('账号已停用', 403, 'USER_DISABLED');

  const [access, refresh] = await Promise.all([
    Promise.resolve(signAccessToken(user.id)),
    createSession(user.id, metadata),
  ]);
  console.info(`短信登录成功: ${phone.slice(0, 3)}****${phone.slice(-4)}`);
  return { accessToken: access.token, expiresIn: access.expiresIn, refreshToken: refresh.token, refreshExpiresIn: refresh.expiresIn, user: toPublicUser(user) };
}

async function revokeChain(sessionId: string): Promise<void> {
  const visited = new Set<string>();
  let currentId: string | null = sessionId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const current: RefreshSession | null = await prisma.refreshSession.findUnique({ where: { id: currentId } });
    if (!current) break;
    await prisma.refreshSession.updateMany({ where: { id: currentId, revokedAt: null }, data: { revokedAt: new Date() } });
    currentId = current.replacedById;
  }
}

export async function refreshSession(rawToken: string, metadata: RequestMetadata) {
  const payload = verifyRefreshToken(rawToken);
  const tokenHash = hashToken(rawToken);
  const current = await prisma.refreshSession.findUnique({
    where: { id: payload.sid },
    include: { user: true },
  });
  if (!current || current.tokenHash !== tokenHash || current.userId !== Number(payload.sub)) {
    throw new AuthError('登录状态已失效，请重新登录', 401, 'INVALID_REFRESH_SESSION');
  }
  if (current.revokedAt) {
    await revokeChain(current.id);
    console.warn(`检测到 Refresh Token 重放，会话 ${current.id} 已撤销`);
    throw new AuthError('检测到异常登录，请重新验证手机号', 401, 'REFRESH_REUSED');
  }
  if (current.expiresAt <= new Date() || current.user.status !== 'active') {
    await prisma.refreshSession.updateMany({ where: { id: current.id }, data: { revokedAt: new Date() } });
    throw new AuthError('登录状态已失效，请重新登录', 401, 'REFRESH_EXPIRED');
  }

  const nextSessionId = newSessionId();
  const nextRefresh = signRefreshToken(current.userId, nextSessionId);
  try {
    await prisma.$transaction(async tx => {
      const updated = await tx.refreshSession.updateMany({
        where: { id: current.id, tokenHash, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: nextSessionId, lastUsedAt: new Date() },
      });
      if (updated.count !== 1) throw new AuthError('检测到异常登录，请重新验证手机号', 401, 'REFRESH_REUSED');
      await tx.refreshSession.create({
        data: {
          id: nextSessionId,
          userId: current.userId,
          tokenHash: hashToken(nextRefresh.token),
          expiresAt: nextRefresh.expiresAt,
          userAgent: metadata.userAgent?.slice(0, 500),
          ipAddress: metadata.ipAddress?.slice(0, 64),
        },
      });
    });
  } catch (caught) {
    if (caught instanceof AuthError && caught.code === 'REFRESH_REUSED') await revokeChain(current.id);
    throw caught;
  }

  const access = signAccessToken(current.userId);
  return { accessToken: access.token, expiresIn: access.expiresIn, refreshToken: nextRefresh.token, refreshExpiresIn: nextRefresh.expiresIn, user: toPublicUser(current.user) };
}

export async function logoutSession(rawToken?: string): Promise<void> {
  if (!rawToken) return;
  try {
    const payload = verifyRefreshToken(rawToken);
    await prisma.refreshSession.updateMany({
      where: { id: payload.sid, tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
  } catch {
    // 退出登录始终幂等，不向外泄露令牌状态。
  }
}

export async function logoutAll(userId: number): Promise<void> {
  await prisma.refreshSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function getCurrentUser(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== 'active') throw new AuthError('用户不存在或已停用', 401, 'USER_UNAVAILABLE');
  return toPublicUser(user);
}

export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.refreshSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return result.count;
}
