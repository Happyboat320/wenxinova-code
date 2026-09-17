import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const LIBRARY_FILE = join(TEST_DIR, '..', 'texts', '唐宋传奇选.txt');
const SAMPLE_LENGTHS = [200, 1000, 3000] as const;
const RUNS_PER_SAMPLE = 3;
const API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';
const API_KEY = process.env.DEEPSEEK_API_KEY || '';
const MODEL = process.env.DEEPSEEK_TRANSLATE_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const REQUEST_TIMEOUT_MS = Number(process.env.DEEPSEEK_BENCHMARK_TIMEOUT_MS || 180_000);

interface DeepSeekResponse {
  id?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}

interface RunResult {
  sampleLength: number;
  run: number;
  success: boolean;
  durationMs: number;
  responseChars: number;
  responseFile?: string;
  requestId?: string;
  usage?: DeepSeekResponse['usage'];
  error?: string;
}

function chars(text: string): string[] {
  return Array.from(text);
}

function extractOriginal(libraryText: string): string {
  const originalMarker = '原文：';
  const annotationMarker = '注释：';
  const originalStart = libraryText.indexOf(originalMarker);
  if (originalStart === -1) throw new Error(`文库文件中未找到“${originalMarker}”`);

  const contentStart = originalStart + originalMarker.length;
  const annotationStart = libraryText.indexOf(annotationMarker, contentStart);
  const original = libraryText.slice(contentStart, annotationStart === -1 ? undefined : annotationStart);
  return original.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function percentile50(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function fixed(value: number): string {
  return value.toFixed(2);
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

async function translate(text: string): Promise<{ data: DeepSeekResponse; durationMs: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = performance.now();

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: '你是一位严谨的古典文学翻译家，请将古典中文翻译为现代白话中文。要求精准传达原文含义与语气，保持自然流畅。仅输出译文，不要输出说明、解释、自我介绍或前后缀。',
          },
          { role: 'user', content: `请将以下古文翻译为现代汉语：\n\n${text}` },
        ],
        stream: false,
        temperature: 0.45,
        max_tokens: 8192,
        thinking: { type: 'disabled' },
      }),
      signal: controller.signal,
    });

    const responseText = await response.text();
    const durationMs = performance.now() - startedAt;
    let data: DeepSeekResponse;
    try {
      data = JSON.parse(responseText) as DeepSeekResponse;
    } catch {
      throw new Error(`HTTP ${response.status}：API 返回的不是有效 JSON`);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}：${data.error?.message || '未知错误'}`);
    }
    if (!data.choices?.[0]?.message?.content?.trim()) {
      throw new Error(`HTTP ${response.status}：API 返回译文为空`);
    }
    return { data, durationMs };
  } finally {
    clearTimeout(timeout);
  }
}

function buildReport(results: RunResult[], sourceFile: string, generatedAt: string): string {
  const successful = results.filter(result => result.success);
  const summaryRows = SAMPLE_LENGTHS.map(sampleLength => {
    const all = results.filter(result => result.sampleLength === sampleLength);
    const ok = all.filter(result => result.success);
    const times = ok.map(result => result.durationMs);
    const avg = times.length ? times.reduce((sum, value) => sum + value, 0) / times.length : 0;
    const throughput = avg > 0 ? sampleLength / (avg / 1000) : 0;
    return `| ${sampleLength} | ${ok.length}/${all.length} | ${times.length ? fixed(avg) : '-'} | ${times.length ? fixed(percentile50(times)) : '-'} | ${times.length ? fixed(Math.min(...times)) : '-'} | ${times.length ? fixed(Math.max(...times)) : '-'} | ${times.length ? fixed(throughput) : '-'} |`;
  });

  const detailRows = results.map(result => {
    const usage = result.usage;
    const status = result.success ? '成功' : `失败：${escapeTableCell(result.error || '未知错误')}`;
    const link = result.responseFile ? `[查看译文](./${encodeURI(result.responseFile)})` : '-';
    return `| ${result.sampleLength} | ${result.run} | ${status} | ${fixed(result.durationMs)} | ${result.responseChars || '-'} | ${usage?.prompt_tokens ?? '-'} | ${usage?.completion_tokens ?? '-'} | ${usage?.total_tokens ?? '-'} | ${link} |`;
  });

  return `# DeepSeek 翻译 API 耗时报告

