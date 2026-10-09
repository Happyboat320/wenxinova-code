# 文心新述

古典文学阅读、智能改编与数字共演网站。

## 项目结构

- `Wen_wbsite/frontend/`：React、Vite、TypeScript 前端。
- `Wen_wbsite/backend/`：Express、Prisma 后端及测试、导入脚本。
- `Wen_wbsite/deploy/`：Nginx 与 systemd 部署配置。

本地运行见 [项目说明](Wen_wbsite/README.md)，部署见 [部署说明](Wen_wbsite/DEPLOYMENT.md)，书库导入见 [导入指南](Wen_wbsite/backend/docs/IMPORT_GUIDE.md)。

## 本地文件与版本管理

保留源码、依赖锁文件、数据库迁移、环境变量示例及网站实际使用的静态资源。
真实环境变量、密钥、数据库、导入数据、依赖、构建产物、备份、压缩包及测试生成的报告不进入源码仓库。

历史素材归档在本地 `Wen_wbsite/archive/`，该目录由 Git 忽略。
部署或恢复网站时，需另外提供 `.env`、数据库及书库导入数据；不要将数据库备份放入前端 `public/`。

## 验证

```bash
cd Wen_wbsite/frontend
pnpm run build

cd ../backend
pnpm run build
pnpm test
```
