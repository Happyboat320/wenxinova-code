# 文心新述（Classical Library Adaptation）

## 使用到的技术

- 前端：React + Vite + TypeScript + Tailwind CSS
- 后端：Node.js + Express + TypeScript
- 数据库：Prisma + SQLite / 可配置为其他数据库
- 全文检索：Manticore Search（中文 n-gram，SQLite 仍为业务真源）
- AI：通过外部 DeepSeek API 调用 `deepseek-chat` 模型
- 测试：Vitest

## 环境变量（重要）

- 后端（在 `backend/.env` 或系统环境中配置）：
  - `PORT`：后端服务端口（默认 3000）
  - `DEEPSEEK_API_URL`：DeepSeek 接口地址
  - `DEEPSEEK_API_KEY`：DeepSeek API 密钥
  - `DEEPSEEK_MODEL`：默认模型（推荐 `deepseek-chat`）
  - `DEEPSEEK_TRANSLATE_MODEL`：用于翻译的模型（可选）
  - `AI_MOCK_MODE`：设置为 `true` 可以使用模拟 AI 响应（用于离线开发）
  - `ALIBABA_CLOUD_ACCESS_KEY_ID` / `ALIBABA_CLOUD_ACCESS_KEY_SECRET`：短信认证 RAM 凭据
  - `ALIYUN_SMS_SIGN_NAME` / `ALIYUN_SMS_TEMPLATE_CODE`：阿里云短信签名和模板
  - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`：两段不同的双令牌密钥（至少 32 字符）
  - `AUTH_COOKIE_SECURE`：本地 HTTP 设为 `false`，生产 HTTPS 设为 `true`
  - `MANTICORE_HTTP_URL`：Manticore HTTP 地址（默认 `http://127.0.0.1:9308`）

- 前端（在 `.env` 或使用 Vite 的 `VITE_` 前缀）：
  - `VITE_API_BASE_URL`：后端 API 地址；生产环境默认使用同源 `/api`

## 如何使用（本地运行）

1. 安装依赖

- 后端：
```powershell
cd backend
pnpm install
```

- 前端：
```powershell
cd frontend
pnpm install
```

2. 配置环境变量

- 在 `backend` 目录下创建 `.env`，设置 DeepSeek API 参数；示例：

```
PORT=3000
DEEPSEEK_API_URL=https://api.deepseek.com/chat/completions
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_TRANSLATE_MODEL=deepseek-chat
AI_MOCK_MODE=false
ALIBABA_CLOUD_ACCESS_KEY_ID=your-ram-access-key-id
ALIBABA_CLOUD_ACCESS_KEY_SECRET=your-ram-access-key-secret
ALIYUN_SMS_SIGN_NAME=your-sign-name
ALIYUN_SMS_TEMPLATE_CODE=your-template-code
JWT_ACCESS_SECRET=replace-with-a-long-random-access-secret
JWT_REFRESH_SECRET=replace-with-a-different-long-refresh-secret
AUTH_COOKIE_SECURE=false
```

- 在 `frontend` 目录下创建 `.env`（Vite 要求 `VITE_` 前缀）：
```
VITE_API_BASE_URL=http://localhost:3000/api
```

3. 启动后端与前端

```powershell
# 后端
cd backend
pnpm dev

# 前端
cd frontend
pnpm dev
```

5. 访问

- 打开浏览器访问前端（Vite 提示的地址，通常 http://localhost:5173）
- 若在书籍页面触发译文生成，前端会调用后端翻译接口，后端会调用 DeepSeek API 并将结果缓存到数据库。

## 说明与注意

- 本项目已将调试打印移除，生产环境请通过集中化日志系统查看运行信息。
- 若只需离线联调，可临时将后端 `AI_MOCK_MODE=true` 以使用模拟返回。
- 如需启用更细粒度的调试信息，可在开发分支中添加相应日志。

