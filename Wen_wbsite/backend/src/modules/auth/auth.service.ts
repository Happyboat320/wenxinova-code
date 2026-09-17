import prisma from '../../lib/prisma.js';
import type { RefreshSession } from '@prisma/client';
import bcrypt from 'bcryptjs';
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
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 20;
export const BOOTSTRAP_ADMIN_PHONE = '18125680320';

export function normalizeNickname(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function isValidNickname(value: string): boolean {
  const normalized = normalizeNickname(value);
  const length = Array.from(normalized).length;
  return length >= NICKNAME_MIN_LENGTH
    && length <= NICKNAME_MAX_LENGTH
    && !/[<>\u0000-\u001f\u007f]/u.test(normalized);
}

export function toPublicUser(user: PublicUser): PublicUser {
  return {
    id: user.id,
    phone: user.phone,
    nickname: user.nickname,
    signature: user.signature,
    avatar: user.avatar,
    status: user.status,
    role: user.phone === BOOTSTRAP_ADMIN_PHONE ? 'admin' : user.role,
    phoneVerifiedAt: user.phoneVerifiedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function isValidPassword(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && Buffer.byteLength(password, 'utf8') <= PASSWORD_MAX_BYTES;
}

export async function sendRegistrationCode(phone: string): Promise<void> {
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

async function issueSession(user: PublicUser, metadata: RequestMetadata) {
  if (user.status !== 'active') throw new AuthError('账号已停用', 403, 'USER_DISABLED');
  const [access, refresh] = await Promise.all([
    Promise.resolve(signAccessToken(user.id)),
    createSession(user.id, metadata),
  ]);
  return { accessToken: access.token, expiresIn: access.expiresIn, refreshToken: refresh.token, refreshExpiresIn: refresh.expiresIn, user: toPublicUser(user) };
}

export async function register(phone: string, password: string, code: string, nickname: string, metadata: RequestMetadata) {
  const verified = await checkVerifyCode(phone, code);
  if (!verified) throw new AuthError('验证码错误或已过期', 400, 'INVALID_SMS_CODE');

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing?.passwordHash) throw new AuthError('该手机号已注册，请直接登录', 409, 'PHONE_REGISTERED');

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const now = new Date();
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, phoneVerifiedAt: now, nickname, ...(phone === BOOTSTRAP_ADMIN_PHONE ? { role: 'admin' } : {}) } })
      : await prisma.user.create({ data: { phone, passwordHash, phoneVerifiedAt: now, nickname, role: phone === BOOTSTRAP_ADMIN_PHONE ? 'admin' : 'user' } });
    if (existing) await prisma.refreshSession.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: now } });
    console.info(`密码注册成功: ${phone.slice(0, 3)}****${phone.slice(-4)}`);
    return await issueSession(user, metadata);
  } catch (caught) {
    if ((caught as { code?: string }).code === 'P2002') {
      throw new AuthError('该手机号已注册，请直接登录', 409, 'PHONE_REGISTERED');
    }
    throw caught;
  }
}

export async function login(phone: string, password: string, metadata: RequestMetadata) {
  let user = await prisma.user.findUnique({ where: { phone } });
  const passwordMatches = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !passwordMatches) throw new AuthError('手机号或密码错误', 401, 'INVALID_CREDENTIALS');
  // 即使初始管理员在迁移之后才注册，也能在首次登录时自动获得权限。
  if (phone === BOOTSTRAP_ADMIN_PHONE && user.role !== 'admin') {
    user = await prisma.user.update({ where: { id: user.id }, data: { role: 'admin' } });
  }
  console.info(`密码登录成功: ${phone.slice(0, 3)}****${phone.slice(-4)}`);
  return issueSession(user, metadata);
}

export async function resetPassword(phone: string, password: string, code: string): Promise<void> {
  if (!isValidPassword(password)) throw new AuthError(`密码至少 ${PASSWORD_MIN_LENGTH} 位，且不能超过 ${PASSWORD_MAX_BYTES} 字节`, 400, 'INVALID_PASSWORD');
  if (!(await checkVerifyCode(phone, code))) throw new AuthError('验证码错误或已过期', 400, 'INVALID_SMS_CODE');
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) throw new AuthError('手机号或验证码错误', 400, 'INVALID_RESET');
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12) } }),
    prisma.refreshSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } }),
  ]);
}

export async function changePassword(userId: number, password: string, code: string): Promise<void> {
  if (!isValidPassword(password)) throw new AuthError(`密码至少 ${PASSWORD_MIN_LENGTH} 位，且不能超过 ${PASSWORD_MAX_BYTES} 字节`, 400, 'INVALID_PASSWORD');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await checkVerifyCode(user.phone, code))) throw new AuthError('验证码错误或已过期', 400, 'INVALID_SMS_CODE');
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 12) } }),
    prisma.refreshSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
  ]);
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
    throw new AuthError('检测到异常登录，请重新登录', 401, 'REFRESH_REUSED');
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
      if (updated.count !== 1) throw new AuthError('检测到异常登录，请重新登录', 401, 'REFRESH_REUSED');
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
  let user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== 'active') throw new AuthError('用户不存在或已停用', 401, 'USER_UNAVAILABLE');
  if (user.phone === BOOTSTRAP_ADMIN_PHONE && user.role !== 'admin') {
    user = await prisma.user.update({ where: { id: user.id }, data: { role: 'admin' } });
  }
  return toPublicUser(user);
}

export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.refreshSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return result.count;
}
