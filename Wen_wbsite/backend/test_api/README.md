# DeepSeek 翻译 API 测试

运行：

```bash
npm run test:deepseek-translation
```

脚本从 `texts/唐宋传奇选.txt` 的《任氏传》原文中截取 200、1000、3000 字三个样本，每个样本向 DeepSeek 翻译 API 顺序请求 3 次。测试不会连接或写入数据库。

输出包括：

- `耗时报告.md`：耗时汇总和逐次请求明细
- `results.json`：结构化原始指标
- `samples/`：实际发送的文本
- `responses/`：每次请求返回的完整译文

脚本默认读取项目 `.env` 中的 DeepSeek 配置。可用 `DEEPSEEK_BENCHMARK_TIMEOUT_MS` 单独设置每次请求的超时时间（默认 180000 毫秒）。重新运行会覆盖上一次测试结果。
