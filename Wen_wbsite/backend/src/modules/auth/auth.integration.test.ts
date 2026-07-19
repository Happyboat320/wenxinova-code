import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const smsMocks = vi.hoisted(() => ({
  sendVerifyCode: vi.fn(async () => undefined),
  checkVerifyCode: vi.fn(async () => true),
}));

vi.mock('./aliyun-sms.service.js', () => ({
  ...smsMocks,
  resetSmsClientForTests: vi.fn(),
}));

import app from '../../app.js';
import prisma from '../../lib/prisma.js';
import { resetRateLimitsForTests } from './rate-limit.js';
import { signRefreshToken } from './jwt.service.js';

describe('短信认证与双令牌', () => {
  beforeAll(async () => {
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "RefreshSession"');
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "User"');
    await prisma.$executeRawUnsafe(`CREATE TABLE "User" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "phone" TEXT NOT NULL,
      "phoneVerifiedAt" DATETIME,
      "status" TEXT NOT NULL DEFAULT 'active',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone")');
    await prisma.$executeRawUnsafe(`CREATE TABLE "RefreshSession" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" INTEGER NOT NULL,
      "tokenHash" TEXT NOT NULL,
      "expiresAt" DATETIME NOT NULL,
      "revokedAt" DATETIME,
      "replacedById" TEXT,
      "userAgent" TEXT,
      "ipAddress" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`);
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash")');
  });

  beforeEach(async () => {
    resetRateLimitsForTests();
    smsMocks.sendVerifyCode.mockClear();
    smsMocks.checkVerifyCode.mockClear();
    smsMocks.checkVerifyCode.mockResolvedValue(true);
    await prisma.refreshSession.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('非法手机号不会调用短信供应商，重复发送会被限流', async () => {
    await request(app).post('/api/auth/sms/send').send({ phone: '123' }).expect(400);
    expect(smsMocks.sendVerifyCode).not.toHaveBeenCalled();

    await request(app).post('/api/auth/sms/send').send({ phone: '13800000000' }).expect(200);
    await request(app).post('/api/auth/sms/send').send({ phone: '13800000000' }).expect(429);
    expect(smsMocks.sendVerifyCode).toHaveBeenCalledTimes(1);
  });

  it('验证码首次登录自动创建用户，Bearer Access Token 可读取本人信息', async () => {
    const login = await request(app)
      .post('/api/auth/sms/verify')
      .send({ phone: '13800000000', code: '123456' })
      .expect(200);

    expect(login.body.data.user.phone).toBe('13800000000');
    expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(200);
    expect(me.body.data.id).toBe(login.body.data.user.id);
    expect(await prisma.user.count()).toBe(1);

    await request(app).post('/api/auth/sms/verify').send({ phone: '13800000000', code: '123456' }).expect(200);
    expect(await prisma.user.count()).toBe(1);
  });

  it('Refresh Token 轮换后旧令牌重放会撤销会话链', async () => {
    const login = await request(app)
      .post('/api/auth/sms/verify')
      .send({ phone: '13900000000', code: '123456' })
      .expect(200);
    const oldCookie = login.headers['set-cookie'][0].split(';')[0];

    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', oldCookie).expect(200);
    const newCookie = refreshed.headers['set-cookie'][0].split(';')[0];
    await request(app).post('/api/auth/refresh').set('Cookie', oldCookie).expect(401);
    await request(app).post('/api/auth/refresh').set('Cookie', newCookie).expect(401);
  });

  it('Refresh Token 不能作为 Bearer Access Token', async () => {
    const refresh = signRefreshToken(1, 'test-session').token;
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${refresh}`).expect(401);
  });

  it('个人创作接口必须登录且忽略客户端伪造身份', async () => {
    await request(app).get('/api/users/me/creations').expect(401);
    await request(app).post('/api/users/creation').send({ userId: 999, prompt: 'x', content: 'y' }).expect(401);
  });
});
