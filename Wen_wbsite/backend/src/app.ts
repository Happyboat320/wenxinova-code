import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { bookRouter } from './modules/book/book.router.js';
import { adaptRouter } from './modules/adapt/adapt.router.js';
import { userRouter } from './modules/user/user.router.js';
import { communityRouter } from './modules/community/community.router.js';
import { authRouter } from './modules/auth/auth.router.js';

const app = express();

// 中间件
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || (process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0)) {
      callback(null, true);
      return;
    }
    callback(new Error('来源不在允许列表中'));
  },
}));
// 个人头像由前端压缩后以 data URL 传输，其他接口仍受字段级校验限制。
app.use(express.json({ limit: '512kb' }));

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 路由挂载
app.use('/api/books', bookRouter);
app.use('/api/adapt', adaptRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/community', communityRouter);

// API 404 处理
app.use('/api', (req, res) => {
  res.status(404).json({
    code: 404,
    message: '接口不存在',
    error: { message: `路径 ${req.path} 不存在` },
  });
});

// 生产环境托管前端静态文件，并支持前端路由刷新
const frontendDist = path.resolve(process.env.FRONTEND_DIST || '../frontend/dist/static');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  app.use((req, res) => {
    res.status(404).json({
      code: 404,
      message: '页面不存在',
      error: { message: `路径 ${req.path} 不存在` },
    });
  });
}

// 全局错误处理
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('服务器错误（响应已隐藏内部细节）:', err.name);
  res.status(500).json({
    code: 500,
    message: '服务器内部错误',
    error: { message: '请求处理失败' },
  });
});

export default app;
