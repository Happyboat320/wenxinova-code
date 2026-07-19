import 'dotenv/config';
import app from './app.js';
import { cleanupExpiredSessions } from './modules/auth/auth.service.js';

const PORT = Number.parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`🚀 服务器运行在 http://${HOST}:${PORT}`);
});

void cleanupExpiredSessions().catch(() => console.error('清理过期登录会话失败'));
setInterval(() => {
  void cleanupExpiredSessions().catch(() => console.error('清理过期登录会话失败'));
}, 6 * 60 * 60 * 1000).unref();
