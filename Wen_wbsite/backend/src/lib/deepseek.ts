const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const DEEPSEEK_TRANSLATE_MODEL = process.env.DEEPSEEK_TRANSLATE_MODEL || DEEPSEEK_MODEL;
const AI_MOCK_MODE = process.env.AI_MOCK_MODE === 'true';

const CONTENT_SEP = '###CONTENT_START###';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

function getMockResponse(prompt: string): string {
  if (prompt.includes('timeline') && prompt.includes('relationships')) {
    return JSON.stringify({
      timeline: [{ id: 'event-1', time: '故事开端', title: '人物登场', description: '主要人物相遇，故事由此展开。', characters: ['主角'] }],
      relationships: {
        nodes: [{ id: 'character-1', name: '主角', description: '故事核心人物' }],
        edges: [],
      },
    });
  }
  if (prompt.includes('翻译')) {
    return '【模拟译文】\n\n这是模拟生成的现代汉语译文，用于替代真实的 AI 翻译结果。';
  }
  if (prompt.includes('风格') || prompt.includes('改编')) {
    return '【模拟改编结果】\n\n这是一段模拟的改编内容。';
  }
  if (prompt.includes('创作') || prompt.includes('续写')) {
    return '【模拟创作结果】\n\n这是一段模拟的创作内容。';
  }
  if (prompt.includes('角色') && prompt.includes('剧本')) {
    return '【模拟角色剧本】\n\n角色背景：这是一位神秘的角色...\n\n你的秘密：你知道一些不为人知的事情...';
  }
  return '【模拟AI回复】\n\n您好！当前处于测试模式，未连接真实AI服务。';
}

async function callDeepSeekAPI(
  messages: AIMessage[],
  options: {
    temperature?: number;
    max_tokens?: number;
    model?: string;
    signal?: AbortSignal;
  } = {}
): Promise<string> {
  const prompt = messages.map(message => message.content).join('\n');
  if (AI_MOCK_MODE) {
    return getMockResponse(prompt);
  }

  if (!DEEPSEEK_API_KEY) {
    throw new Error('未配置 DEEPSEEK_API_KEY');
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: options.model ?? DEEPSEEK_MODEL,
      messages,
      stream: false,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 2000,
    }),
    signal: options.signal,
  });

  const responseText = await response.text();
  let data: DeepSeekResponse;

  try {
    data = JSON.parse(responseText) as DeepSeekResponse;
  } catch {
    throw new Error(`DeepSeek API 返回了无效响应（HTTP ${response.status}）`);
  }

  if (!response.ok) {
    throw new Error(`DeepSeek API 调用失败（HTTP ${response.status}）：${data.error?.message || '未知错误'}`);
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('DeepSeek API 返回结果为空');
  }

  return content;
}

function buildMessages(system: string, user: string): AIMessage[] {
  const outputConstraint = '仅输出改编、创作、翻译或剧本的结果文本，不要输出说明、解释、自我介绍或前后缀。';
  return [
    { role: 'system', content: `${system}\n\n${outputConstraint}` },
    { role: 'user', content: user },
  ];
}

async function processLongText(
  systemPrompt: string,
  fullUserContent: string,
  options: {
    temperature?: number;
    max_tokens?: number;
    model?: string;
    signal?: AbortSignal;
    maxChunkSize?: number;
  } = {}
): Promise<string> {
  const { maxChunkSize = 2000, ...apiOptions } = options;
  const separatorIndex = fullUserContent.indexOf(CONTENT_SEP);
  const instruction = separatorIndex === -1 ? '' : fullUserContent.substring(0, separatorIndex);
  const textToProcess = separatorIndex === -1
    ? fullUserContent
    : fullUserContent.substring(separatorIndex + CONTENT_SEP.length);
  const results: string[] = [];

  for (const chunk of splitTextIntoChunks(textToProcess, maxChunkSize)) {
    const trimmedChunk = chunk.trim();
    if (!trimmedChunk) continue;

    const content = instruction
      ? `${instruction}${CONTENT_SEP}${trimmedChunk}`
      : trimmedChunk;
    results.push(await callDeepSeekAPI(buildMessages(systemPrompt, content), apiOptions));
  }

  return results.join('\n\n');
}

