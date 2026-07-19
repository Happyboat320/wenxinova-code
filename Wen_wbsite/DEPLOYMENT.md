# 文心新述生产部署指南

## 当前部署结构

- 前端：React + Vite，构建结果位于 `frontend/dist/static`
- 后端：Express + TypeScript，监听 `5000` 端口
- 数据库：SQLite，文件位于 `backend/prisma/data/app.db`
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
```

请同时将 `JWT_SECRET` 改成足够长的随机值。不要把 `.env` 提交到版本库或发送给他人。

安装并启动 systemd 服务：

```bash
sudo cp deploy/wenxin.service /etc/systemd/system/wenxin.service
sudo systemctl daemon-reload
sudo systemctl enable --now wenxin
```

访问地址：`http://服务器公网IP:5000`。云服务器安全组和本机防火墙需放行 TCP `5000`。

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

修改 `backend/.env` 后只需执行 `sudo systemctl restart wenxin`。

## 数据备份

SQLite 数据库应定期备份：

```bash
sudo systemctl stop wenxin
cp /root/wenxin/Wen_wbsite/backend/prisma/data/app.db "/root/wenxin/app-$(date +%F-%H%M%S).db"
sudo systemctl start wenxin
```

## 可选：域名与 HTTPS

正式公网使用建议安装 Nginx，把域名的 `80/443` 端口反向代理到 `127.0.0.1:5000`，并使用 Certbot 配置 HTTPS。配置反向代理后，可将后端 `PORT` 保持为 `5000`，只对本机开放该端口。

## 故障排查

- 页面打不开：检查 `systemctl status wenxin`、安全组和 TCP `5000` 放行情况。
- AI 返回失败：检查 `DEEPSEEK_API_KEY`、账户余额、服务器外网连通性和 `journalctl` 日志。
- 修改前端后页面未变化：重新执行 `npm run build`，并强制刷新浏览器缓存。
- Node 路径改变：更新 `deploy/wenxin.service` 中的 `Environment=PATH` 和 `ExecStart`，再重新复制服务文件并执行 `systemctl daemon-reload`。
