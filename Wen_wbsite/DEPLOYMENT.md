# 文心新述生产部署指南

## 当前部署结构

- 前端：React + Vite，构建结果位于 `frontend/dist/static`
- HTTPS 入口：Nginx 监听 `80/443`，HTTP 自动跳转 HTTPS
- 后端：Express + TypeScript，仅监听 `127.0.0.1:5000`
- 数据库：SQLite，文件位于 `backend/prisma/data/app.db`
- 检索：Manticore Search，仅通过本机 `9308` HTTP 接口访问
- AI：DeepSeek API，默认模型为 `deepseek-chat`
- 守护：systemd，退出 SSH 后继续运行，服务器重启后自动启动

生产环境由 Express 托管前端静态文件，浏览器通过同源 `/api` 访问后端，因此无需把服务器地址写死在前端代码中。

## 首次部署

以下命令均在项目根目录执行：

```bash
cd /root/wenxin/Wen_wbsite

cd backend
npm ci
npx prisma generate
npx prisma db push
# 仅在新建空数据库时导入压缩包自带书籍数据，切勿重复执行
npm run import:json
npm run build

cd ../frontend
npm install
npm run build
```

编辑 `backend/.env`，务必配置真实的 DeepSeek API Key：

```env
PORT=5000
DATABASE_URL="file:./data/app.db"
DEEPSEEK_API_URL="https://api.deepseek.com/chat/completions"
DEEPSEEK_API_KEY="sk-你的真实密钥"
DEEPSEEK_MODEL="deepseek-chat"
DEEPSEEK_TRANSLATE_MODEL="deepseek-chat"
AI_MOCK_MODE="false"
NODE_ENV="production"
HOST="127.0.0.1"
AUTH_COOKIE_SECURE="true"
AUTH_COOKIE_DOMAIN=""
CORS_ORIGINS="https://8.134.215.157"
TRUST_PROXY="true"
MANTICORE_HTTP_URL="http://127.0.0.1:9308"
MANTICORE_TIMEOUT_MS="5000"
MANTICORE_LIBRARY_INDEX="wenxin_library"
MANTICORE_COMMUNITY_INDEX="wenxin_community"
```

请同时将 `JWT_SECRET` 改成足够长的随机值。不要把 `.env` 提交到版本库或发送给他人。

安装并启动 systemd 服务：

```bash
sudo cp deploy/wenxin.service /etc/systemd/system/wenxin.service
sudo systemctl daemon-reload
sudo systemctl enable --now wenxin
```

公网访问地址：`https://8.134.215.157`。安全组只需对外开放 TCP `80/443`，不要开放 `5000`。

Nginx 的 HTTP 申请阶段与最终 HTTPS 配置分别保存在
`deploy/nginx-wenxin-http.conf` 和 `deploy/nginx-wenxin-https.conf`。Certbot 续期部署钩子为
`deploy/reload-nginx.sh`，安装到 `/etc/letsencrypt/renewal-hooks/deploy/` 后会在续期成功时检查并重载 Nginx。

## 日常维护

```bash
# 查看状态
sudo systemctl status wenxin

# 实时查看日志
sudo journalctl -u wenxin -f

# 重启/停止/启动
sudo systemctl restart wenxin
sudo systemctl stop wenxin
sudo systemctl start wenxin

# 最近 100 行日志
sudo journalctl -u wenxin -n 100 --no-pager
```

修改后端代码后：

```bash
cd /root/wenxin/Wen_wbsite/backend
npm run build
sudo systemctl restart wenxin
```

修改前端代码后：

```bash
cd /root/wenxin/Wen_wbsite/frontend
npm run build
sudo systemctl restart wenxin
```

首次部署 Manticore 或批量更新书籍数据后，重建可恢复的派生索引：

```bash
cd /root/wenxin/Wen_wbsite/backend
npm run search:reindex
```

数据边界、数量核对和回滚方式见 `backend/docs/SEARCH_MIGRATION.md`。

修改 `backend/.env` 后只需执行 `sudo systemctl restart wenxin`。

## 数据备份

SQLite 数据库应定期备份：

```bash
sudo systemctl stop wenxin
cp /root/wenxin/Wen_wbsite/backend/prisma/data/app.db "/root/wenxin/app-$(date +%F-%H%M%S).db"
sudo systemctl start wenxin
```

## HTTPS 证书维护

当前使用 Let's Encrypt 的短期 IP 证书。Certbot 定时器必须保持启用，可用以下命令检查：

```bash
sudo systemctl status snap.certbot.renew.timer
sudo /snap/bin/certbot renew --dry-run --no-random-sleep-on-renew
```

## 故障排查

- 页面打不开：检查 `systemctl status wenxin nginx`、安全组以及 TCP `80/443` 放行情况。
- AI 返回失败：检查 `DEEPSEEK_API_KEY`、账户余额、服务器外网连通性和 `journalctl` 日志。
- 修改前端后页面未变化：重新执行 `npm run build`，并强制刷新浏览器缓存。
- Node 路径改变：更新 `deploy/wenxin.service` 中的 `Environment=PATH` 和 `ExecStart`，再重新复制服务文件并执行 `systemctl daemon-reload`。
