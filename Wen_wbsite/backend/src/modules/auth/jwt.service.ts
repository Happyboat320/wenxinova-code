import { createHash, randomUUID } from 'node:crypto';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { AuthError } from './auth.types.js';

interface AccessPayload extends JwtPayload {
  sub: string;
  type: 'access';
  jti: string;
}

interface RefreshPayload extends JwtPayload {
  sub: string;
  sid: string;
  type: 'refresh';
  jti: string;
}

function required(name: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} 必须配置为至少 32 个字符的独立密钥`);
  }
  const otherName = name === 'JWT_ACCESS_SECRET' ? 'JWT_REFRESH_SECRET' : 'JWT_ACCESS_SECRET';
  if (process.env[otherName] && process.env[otherName] === value) {
    throw new Error('JWT_ACCESS_SECRET 与 JWT_REFRESH_SECRET 必须使用不同密钥');
  }
  return value;
}

function parseDuration(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!match) throw new Error(`无效的 Token 有效期: ${value}`);
  const amount = Number(match[1]);
  const unitSeconds = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return amount * unitSeconds;
}

function commonOptions() {
  return {
    issuer: process.env.JWT_ISSUER || 'wenxin-api',
    audience: process.env.JWT_AUDIENCE || 'wenxin-web',
  };
}

function assertPayload(payload: string | JwtPayload, expectedType: 'access' | 'refresh') {
  if (
    typeof payload === 'string' ||
    payload.type !== expectedType ||
    typeof payload.sub !== 'string' ||
    !/^\d+$/.test(payload.sub) ||
    typeof payload.jti !== 'string'
  ) {
    throw new AuthError('登录凭证无效', 401, 'INVALID_TOKEN');
  }
}

export function signAccessToken(userId: number): { token: string; expiresIn: number } {
  const expiresIn = parseDuration(process.env.JWT_ACCESS_EXPIRES_IN, 15 * 60);
  const payload: AccessPayload = { sub: String(userId), type: 'access', jti: randomUUID() };
  return {
    token: jwt.sign(payload, required('JWT_ACCESS_SECRET'), { ...commonOptions(), expiresIn }),
    expiresIn,
  };
}

export function signRefreshToken(userId: number, sessionId: string): { token: string; expiresIn: number; expiresAt: Date } {
  const expiresIn = parseDuration(process.env.JWT_REFRESH_EXPIRES_IN, 30 * 86400);
  const payload: RefreshPayload = {
    sub: String(userId),
    sid: sessionId,
    type: 'refresh',
    jti: randomUUID(),
  };
  return {
    token: jwt.sign(payload, required('JWT_REFRESH_SECRET'), { ...commonOptions(), expiresIn }),
    expiresIn,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
}

export function verifyAccessToken(token: string): AccessPayload {
  try {
    const payload = jwt.verify(token, required('JWT_ACCESS_SECRET'), commonOptions());
    assertPayload(payload, 'access');
    return payload as AccessPayload;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError('登录已过期，请重新登录', 401, 'INVALID_ACCESS_TOKEN');
  }
}

export function verifyRefreshToken(token: string): RefreshPayload {
  try {
    const payload = jwt.verify(token, required('JWT_REFRESH_SECRET'), commonOptions());
    assertPayload(payload, 'refresh');
    if (typeof (payload as JwtPayload).sid !== 'string') {
      throw new AuthError('刷新凭证无效', 401, 'INVALID_REFRESH_TOKEN');
    }
    return payload as RefreshPayload;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError('登录状态已失效，请重新登录', 401, 'INVALID_REFRESH_TOKEN');
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newSessionId(): string {
  return randomUUID();
}
