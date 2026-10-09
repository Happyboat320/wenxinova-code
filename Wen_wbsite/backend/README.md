# 文心新述 - 后端服务

古典小说智能改编平台后端服务，基于 Node.js + TypeScript + Express + Prisma + SQLite 构建。

## 技术栈

- **运行时**: Node.js 18+
- **语言**: TypeScript 5.x
- **框架**: Express 4.x
- **ORM**: Prisma 6.x
- **数据库**: SQLite
- **测试**: Vitest + Supertest
- **AI 服务**: DeepSeek API（外部服务）

## 项目结构

```
backend/
├── prisma/
│   ├── schema.prisma      # 数据库模型定义
│   └── seed.ts            # 种子数据脚本
├── src/
│   ├── app.ts             # Express 应用配置
│   ├── server.ts          # 服务器入口
│   ├── lib/
│   │   ├── prisma.ts      # Prisma 客户端
│   │   ├── response.ts    # 统一响应格式
│   │   └── deepseek.ts    # DeepSeek API 封装
│   ├── middleware/
│   │   └── auth.ts        # 认证中间件
│   └── modules/
│       ├── user/          # 用户模块
│       ├── auth/          # 认证模块
│       ├── book/          # 书籍模块
│       ├── adapt/         # AI 改编模块
│       ├── script/        # 剧本杀模块
│       ├── creation/      # 创作模块
│       └── community/     # 社区模块
├── tests/
│   └── user.test.ts       # 测试文件
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .env.example           # 环境变量示例
```

## 数据模型说明

- 新增 `Annotation` 表保存书籍注释，字段包括脚注编号与注释内容，并与 `Book` 建立一对多关联。
- `Book.annotationCount` 记录当前书籍的注释数量，导入脚本会自动维护该字段。

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
# 复制环境变量示例文件
cp .env.example .env

# 编辑 .env 文件，配置以下内容：
# - PORT: 服务端口（默认 3000）
# - DATABASE_URL: 数据库路径
# - JWT_ACCESS_SECRET / JWT_REFRESH_SECRET: 两段不同的随机密钥
# - ALIBABA_CLOUD_* / ALIYUN_SMS_*: 阿里云短信认证配置
# - AUTH_COOKIE_SECURE: 本地 HTTP 为 false，生产 HTTPS 为 true
# - AI_MOCK_MODE: 设为 true 可在不调用外部 API 时测试
```

### 3. 初始化数据库

```bash
# 生成 Prisma 客户端
pnpm generate

# 执行数据库迁移
pnpm migrate
```

书库数据不随源码分发。需另行提供原文 TXT、小说目录 Excel 和 JSON 数据；导入步骤见 [导入指南](docs/IMPORT_GUIDE.md)。

### 4. 启动开发服务器

```bash
pnpm dev
```

服务将在 `http://localhost:3000` 启动。

## 可用脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器（热重载） |
| `pnpm build` | 构建生产版本 |
| `pnpm start` | 启动生产服务器 |
| `pnpm migrate` | 执行数据库迁移 |
| `pnpm migrate:deploy` | 部署数据库迁移（生产环境） |
| `pnpm generate` | 生成 Prisma 客户端 |
| `pnpm db:push` | 推送数据库架构（开发环境） |
| `pnpm test` | 运行测试 |
| `pnpm test:watch` | 监视模式运行测试 |

## API 接口

### 认证模块
- `POST /api/auth/register/code` - 发送注册验证码（手机号/IP 限流）
- `POST /api/auth/register` - 使用手机号、验证码和密码注册；旧短信账号可在此设置密码
- `POST /api/auth/login` - 使用手机号和密码登录（手机号/IP 限流）
- `POST /api/auth/refresh` - 轮换 Refresh Token Cookie
- `GET /api/auth/me` - 获取当前用户（需要 Access Token）
- `POST /api/auth/logout` - 撤销当前会话并清除 Cookie
- `POST /api/auth/logout-all` - 撤销全部设备会话

