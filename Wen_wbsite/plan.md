# 用户短信登录与 JWT 双令牌改造方案

## 1. 目标与边界

本次改造采用以下认证流程：

1. 用户输入手机号，请求本项目后端发送验证码。
2. 后端调用阿里云短信认证服务发送验证码。
3. 用户提交手机号和验证码。
4. 后端调用阿里云短信认证服务校验验证码。
5. 校验成功后，后端按手机号查找用户；用户不存在时自动创建。
6. 后端签发短期 Access Token 和长期 Refresh Token。
7. Access Token 用于访问受保护业务接口，Refresh Token 仅用于续期和退出登录。

职责边界：

- 阿里云负责验证码生成、发送、存储、有效期和正确性校验。
- 本项目不保存验证码，也不自行比较验证码。
- 本项目仍需限制发送接口的调用频率，避免恶意请求产生短信费用。
- 本项目负责用户、登录会话、Token 签发、Token 轮换、会话撤销和业务接口鉴权。

## 2. 上线前需要确认的阿里云配置

阿里云“短信认证服务”应使用 `Dypnsapi` 对应的 Node.js SDK。实施时先在阿里云控制台和最新 SDK 文档中确认当前账号对应的请求字段及 API 版本，预期使用：

- 发送验证码：`SendSmsVerifyCode`
- 校验验证码：`CheckSmsVerifyCode`
- 服务 Endpoint：`dypnsapi.aliyuncs.com`
- Node.js SDK：`@alicloud/dypnsapi20170525`

AccessKey 仅用于调用身份认证；发送短信是否还需签名、模板 Code、模板参数，应以短信认证控制台创建的方案为准。实施前需要在控制台确认：

- 服务是否已开通并完成资质审核。
- 当前短信认证方案是否已启用。
- 是否需要短信签名名称。
- 是否需要短信模板 Code。
- 验证码模板变量是否为 `code`。
- 发送频率、日限额、计费告警和黑名单策略。

不要使用阿里云主账号 AccessKey。创建专用 RAM 用户，并配置仅允许短信认证发送和核验操作的最小权限。AccessKey Secret 只保存在服务器 `.env` 中。

## 3. 环境变量设计

后端 `.env.example` 增加以下配置：

```env
# 阿里云短信认证服务
ALIBABA_CLOUD_ACCESS_KEY_ID=""
ALIBABA_CLOUD_ACCESS_KEY_SECRET=""
ALIYUN_DYPN_REGION_ID="cn-hangzhou"
ALIYUN_DYPN_ENDPOINT="dypnsapi.aliyuncs.com"
ALIYUN_SMS_SIGN_NAME=""
ALIYUN_SMS_TEMPLATE_CODE=""

# JWT 双令牌，两个 Secret 必须独立随机生成
JWT_ACCESS_SECRET=""
JWT_REFRESH_SECRET=""
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="30d"
JWT_ISSUER="wenxin-api"
JWT_AUDIENCE="wenxin-web"

# Refresh Cookie；生产环境启用 HTTPS 后必须为 true
AUTH_COOKIE_SECURE="true"
AUTH_COOKIE_DOMAIN=""
```

要求：

- Access Secret 与 Refresh Secret 使用两段不同的高强度随机值。
- 不再使用单一 `JWT_SECRET` 同时签发两种 Token。
- `.env` 不提交版本库，日志不得输出 AccessKey、验证码、Token 或完整手机号。
- 修改 `.env` 后执行 `systemctl restart wenxin`。

## 4. 后端模块设计

新增目录：

```text
backend/src/modules/auth/
├── auth.router.ts
├── auth.service.ts
├── auth.types.ts
├── aliyun-sms.service.ts
├── jwt.service.ts
└── auth.middleware.ts
```

职责：

- `aliyun-sms.service.ts`：初始化阿里云客户端，封装发送和核验调用，统一转换阿里云错误。
- `jwt.service.ts`：签发、验证 Access/Refresh Token，生成 `jti`，处理过期时间。
- `auth.service.ts`：验证码校验成功后的用户自动注册、会话创建、刷新轮换和退出登录。
- `auth.middleware.ts`：解析 `Authorization: Bearer <accessToken>`，把认证用户写入 `req.auth`。
- `auth.router.ts`：暴露短信、登录、刷新、退出和当前用户接口。

阿里云调用必须设置连接和请求超时。对外只返回可理解的业务错误，不把阿里云原始响应、AccessKey 信息或内部堆栈发送给浏览器。

## 5. 数据库模型调整

验证码不存数据库，但 Refresh Token 需要支持撤销、轮换和多设备会话，因此增加会话表。

建议 Prisma 模型：

```prisma
model User {
  id              Int              @id @default(autoincrement())
  phone           String           @unique
  phoneVerifiedAt DateTime?
  status          String           @default("active")
  creations       Creation[]
  refreshSessions RefreshSession[]
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
}

model RefreshSession {
  id            String    @id
  userId        Int
  tokenHash     String    @unique
  expiresAt     DateTime
  revokedAt     DateTime?
  replacedById  String?
  userAgent     String?
  ipAddress     String?
  createdAt     DateTime  @default(now())
  lastUsedAt    DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}
```