function splitTextIntoChunks(text: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of text.split(/\n\s*\n/)) {
    if (currentChunk.length + paragraph.length + 2 > maxChunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
    }

    if (currentChunk.length > maxChunkSize) {
      let sentenceChunk = '';
      for (const sentence of currentChunk.split(/(?<=[。！？])/)) {
        if (sentenceChunk.length + sentence.length > maxChunkSize && sentenceChunk) {
          chunks.push(sentenceChunk.trim());
          sentenceChunk = sentence;
        } else {
          sentenceChunk += sentence;
        }
      }
      currentChunk = sentenceChunk;
    }
  }

  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks.filter(Boolean);
}

export async function translateToModernChinese(originalText: string): Promise<string> {
  const system = '你是一位严谨的古典文学翻译家，请将古典中文翻译为现代白话中文。要求精准传达原文含义与语气，保持自然流畅。';
  return processLongText(system, `请将以下古文翻译为现代汉语：\n\n${CONTENT_SEP}${originalText}`, {
    temperature: 0.45,
    max_tokens: 3200,
    model: DEEPSEEK_TRANSLATE_MODEL,
  });
}

export async function adaptBook(translation: string, prompt: string): Promise<string> {
  const system = '你是一位专业的文学改编专家，擅长根据用户需求对文学作品进行风格、叙事方式的改编。保持核心情节和人物关系。';
  return processLongText(system, `改编要求：${prompt}\n\n待处理内容：\n${CONTENT_SEP}${translation}`, {
    temperature: 0.7,
    max_tokens: 2500,
  });
}

export async function creativeWrite(originalText: string, prompt: string): Promise<string> {
  const system = '你是一位富有想象力的文学创作助手，擅长基于已有文本进行高质量的续写或二次创作。保持原有的艺术魅力，风格协调。';
  return processLongText(system, `创作要求：${prompt}\n\n基础文本：\n${CONTENT_SEP}${originalText}`, {
    temperature: 0.8,
    max_tokens: 2500,
  });
}

/** 从已有生成结果的末尾续写，避免将长文分块后对每块各续写一次。 */
export async function continueWriting(existingContent: string, requirement?: string): Promise<string> {
  const context = existingContent.slice(-6000);
  const instruction = requirement?.trim()
    ? `续写要求：${requirement.trim()}`
    : '请根据上文自由续写，自然推进情节。';
  return callDeepSeekAPI(buildMessages(
    '你是一位擅长长篇叙事的文学创作助手。请紧接现有内容续写，保持人物、文风、视角和情节连贯，不要重复上文。',
    `${instruction}\n\n现有内容（仅作上下文）：\n${CONTENT_SEP}${context}`,
  ), {
    temperature: 0.8,
    max_tokens: 2500,
  });
}

export async function generateCharacterScript(originalText: string, characterName: string): Promise<string> {
  const system = '你是一位专业的剧本杀编剧，擅长提取人物动机并编写深刻的角色剧本。请提供角色背景、秘密、目标、人际关系及关键行动时间轴。';
  return processLongText(system, `请根据以下内容，为【${characterName}】角色编写剧本杀剧本：\n\n${CONTENT_SEP}${originalText}`, {
    temperature: 0.65,
    max_tokens: 2500,
  });
}

export async function customPrompt(content: string, prompt: string): Promise<string> {
  const system = '你是一位全能的古典文学处理专家，请严格按照用户的指令要求对提供的文本进行处理。';
  return processLongText(system, `指令要求：${prompt}\n\n文本内容：\n${CONTENT_SEP}${content}`, {
    temperature: 0.7,
    max_tokens: 2500,
  });
}

