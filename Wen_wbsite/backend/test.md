# 后端 API 测试手册

本文档包含用于手动测试后端的 `curl` 命令样例。建议在 `backend` 目录下通过终端运行。

## 基础配置
- **Base URL**: `http://localhost:5000`
- **Content-Type**: `application/json`

---

## 1. 系统/健康检查
测试服务器是否正常运行。

```bash
curl http://localhost:5000/health
```

---

## 2. 用户模块 (User)

### 注册用户
- **参数**: `phone` (必填)
```bash
curl -X POST http://localhost:5000/api/users/register \
     -H "Content-Type: application/json" \
     -d '{"phone": "13800138000"}'
```

### 用户登录
- **参数**: `phone` (必填)
```bash
curl -X POST http://localhost:5000/api/users/login \
     -H "Content-Type: application/json" \
     -d '{"phone": "13800138000"}'
```

### 保存创作
- **参数**:
     - `userId` (必填)
     - `prompt` (必填)
     - `content` (必填)
     - `bookId` (可选)
```bash
curl -X POST http://localhost:5000/api/users/creation \
           -H "Content-Type: application/json" \
           -d '{
                "userId": 1,
                "bookId": 1,
                "prompt": "请将这一段改编为现代白话文",
                "content": "改编后的文本内容222222"
           }'
```

### 获取个人创作历史
- **参数**: `userId` (路径参数)
```bash
curl http://localhost:5000/api/users/1/creations
```

---

## 3. 书籍模块 (Book)

### 获取书籍列表
- **参数**: `page` (可选，默认 1)
```bash
curl "http://localhost:5000/api/books?page=1"
```

### 获取书籍详情与内容
- **参数**: `id` (路径参数, 例如 1)
```bash
curl http://localhost:5000/api/books/1/content
```

### 获取书籍译文
- **说明**: 该接口先尝试从数据库获取译文，获取不到则调用 AI 翻译并存入数据库。
- **参数**: `id` (路径参数, 例如 1)
``` bash
curl -X POST http://localhost:5000/api/books/1/translation \
           -H "Content-Type: application/json" \
           -d '{}'
```

## 4. 改编与创造模块 (Adapt)

### 智能改编
- **参数**: 
  - `translation`: 原文/译文内容
  - `type`: 改编模式 (`adapt` | `creative` | `script` | `custom`)
  - `prompt`: 指令提示词（如果是 `script` 模式，此处填入角色名）
```bash
# 1. 普通改编 (默认)
curl -X POST http://localhost:5000/api/adapt \
     -H "Content-Type: application/json" \
     -d '{
       "translation": "崟骑着白马向东去，郑子骑驴向南行，进入升平北门，偶然遇见三位女子在路上行走，其中穿白衣的女子容貌美丽，郑子见了大为惊喜，策动驴子，忽前忽后地跟随，想要搭讪却不敢，白衣女子时时回望，似乎有所期待。郑子戏谑地说：\"美艳如斯，为何独自行走？\"白衣女子笑道：\"有坐骑却不愿相借，若不独自行走又为何？\"郑子说：\"我的坐骑不足以替代佳人的步履，现在暂且奉上，能让我跟随您一步，就足够了。\"两人相视大笑，同行者互相吸引，渐渐亲密。",
       "type": "adapt",
       "prompt": "保持叙事逻辑，改编为古龙笔下的武侠风格"
     }'

# 2. 角色剧本杀生成
curl -X POST http://localhost:5000/api/adapt \
     -H "Content-Type: application/json" \
     -d '{
       "translation": "崟骑着白马向东去，郑子骑驴向南行，进入升平北门，偶然遇见三位女子在路上行走，其中穿白衣的女子容貌美丽，郑子见了大为惊喜，策动驴子，忽前忽后地跟随，想要搭讪却不敢，白衣女子时时回望，似乎有所期待。郑子戏谑地说：\"美艳如斯，为何独自行走？\"白衣女子笑道：\"有坐骑却不愿相借，若不独自行走又为何？\"郑子说：\"我的坐骑不足以替代佳人的步履，现在暂且奉上，能让我跟随您一步，就足够了。\"两人相视大笑，同行者互相吸引，渐渐亲密。",
       "type": "script",
       "prompt": "韦崟"
     }'

# 3. 文学创作/续写
curl -X POST http://localhost:5000/api/adapt \
     -H "Content-Type: application/json" \
     -d '{
       "translation": "崟骑着白马向东去，郑子骑驴向南行，进入升平北门，偶然遇见三位女子在路上行走，其中穿白衣的女子容貌美丽，郑子见了大为惊喜，策动驴子，忽前忽后地跟随，想要搭讪却不敢，白衣女子时时回望，似乎有所期待。郑子戏谑地说：\"美艳如斯，为何独自行走？\"白衣女子笑道：\"有坐骑却不愿相借，若不独自行走又为何？\"郑子说：\"我的坐骑不足以替代佳人的步履，现在暂且奉上，能让我跟随您一步，就足够了。\"两人相视大笑，同行者互相吸引，渐渐亲密。",
       "type": "creative",
       "prompt": "以此为开头，续写一个关于离别与重逢的短篇"
     }'
```

## 5. 社区模块 (Community)

### 获取社区创作列表
- **参数**: `limit` (可选，默认 20)
- **注意**: 该接口仅返回创作的基本信息和作者/书籍名，不包含创作的具体 `content` 内容。
```bash
curl "http://localhost:5000/api/community/creations?limit=10"
```

### 获取创作详情
- **参数**: `id` (路径参数)
```bash
curl http://localhost:5000/api/community/creations/1
```


npx ts-node -e "import { PrismaClient } from '@prisma/client'; const p = new PrismaClient(); p.book.update({ where: { id: 1 }, data: { translatedText: null } }).then(() => console.log('Done'))"