Refresh Token 原文不入库，只保存 SHA-256 哈希。定时清理已过期或长期撤销的会话记录。

## 6. API 设计

### 6.1 发送验证码

`POST /api/auth/sms/send`

请求：

```json
{ "phone": "13800000000" }
```

响应：

```json
{ "code": 0, "message": "验证码已发送", "data": { "retryAfter": 60 } }
```

要求：

- 后端先校验中国大陆手机号格式。
- 无论手机号是否已注册，都使用一致的成功响应，避免用户枚举。
- 按 IP 和手机号限流；建议手机号 60 秒一次、每小时 5 次、每天设置合理上限。
- 阿里云限流是第二道保护，本项目自身限流不可省略。

### 6.2 验证码登录/自动注册

`POST /api/auth/sms/verify`

请求：

```json
{ "phone": "13800000000", "code": "123456" }
```

成功后：

- 调用阿里云核验验证码。
- 查询用户，不存在则创建并写入 `phoneVerifiedAt`。
- 创建 `RefreshSession`。
- 返回 Access Token 和用户信息。
- Refresh Token 写入 HttpOnly Cookie，不交给前端 JavaScript。

响应：

```json
{
  "code": 0,
  "message": "登录成功",
  "data": {
    "accessToken": "...",
    "expiresIn": 900,
    "user": { "id": 1, "phone": "13800000000" }
  }
}
```

Refresh Cookie 建议属性：

```text
HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=2592000
```

### 6.3 刷新 Token

`POST /api/auth/refresh`

- 从 HttpOnly Cookie 获取 Refresh Token。
- 验证 JWT 类型、签名、`iss`、`aud`、`exp` 和 `jti`。
- 对 Token 计算哈希并匹配未撤销的 `RefreshSession`。
- 每次刷新执行 Refresh Token Rotation：撤销旧会话令牌并签发新令牌。
- 若发现已撤销 Refresh Token 被重复使用，撤销该用户同一会话链，要求重新短信登录。
- 返回新的 Access Token，并覆盖 Refresh Cookie。

### 6.4 当前用户

`GET /api/auth/me`

- 必须携带 Access Token。
- 返回当前用户的安全字段，不返回任何 Token、Secret 或内部会话信息。

### 6.5 退出登录

`POST /api/auth/logout`

- 撤销当前 RefreshSession。
- 清除 Refresh Cookie。
- Access Token 最长在 15 分钟后自然失效。

可选增加 `POST /api/auth/logout-all`，撤销当前用户所有设备会话。

## 7. JWT 规则

Access Token 建议载荷：

```json
{
  "sub": "用户ID",
  "type": "access",
  "jti": "唯一ID",
  "iss": "wenxin-api",
  "aud": "wenxin-web"
}
```

Refresh Token 建议载荷：

```json
{
  "sub": "用户ID",
  "sid": "RefreshSession ID",
  "type": "refresh",
  "jti": "唯一ID",
  "iss": "wenxin-api",
  "aud": "wenxin-web"
}
```

规则：

- Access Token 有效期 15 分钟，只通过 `Authorization` Header 发送。
- Refresh Token 有效期 30 天，只通过 HttpOnly Cookie 发送。
- 两种 Token 使用不同 Secret，校验时必须检查 `type`，禁止互相替代。
- 不在 JWT 中放手机号等非必要个人信息。

## 8. 现有业务接口鉴权改造

当前接口直接相信前端提交的 `userId`，存在越权风险。改造如下：

- `POST /api/users/creation`：增加 Access Token 鉴权；删除请求体中的 `userId`，从 `req.auth.userId` 获取。
- `GET /api/users/:userId/creations`：替换为 `GET /api/users/me/creations`，用户 ID 从 Token 获取。
- 社区列表和社区详情保持公开只读。
- 书籍列表、书籍内容保持公开只读。
- AI 翻译和改编建议要求登录，并增加按用户/IP 的调用频率与并发限制，防止 DeepSeek API 费用被滥用。
- 返回用户数据时默认脱敏手机号。

迁移期间可短暂保留旧接口，但必须验证路径中的 `userId` 与 Token 用户一致，并在前端切换后删除旧接口。

## 9. 前端改造

### 9.1 登录界面

- 手机号输入框。
- “获取验证码”按钮和 60 秒倒计时。
- 验证码输入框。
- “登录/注册”合并为一个按钮，首次验证成功自动注册。
- 展示发送过快、验证码错误、验证码过期等明确提示。

### 9.2 Token 管理

- Access Token 只保存在 React 内存状态，不写入 `localStorage`。
- Refresh Token 由 HttpOnly Cookie 管理，前端无法读取。
- Axios 设置 `withCredentials: true`。
- Axios 请求拦截器自动添加 Access Token。
- 遇到一次 `401` 时调用 `/api/auth/refresh`，刷新成功后仅重试一次原请求。
- 多个请求同时 `401` 时只允许一个刷新请求，其余请求等待，避免刷新风暴。
- 刷新失败时清空用户状态并回到登录状态。
- 页面初始化时先尝试刷新，再调用 `/api/auth/me` 恢复登录状态。