export interface KnowledgeGraphData {
  timeline: Array<{ id: string; time: string; title: string; description: string; characters: string[] }>;
  relationships: {
    nodes: Array<{ id: string; name: string; description: string }>;
    edges: Array<{ source: string; target: string; relation: string; description: string }>;
  };
}

function parseKnowledgeGraph(raw: string): KnowledgeGraphData {
  const normalized = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const value = JSON.parse(normalized) as KnowledgeGraphData;
  if (!Array.isArray(value.timeline)
    || !Array.isArray(value.relationships?.nodes)
    || !Array.isArray(value.relationships?.edges)) {
    throw new Error('知识图谱 JSON 结构不完整');
  }
  const clean = (input: unknown, max: number) => typeof input === 'string' ? input.trim().slice(0, max) : '';
  const nodes = value.relationships.nodes.slice(0, 30).map((node, index) => ({
    id: clean(node.id, 50) || `character-${index + 1}`,
    name: clean(node.name, 30),
    description: clean(node.description, 200),
  })).filter(node => node.name);
  const nodeIds = new Set(nodes.map(node => node.id));
  return {
    timeline: value.timeline.slice(0, 30).map((event, index) => ({
      id: clean(event.id, 50) || `event-${index + 1}`,
      time: clean(event.time, 50) || `阶段 ${index + 1}`,
      title: clean(event.title, 80),
      description: clean(event.description, 500),
      characters: Array.isArray(event.characters) ? event.characters.map(name => clean(name, 30)).filter(Boolean).slice(0, 10) : [],
    })).filter(event => event.title),
    relationships: {
      nodes,
      edges: value.relationships.edges.slice(0, 80).map(edge => ({
        source: clean(edge.source, 50),
        target: clean(edge.target, 50),
        relation: clean(edge.relation, 50),
        description: clean(edge.description, 200),
      })).filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target && edge.relation),
    },
  };
}

/** 使用固定结构化提示词生成时间线和人物关系，返回前先做严格 JSON 清洗。 */
export async function generateKnowledgeGraph(title: string, author: string, originalText: string): Promise<KnowledgeGraphData> {
  const prompt = `请分析《${title}》（作者：${author || '佚名'}），生成知识图谱。严格只输出一个合法 JSON 对象，不使用 Markdown 代码块。结构必须为：
{"timeline":[{"id":"event-1","time":"原文中的时间或叙事阶段","title":"事件标题","description":"事件及因果说明","characters":["人物名"]}],"relationships":{"nodes":[{"id":"character-1","name":"人物名","description":"身份、性格与作用"}],"edges":[{"source":"character-1","target":"character-2","relation":"关系名称","description":"关系依据及变化"}]}}
要求：时间线按故事顺序列出 5-20 个关键事件；人物节点 2-20 个；边的 source/target 必须使用 nodes 中的 id；只依据原文，不虚构。
原文：
${originalText.slice(0, 30000)}`;
  const raw = await callDeepSeekAPI([
    { role: 'system', content: '你是古典文学知识图谱专家，擅长从原文提取事件顺序与人物关系。输出必须是机器可解析的 JSON。' },
    { role: 'user', content: prompt },
  ], { temperature: 0.2, max_tokens: 4000 });
  const graph = parseKnowledgeGraph(raw);
  if (!graph.timeline.length || !graph.relationships.nodes.length) throw new Error('知识图谱内容为空');
  return graph;
}

export async function chat(
  message: string,
  history: AIMessage[] = [],
  context?: { originalText: string },
  signal?: AbortSignal
): Promise<string> {
  const systemContent = context?.originalText
    ? `你是“文心新述”古典小说智能改编平台的 AI 助手。参考原文：\n${context.originalText}`
    : '你是“文心新述”古典小说智能改编平台的 AI 助手，职责是帮助用户理解和改编古典文学作品。';
  return callDeepSeekAPI([
    { role: 'system', content: systemContent },
    ...history,
    { role: 'user', content: message },
  ], {
    temperature: 0.6,
    max_tokens: 2000,
    signal,
  });
}
