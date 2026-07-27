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

describe('密码认证与双令牌', () => {
  beforeAll(async () => {
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "RefreshSession"');
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "User"');
    await prisma.$executeRawUnsafe(`CREATE TABLE "User" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "phone" TEXT NOT NULL,
      "nickname" TEXT,
      "signature" TEXT,
      "avatar" TEXT,
      "passwordHash" TEXT,
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

  it('注册校验手机号和密码强度，并拒绝重复手机号', async () => {
    await request(app).post('/api/auth/register/code').send({ phone: '123' }).expect(400);
    await request(app).post('/api/auth/register/code').send({ phone: '13800000000' }).expect(200);
    expect(smsMocks.sendVerifyCode).toHaveBeenCalledOnce();
    await request(app).post('/api/auth/register').send({ phone: '123', password: 'password123', code: '123456' }).expect(400);
    await request(app).post('/api/auth/register').send({ phone: '13800000000', password: 'short', code: '123456' }).expect(400);
    await request(app).post('/api/auth/register').send({ phone: '13800000000', password: 'password123', code: '123456' }).expect(400);
    await request(app).post('/api/auth/register').send({ phone: '13800000000', password: 'password123', code: '123456', nickname: '古典迷' }).expect(201);
    await request(app).post('/api/auth/register').send({ phone: '13800000000', password: 'password123', code: '123456', nickname: '古典迷' }).expect(409);
  });

  it('注册保存密码哈希，密码登录后 Bearer Access Token 可读取本人信息', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ phone: '13800000000', password: 'password123', code: '123456', nickname: '红楼读者' })
      .expect(201);
    const stored = await prisma.user.findUniqueOrThrow({ where: { phone: '13800000000' } });
    expect(stored.passwordHash).toBeTruthy();
    expect(stored.passwordHash).not.toBe('password123');
    expect(stored.nickname).toBe('红楼读者');

    const login = await request(app)
      .post('/api/auth/login')
      .send({ phone: '13800000000', password: 'password123' })
      .expect(200);

    expect(login.body.data.user.phone).toBe('13800000000');
    expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(200);
    expect(me.body.data.id).toBe(login.body.data.user.id);
    expect(await prisma.user.count()).toBe(1);

    const profile = await request(app)
      .patch('/api/users/me/profile')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ nickname: '新昵称', signature: '以文会友', avatar: 'data:image/png;base64,aA==' })
      .expect(200);
    expect(profile.body.data).toMatchObject({ nickname: '新昵称', signature: '以文会友', avatar: 'data:image/png;base64,aA==' });

    await request(app).post('/api/auth/login').send({ phone: '13800000000', password: 'wrong-password' }).expect(401);
    expect(smsMocks.checkVerifyCode).toHaveBeenCalledTimes(1);
  });

  it('旧短信账号可通过注册验证设置密码且保留原账号', async () => {
    const legacy = await prisma.user.create({ data: { phone: '13700000000', phoneVerifiedAt: new Date() } });
    const result = await request(app).post('/api/auth/register')
      .send({ phone: legacy.phone, password: 'new-password', code: '123456', nickname: '旧账号用户' }).expect(201);
    expect(result.body.data.user.id).toBe(legacy.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: legacy.id } })).passwordHash).toBeTruthy();
  });

  it('Refresh Token 轮换后旧令牌重放会撤销会话链', async () => {
    const login = await request(app).post('/api/auth/register')
      .send({ phone: '13900000000', password: 'password123', code: '123456', nickname: '会话测试' }).expect(201);
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