生成时间：${generatedAt}  
源文本：\`${sourceFile}\`（《唐宋传奇选·任氏传》原文）  
模型：\`${MODEL}\`  
API：\`${API_URL}\`  
执行方式：200、1000、3000 字三个档位，每档顺序请求 ${RUNS_PER_SAMPLE} 次；计时包含网络传输及模型生成时间，不包含读取文件和写入结果文件的时间。  
数据库：未连接、未读取、未写入。

## 汇总

| 输入字数 | 成功次数 | 平均耗时 (ms) | 中位耗时 (ms) | 最小耗时 (ms) | 最大耗时 (ms) | 平均吞吐 (输入字/秒) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${summaryRows.join('\n')}

总计成功 ${successful.length}/${results.length} 次。

## 每次请求明细

| 输入字数 | 第几次 | 状态 | 耗时 (ms) | 译文字数 | 输入 tokens | 输出 tokens | 总 tokens | 结果 |
| ---: | ---: | :--- | ---: | ---: | ---: | ---: | ---: | :--- |
${detailRows.join('\n')}

## 说明

- 字数按 Unicode 字符计算，三个样本均从同一篇原文开头截取，便于横向比较。
- 原始样本保存在 \`samples/\`，每次成功请求的完整译文保存在 \`responses/\`。
- 完整结构化数据见 [results.json](./results.json)。
`;
}

async function main(): Promise<void> {
  if (!API_KEY) throw new Error('未配置 DEEPSEEK_API_KEY，无法执行真实 API 测试');
  if (process.env.AI_MOCK_MODE === 'true') {
    throw new Error('AI_MOCK_MODE=true；本脚本只执行真实 DeepSeek API 测试，请关闭 Mock 模式');
  }
  if (!Number.isFinite(REQUEST_TIMEOUT_MS) || REQUEST_TIMEOUT_MS <= 0) {
    throw new Error('DEEPSEEK_BENCHMARK_TIMEOUT_MS 必须是正数');
  }

  const libraryText = await readFile(LIBRARY_FILE, 'utf8');
  const original = extractOriginal(libraryText);
  const originalChars = chars(original);
  const maxLength = Math.max(...SAMPLE_LENGTHS);
  if (originalChars.length < maxLength) {
    throw new Error(`原文字数不足：需要 ${maxLength} 字，实际 ${originalChars.length} 字`);
  }

  const samplesDir = join(TEST_DIR, 'samples');
  const responsesDir = join(TEST_DIR, 'responses');
  await mkdir(samplesDir, { recursive: true });
  await mkdir(responsesDir, { recursive: true });

  const results: RunResult[] = [];
  for (const sampleLength of SAMPLE_LENGTHS) {
    const sample = originalChars.slice(0, sampleLength).join('');
    await writeFile(join(samplesDir, `${sampleLength}-chars.txt`), sample, 'utf8');

    for (let run = 1; run <= RUNS_PER_SAMPLE; run += 1) {
      process.stdout.write(`[${sampleLength} 字] 第 ${run}/${RUNS_PER_SAMPLE} 次：`);
      const fallbackStartedAt = performance.now();
      try {
        const { data, durationMs } = await translate(sample);
        const translation = data.choices?.[0]?.message?.content?.trim() || '';
        const responseFile = `${sampleLength}-chars-run-${run}.txt`;
        await writeFile(join(responsesDir, responseFile), translation, 'utf8');
        results.push({
          sampleLength,
          run,
          success: true,
          durationMs,
          responseChars: chars(translation).length,
          responseFile: `responses/${responseFile}`,
          requestId: data.id,
          usage: data.usage,
        });
        console.log(`成功，${fixed(durationMs)} ms`);
      } catch (caught) {
        const durationMs = performance.now() - fallbackStartedAt;
        const error = caught instanceof Error ? caught.message : String(caught);
        results.push({ sampleLength, run, success: false, durationMs, responseChars: 0, error });
        console.log(`失败，${fixed(durationMs)} ms，${error}`);
      }
    }
  }

  const generatedAt = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: false,
  }).format(new Date());
  const output = {
    generatedAt,
    sourceFile: basename(LIBRARY_FILE),
    model: MODEL,
    apiUrl: API_URL,
    runsPerSample: RUNS_PER_SAMPLE,
    sampleLengths: SAMPLE_LENGTHS,
    databaseUsed: false,
    results,
  };
  await writeFile(join(TEST_DIR, 'results.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  await writeFile(join(TEST_DIR, '耗时报告.md'), buildReport(results, basename(LIBRARY_FILE), generatedAt), 'utf8');
  console.log(`测试完成：${join(TEST_DIR, '耗时报告.md')}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
