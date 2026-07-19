# API 修改记录

## 书籍列表接口分页

**接口**: `GET /api/books`

**修改内容**:
- 添加了可选查询参数 `page` (默认为 1)。
- 接口现在返回分页后的数据，每页 10 条。
- 返回值结构从 `Book[]` 更改为对象结构。

**输入参数**:
- `page` (query, number): 请求页码，从 1 开始。

**输出结构**:
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "list": [
      {
        "id": 1,
        "title": "书籍名称",
        "author": "作者"
      },
      ...
    ],
    "totalPages": 5,
    "currentPage": 1,
    "totalCount": 42
  }
}
```

**代码变动**:
- [backend/src/modules/book/book.service.ts](backend/src/modules/book/book.service.ts): 修改 `getBookList` 函数以支持分页逻辑和 count 查询。
- [backend/src/modules/book/book.router.ts](backend/src/modules/book/book.router.ts): 修改路由处理程序以从查询字符串中提取 `page` 并传递给服务层。

## 书籍译文与改编 API

**1. 获取书籍译文**
- **接口**: `POST /api/books/:id/translation`
- **说明**: 
  - 自动管理译文缓存：先尝试从数据库获取已生成的译文。
  - 若无缓存：调用 AI 使用固定提示词进行翻译，并将结果存入数据库供下次使用。
- **参数**: `{}` (不再接收 `prompt` 输入)

**2. 智能改编与创作**
- **接口**: `POST /api/adapt`
- **说明**: 提供多模式文学处理能力，包括风格改编、续写创作、剧本杀角色编写及自定义指令。
- **参数**: 
  - `translation`: (string) 基础文本或译文。
  - `type`: (string) 模式，可选值：`adapt` (默认, 改编), `creative` (创作), `script` (剧本杀), `custom` (自定义)。
  - `prompt`: (string) 具体指令或参数（剧本杀模式下填入角色名）。
- **示例**:
  - 改编: `{ "translation": "...", "type": "adapt", "prompt": "改编为武侠风" }`
  - 创作: `{ "translation": "...", "type": "creative", "prompt": "以此为开篇续写一段故事" }`
  - 剧本杀: `{ "translation": "...", "type": "script", "prompt": "宁采臣" }`
  - 自定义: `{ "translation": "...", "type": "custom", "prompt": "提取文中出现的所有地名" }`

# 以上是对原有接口的改动，以下则是新增接口

## 用户管理与创作记录 API

**1. 用户注册**
- **接口**: `POST /api/users/register`
- **说明**: 根据手机号创建用户，如果手机号已存在则返回现有用户。
- **参数**: `{ "phone": "13800000000" }`

**2. 用户登录**
- **接口**: `POST /api/users/login`
- **说明**: 校验手机号是否存在。
- **参数**: `{ "phone": "13800000000" }`

**3. 保存创作记录**
- **接口**: `POST /api/users/creation`
- **说明**: 保存生成的文学创作内容。
- **参数**: `{ "userId": 1, "bookId": 2, "prompt": "关键词/提示词", "content": "生成的内容" }`

**4. 获取个人历史创作**
- **接口**: `GET /api/users/:userId/creations`
- **说明**: 获取指定用户的所有创作历史。

## 社区作品展示 API

**1. 获取社区最新创作**
- **接口**: `GET /api/community/creations`
- **说明**: 获取最近分享到社区的创作列表。接口不返回 `content` 大文本字段，仅返回元数据。
- **可选参数**: `limit` (默认 20)

**2. 获取创作详情**
- **接口**: `GET /api/community/creations/:id`
- **说明**: 获取单篇创作的详细内容，包括详细文本内容 `content` 以及关联的用户和书籍信息。

---

## 前端 API 使用说明

### 代码位置
前端所有与后端交互的 API 调用代码都集中定义在：
[frontend/src/api/index.ts](frontend/src/api/index.ts)

### 如何使用
1. **封装方式**：
   前端使用 `axios` 库对原生 `fetch` 进行了封装，统一处理了 `BaseURL` (目前为 `http://localhost:5000/api`)。

2. **调用示例**：
   在组件（如 `LibraryPage.tsx`）中，可以直接导入并调用 API 函数：
   ```typescript
   import { getBookList } from '../api';

   // 调用分页后的书籍列表
   const fetchData = async (page: number) => {
     try {
       const data = await getBookList(page); // 现已支持传入 page 参数
       setBooks(data.list);
       setTotalPages(data.totalPages);
     } catch (err) {
       console.error(err);
     }
   };
   ```

3. **新增 API 处理**：
   已经定义了用户相关（`userLogin`, `saveCreation`, `getUserCreations`）和社区相关（`getCommunityCreations`, `getCreationDetail`）的接口封装，直接导入即可使用。