### 9.3 业务页面

- 保存创作时不再发送 `userId`。
- “我的创作”改用 `/api/users/me/creations`。
- 未登录用户触发 AI 或保存操作时打开短信登录弹窗。
- 退出按钮调用 `/api/auth/logout`，而不是只清除前端状态。

## 10. HTTPS 与 Cookie 前置条件

当前公网地址使用 HTTP 和 IP。生产环境使用 `Secure` Refresh Cookie 前，必须完成：

1. 准备域名并解析到服务器。
2. 使用 Nginx 反向代理 Node.js `127.0.0.1:5000`。
3. 使用有效证书启用 HTTPS。
4. 只对公网开放 `80/443`，关闭公网 `5000`。
5. 设置 `AUTH_COOKIE_SECURE=true`。

本地开发可暂时使用 `AUTH_COOKIE_SECURE=false`，但生产环境不得通过普通 HTTP 传输 Token 或短信登录请求。

## 11. 安全与风控

- 手机号发送接口同时按 IP、手机号限流。
- 登录核验接口限制连续失败次数，避免暴力枚举验证码。
- 对短信发送、核验失败、登录成功、刷新复用、退出登录记录安全审计日志，但手机号必须脱敏。
- 配置阿里云费用上限和异常告警。
- AccessKey 仅授予必要权限并定期轮换。
- 正确配置 Express `trust proxy`，确保 Nginx 后能获取真实客户端 IP。
- CORS 仅允许正式前端域名，不继续使用任意来源。
- 请求体增加长度限制；手机号、验证码使用严格格式校验。
- 对不同错误使用一致的外部响应，详细原因仅进入脱敏后的服务端日志。

## 12. 实施顺序

### 第一阶段：基础设施与阿里云验证

1. 确认短信认证控制台方案、RAM 权限及 SDK 请求字段。
2. 创建专用 RAM AccessKey，写入服务器 `.env`。
3. 实现阿里云发送/核验封装。
4. 用测试手机号完成发送和核验联调。

### 第二阶段：数据库与双 Token

1. 修改 Prisma 用户模型并增加 `RefreshSession`。
2. 生成并执行数据库迁移，操作前备份 SQLite。
3. 实现 JWT 签发、校验、哈希存储、轮换与撤销。
4. 实现短信登录、刷新、当前用户和退出接口。

### 第三阶段：业务接口鉴权

1. 实现 Access Token 中间件。
2. 改造创作保存和个人创作接口，不再接受客户端 `userId`。
3. 为 AI 接口增加登录校验、频率限制和并发限制。
4. 收紧 CORS、代理 IP 和错误响应。

### 第四阶段：前端接入

1. 改造首页短信登录弹窗。
2. 实现内存 Access Token 与自动刷新队列。
3. 接入 `/me`、退出、创作保存及个人创作接口。
4. 处理 Token 过期、刷新失败和未登录跳转。

### 第五阶段：HTTPS 与灰度上线

1. 配置域名、Nginx 和 HTTPS。
2. 在测试环境完成完整回归。
3. 备份数据库并部署迁移。
4. 小范围验证短信成本、刷新轮换和日志告警。
5. 正式启用 Secure Cookie，关闭公网 `5000`。

## 13. 测试清单

### 短信认证

- 合法手机号发送成功。
- 非法手机号不调用阿里云。
- 60 秒内重复发送被限制。
- 错误、过期验证码登录失败。
- 正确验证码首次登录自动创建用户。
- 已有用户再次登录不会重复创建。

### Token

- Access Token 可访问受保护接口。
- Access Token 过期后可用 Refresh Token 恢复。
- Refresh 后旧 Refresh Token 立即失效。
- 重放旧 Refresh Token 会触发会话链撤销。
- Access Token 不能调用 Refresh 接口。
- Refresh Token 不能作为 Bearer Token 访问业务接口。
- 退出后 Refresh Token 无法再次刷新。

### 权限

- 未登录不能保存创作或读取个人创作。
- 用户不能伪造 `userId` 读取或写入其他用户数据。
- 社区公开接口仍可匿名访问。
- AI 接口的频率和并发限制生效。

### 前端

- 刷新页面后能够静默恢复会话。
- 多请求同时过期只发送一次刷新请求。
- 刷新失败后正确退出登录。
- 手机号、验证码、倒计时和错误提示状态正确。

## 14. 验收标准

- 用户可以用短信验证码完成登录，首次登录自动创建账号。
- 后端不存储验证码，所有验证码结果以阿里云核验响应为准。
- Access Token 与 Refresh Token 使用独立密钥和独立用途。
- Refresh Token 支持哈希存储、轮换、退出撤销和重放检测。
- 所有个人数据和创作写入接口从 Token 获取用户身份，不信任客户端 `userId`。
- 浏览器无法通过 JavaScript 读取 Refresh Token。
- 生产登录流程全程使用 HTTPS。
- 短信发送具备限流、费用告警和脱敏审计日志。
