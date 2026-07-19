import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from './jwt.service.js';

describe('JWT 双令牌', () => {
  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = 'access-secret-for-tests-32-characters-minimum';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret-for-tests-32-characters-minimum';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '30d';
    process.env.JWT_ISSUER = 'wenxin-api';
    process.env.JWT_AUDIENCE = 'wenxin-web';
  });

  it('签发并验证用途独立的 Access/Refresh Token', () => {
    const access = signAccessToken(42);
    const refresh = signRefreshToken(42, 'session-1');

    expect(verifyAccessToken(access.token)).toMatchObject({ sub: '42', type: 'access' });
    expect(verifyRefreshToken(refresh.token)).toMatchObject({ sub: '42', sid: 'session-1', type: 'refresh' });
    expect(() => verifyAccessToken(refresh.token)).toThrow();
    expect(() => verifyRefreshToken(access.token)).toThrow();
  });

  it('校验 issuer、audience 和 token type', () => {
    const forged = jwt.sign(
      { sub: '42', type: 'access', jti: 'forged' },
      process.env.JWT_ACCESS_SECRET!,
      { issuer: 'other-api', audience: 'wenxin-web', expiresIn: 60 },
    );
    expect(() => verifyAccessToken(forged)).toThrow('登录已过期');
  });

  it('令牌仅以稳定 SHA-256 哈希入库', () => {
    expect(hashToken('secret-token')).toHaveLength(64);
    expect(hashToken('secret-token')).toBe(hashToken('secret-token'));
    expect(hashToken('secret-token')).not.toContain('secret-token');
  });

  it('拒绝短密钥', () => {
    process.env.JWT_ACCESS_SECRET = 'short';
    expect(() => signAccessToken(1)).toThrow('至少 32 个字符');
  });
});

