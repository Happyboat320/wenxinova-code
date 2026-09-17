import 'dotenv/config';
import app from './app.js';
import { cleanupExpiredSessions } from './modules/auth/auth.service.js';

const PORT = Number.parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 服务器运行在 http://${HOST}:${PORT}`);
});

// 端口被旧进程占用时，Node 默认抛出未捕获异常，导致 `npm start` 只显示堆栈。
// 输出可操作的诊断信息，并以失败状态退出，便于部署脚本和进程管理器识别。
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`启动失败：${HOST}:${PORT} 已被其他进程占用，请停止旧进程或修改 PORT。`);
  } else {
    console.error('服务器启动失败:', err);
  }
  process.exitCode = 1;
});

void cleanupExpiredSessions().catch(() => console.error('清理过期登录会话失败'));
setInterval(() => {
  void cleanupExpiredSessions().catch(() => console.error('清理过期登录会话失败'));
}, 6 * 60 * 60 * 1000).unref();