### 用户模块
- `POST /api/users/creation` - 保存当前用户创作（需要登录，不接受 `userId`）
- `GET /api/users/me/creations` - 获取当前用户创作（需要登录）

### 书籍模块
- `GET /api/books` - 获取书籍列表
- `GET /api/books/:id` - 获取书籍详情（返回字段包含 `annotationCount` 以及按编号排序的 `annotations` 数组）
- `POST /api/books` - 创建书籍
- `PUT /api/books/:id` - 更新书籍
- `DELETE /api/books/:id` - 删除书籍

### AI 改编模块（需要登录）
- `POST /api/adapt` - AI 改编/续写/问答（按用户与 IP 限流，限制并发）
- `POST /api/books/:id/translation` - AI 翻译（按用户与 IP 限流，限制并发）

### 剧本杀模块
- `GET /api/script/characters/:bookId` - 获取角色列表
- `POST /api/script/props` - 生成道具清单（需要登录）
- `POST /api/script/character-script` - 生成角色剧本（需要登录）
- `POST /api/script/dm-manual` - 生成 DM 手册（需要登录）

### 创作模块（需要登录）
- `POST /api/creations` - 保存创作
- `GET /api/creations` - 获取创作列表
- `GET /api/creations/:id/export` - 导出创作
- `DELETE /api/creations/:id` - 删除创作

### 社区模块
- `GET /api/community/posts` - 获取帖子列表
- `POST /api/community/posts` - 发布帖子（需要登录）
- `POST /api/community/posts/:id/like` - 点赞（需要登录）

## 统一响应格式

### 成功响应
```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

### 分页响应
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [...],
    "total": 100,
    "page": 1,
    "pageSize": 10
  }
}
```

### 错误响应
```json
{
  "code": 500,
  "message": "服务器内部错误",
  "error": {
    "message": "具体错误信息"
  }
}
```

## 数据库迁移

项目使用 SQLite 数据库，数据文件存储在 `prisma/data/app.db`。

### 开发环境

```bash
# 快速同步数据库架构（会重置数据）
pnpm db:push

# 或创建正式迁移
pnpm migrate
```

### 生产环境

```bash
# 首次对已有的旧数据库升级前：先备份数据库，再只执行一次基线标记
cp prisma/data/app.db prisma/data/app.db.backup
pnpm exec prisma migrate resolve --applied 20260716000000_initial

# 应用短信认证会话增量迁移
pnpm migrate:deploy
```

全新数据库不需要执行 `migrate resolve`，直接运行 `pnpm migrate:deploy` 会依次创建基线表和认证会话表。不要把认证增量迁移标记为已应用，否则会漏建 `RefreshSession`。

## 可迁移性说明

项目设计考虑了可迁移性：

1. **数据库迁移**: 使用 Prisma 管理数据库架构，支持迁移到其他数据库（如 PostgreSQL、MySQL）
2. **环境配置**: 所有配置通过环境变量管理
3. **模块化设计**: 各模块独立，便于扩展和替换
4. **AI 服务抽象**: AI 调用封装在 `src/lib/deepseek.ts`，通过 DeepSeek Chat Completions API 提供服务
5. **Mock 模式**: 支持在不启动 AI 服务的情况下测试前后端联调

### 迁移到其他数据库

1. 修改 `prisma/schema.prisma` 中的 `provider`
2. 更新 `.env` 中的 `DATABASE_URL`
3. 重新运行迁移命令

### 切换 AI 服务

当前使用 DeepSeek API，如需切换其他 OpenAI 兼容服务：
1. 修改 `src/lib/deepseek.ts` 中的 API 地址和响应适配
2. 更新环境变量配置

## 测试指南

- 参照 `docs/mock-testing.md` 了解如何在不使用 AI API 的情况下测试前后端联调。
- 参照 `docs/tests-guide.md` 运行 Vitest 自动化测试并解读 `tests/` 目录。

## License

MIT
