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

interface DeepSeekCallOptions {
  temperature?: number;
  max_tokens?: number;
  model?: string;
  signal?: AbortSignal;
  response_format?: { type: 'json_object' };
}

function getMockResponse(prompt: string): string {
  if (prompt.includes('角色分析') && prompt.includes('characters')) {
    return JSON.stringify({
      characters: [
        { name: '模拟角色甲', description: '沉稳果决的关键人物', deeds: '在故事关键处挺身决断，推动矛盾转折。' },
        { name: '模拟角色乙', description: '心思细密的旁观者', deeds: '多次观察众人言行，暗中保存重要线索。' },
      ],
    });
  }
  if (prompt.includes('数字共演') && prompt.includes('messages')) {
    return JSON.stringify({
      messages: [
        { characterName: '模拟角色甲', content: '此地风声不定，我愿先听诸位如何判断。' },
        { characterName: '模拟角色乙', content: '既入此局，便当各陈本心，不可只作旁观。' },
      ],
    });
  }
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
  options: DeepSeekCallOptions = {}
): Promise<string> {
  const prompt = messages.map(message => message.content).join('\n');
  if (AI_MOCK_MODE) {
    return getMockResponse(prompt);
  }

  if (!DEEPSEEK_API_KEY) {
    throw new Error('未配置 DEEPSEEK_API_KEY');
  }

  const requestBody: Record<string, unknown> = {
    model: options.model ?? DEEPSEEK_MODEL,
    messages,
    stream: false,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 2000,
  };
  // DeepSeek JSON Output 需要 response_format 和提示词同时约束，后续仍做结构校验。
  if (options.response_format) requestBody.response_format = options.response_format;

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
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

export interface CharacterAnalysisItem {
  id: number;
  name: string;
  description: string | null;
  deeds: string | null;
}

function cleanJsonText(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

function extractJsonObject(raw: string): string {
  const text = cleanJsonText(raw);
  if (text.startsWith('{') && text.endsWith('}')) return text;

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) return text.slice(start, index + 1);
    }
  }
  return text;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const value = JSON.parse(extractJsonObject(raw)) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('JSON 根节点必须是对象');
  }
  return value as Record<string, unknown>;
}

async function callStructuredJson<T>(
  messages: AIMessage[],
  parser: (raw: string) => T,
  label: string,
  options: DeepSeekCallOptions = {},
): Promise<T> {
  const raw = await callDeepSeekAPI(messages, { ...options, response_format: { type: 'json_object' } });
  try {
    return parser(raw);
  } catch (firstError) {
    // 长文本下模型偶尔会混入解释或漏字段；只允许一次修复，修复后仍不合格就暴露真实错误。
    const repaired = await callDeepSeekAPI([
      { role: 'system', content: '你是严格的 JSON 修复器。只输出可由 JSON.parse 解析的合法 JSON 对象，不要解释。' },
      {
        role: 'user',
        content: `请修复下面的 ${label} 输出，使其符合原任务要求。解析错误：${firstError instanceof Error ? firstError.message : '未知错误'}\n\n原始输出：\n${raw}`,
      },
    ], { ...options, temperature: 0, response_format: { type: 'json_object' } });
    try {
      return parser(repaired);
    } catch (secondError) {
      throw new Error(`${label} JSON 解析失败：${secondError instanceof Error ? secondError.message : '未知错误'}`);
    }
  }
}

function cleanString(input: unknown, maxChars: number): string {
  if (typeof input !== 'string') return '';
  return Array.from(input.trim()).slice(0, maxChars).join('');
}

export function parseCharacterAnalysis(raw: string): CharacterAnalysisItem[] {
  const value = parseJsonObject(raw) as { characters?: unknown };
  if (!Array.isArray(value.characters)) throw new Error('角色分析 JSON 缺少 characters 数组');
  const characters = value.characters.map((item, index) => {
    const row = item as { name?: unknown; description?: unknown; deeds?: unknown };
    return {
      id: -(index + 100),
      name: cleanString(row.name, 20),
      description: cleanString(row.description, 30) || null,
      deeds: cleanString(row.deeds, 100) || null,
    };
  }).filter(character => character.name).slice(0, 6);
  if (characters.length < 1) throw new Error('角色分析结果为空');
  return characters;
}

export async function analyzeCharactersForCoPlay(originalText: string): Promise<CharacterAnalysisItem[]> {
  if (AI_MOCK_MODE) {
    return parseCharacterAnalysis(getMockResponse('角色分析 characters'));
  }
  const prompt = `请进行角色分析，并严格输出一个合法 JSON 对象，不使用 Markdown，不输出解释文字。
JSON 结构必须为：
{"characters":[{"name":"角色名","description":"不超过30字的身份、性格及人物关系简介","deeds":"不超过100字的主要事迹"}]}

要求：
1. 只依据原文，提取最适合剧本杀和数字共演的 3-6 个主要角色。
2. description 不超过 30 个汉字。
3. deeds 必须概括该角色在原文中的主要事迹，不超过 100 个汉字。
4. 每个对象只能包含 name、description、deeds 三个字段。

原文：
${originalText.slice(0, 30000)}`;
  return callStructuredJson([
    { role: 'system', content: '你是古典文学角色分析专家。必须返回可由 JSON.parse 解析的 JSON 对象，根字段为 characters。' },
    { role: 'user', content: prompt },
  ], parseCharacterAnalysis, '角色分析', {
    temperature: 0.2,
    max_tokens: 1800,
  });
}

export interface KnowledgeGraphData {
  timeline: Array<{ id: string; time: string; title: string; description: string; characters: string[] }>;
  relationships: {
    nodes: Array<{ id: string; name: string; description: string }>;
    edges: Array<{ source: string; target: string; relation: string; description: string }>;
  };
}

export function parseKnowledgeGraph(raw: string): KnowledgeGraphData {
  const value = parseJsonObject(raw) as { timeline?: unknown; relationships?: { nodes?: unknown; edges?: unknown } };
  if (!Array.isArray(value.timeline)
    || !Array.isArray(value.relationships?.nodes)
    || !Array.isArray(value.relationships?.edges)) {
    throw new Error('知识图谱 JSON 结构不完整');
  }
  const clean = (input: unknown, max: number) => cleanString(input, max);
  const nodes = value.relationships.nodes.slice(0, 6).map((item, index) => {
    const node = item as { id?: unknown; name?: unknown; description?: unknown };
    return {
      id: clean(node.id, 50) || `character-${index + 1}`,
      name: clean(node.name, 30),
      description: clean(node.description, 200),
    };
  }).filter(node => node.name);
  const nodeIds = new Set(nodes.map(node => node.id));
  const nodeNames = new Set(nodes.map(node => node.name));
  return {
    timeline: value.timeline.slice(0, 30).map((item, index) => {
      const event = item as { id?: unknown; time?: unknown; title?: unknown; description?: unknown; characters?: unknown };
      return {
        id: clean(event.id, 50) || `event-${index + 1}`,
        time: clean(event.time, 50) || `阶段 ${index + 1}`,
        title: clean(event.title, 80),
        description: clean(event.description, 500),
        characters: Array.isArray(event.characters)
          ? event.characters.map(name => clean(name, 30)).filter(name => name && nodeNames.has(name)).slice(0, 6)
          : [],
      };
    }).filter(event => event.title),
    relationships: {
      nodes,
      edges: value.relationships.edges.slice(0, 80).map(item => {
        const edge = item as { source?: unknown; target?: unknown; relation?: unknown; description?: unknown };
        return {
          source: clean(edge.source, 50),
          target: clean(edge.target, 50),
          relation: clean(edge.relation, 50),
          description: clean(edge.description, 200),
        };
      }).filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target && edge.relation),
    },
  };
}

/** 使用固定结构化提示词生成时间线和人物关系，返回前先做严格 JSON 清洗。 */
export async function generateKnowledgeGraph(title: string, author: string, originalText: string): Promise<KnowledgeGraphData> {
  const prompt = `请分析《${title}》（作者：${author || '佚名'}），生成知识图谱。严格只输出一个合法 JSON 对象，不使用 Markdown 代码块。结构必须为：
{"timeline":[{"id":"event-1","time":"原文中的时间或叙事阶段","title":"事件标题","description":"事件及因果说明","characters":["人物名"]}],"relationships":{"nodes":[{"id":"character-1","name":"人物名","description":"身份、性格与作用"}],"edges":[{"source":"character-1","target":"character-2","relation":"关系名称","description":"关系依据及变化"}]}}
要求：时间线按故事顺序列出 5-20 个关键事件；人物节点只保留最重要的 2-6 个主要人物；边的 source/target 必须使用 nodes 中的 id；只依据原文，不虚构。
原文：
${originalText.slice(0, 30000)}`;
  const graph = await callStructuredJson([
    { role: 'system', content: '你是古典文学知识图谱专家，擅长从原文提取事件顺序与人物关系。输出必须是机器可解析的 JSON。' },
    { role: 'user', content: prompt },
  ], parseKnowledgeGraph, '知识图谱', { temperature: 0.2, max_tokens: 4000 });
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

export interface CoPlayCharacterPrompt {
  name: string;
  description?: string | null;
  deeds?: string | null;
  sourceTitle?: string | null;
}

export interface CoPlayHistoryMessage {
  role: string;
  characterName?: string | null;
  content: string;
}

export interface CoPlayTurnMessage {
  characterName: string;
  content: string;
}

function parseCoPlayMessages(raw: string, expectedNames: string[]): CoPlayTurnMessage[] {
  const normalized = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const value = JSON.parse(normalized) as { messages?: Array<{ characterName?: unknown; content?: unknown }> };
  if (!Array.isArray(value.messages)) throw new Error('数字共演返回缺少 messages');
  const expected = new Set(expectedNames);
  const used = new Set<string>();
  const messages = value.messages.map(item => ({
    characterName: typeof item.characterName === 'string' ? item.characterName.trim().slice(0, 40) : '',
    content: typeof item.content === 'string' ? item.content.trim().slice(0, 1200) : '',
  })).filter(item => item.characterName && item.content);
  for (const message of messages) {
    if (!expected.has(message.characterName)) throw new Error(`数字共演返回了未选择角色：${message.characterName}`);
    if (used.has(message.characterName)) throw new Error(`数字共演返回了重复角色：${message.characterName}`);
    used.add(message.characterName);
  }
  if (messages.length !== expectedNames.length) throw new Error('数字共演返回角色数量不完整');
  return messages;
}

export async function generateCoPlayTurn(
  scene: string,
  characters: CoPlayCharacterPrompt[],
  history: CoPlayHistoryMessage[],
): Promise<CoPlayTurnMessage[]> {
  if (AI_MOCK_MODE) {
    return characters.map(character => ({
      characterName: character.name,
      content: `我乃${character.name}。此刻置身“${scene.slice(0, 40)}”，愿据自身经历与诸位一议。`,
    }));
  }
  const expectedNames = characters.map(character => character.name);
  const prompt = `数字共演场景：
${scene}

角色发言顺序和人设：
${characters.map((character, index) => `${index + 1}. ${character.name}
来源：${character.sourceTitle || '未知作品'}
人设简介：${character.description || '无'}
主要事迹：${character.deeds || '无'}`).join('\n\n')}

近期对话：
${history.length ? history.map(message => `${message.role === 'user' ? '用户' : message.characterName || '角色'}：${message.content}`).join('\n') : '尚未开始'}

请严格按照上述角色顺序，让每个角色各发言一次。每句发言需符合该角色的人设、主要事迹、所属作品语气与当前场景；角色之间要回应已有上下文，不要替用户发言。
只输出合法 JSON，不使用 Markdown。格式：
{"messages":[{"characterName":"${expectedNames[0] || '角色名'}","content":"角色发言"}]}`;

  const raw = await callDeepSeekAPI([
    { role: 'system', content: '你是古典文学数字共演导演，擅长让不同作品人物在统一场景中保持人设、语气和事迹一致。输出必须是机器可解析 JSON。' },
    { role: 'user', content: prompt },
  ], { temperature: 0.75, max_tokens: Math.min(4000, 800 + characters.length * 320) });
  return parseCoPlayMessages(raw, expectedNames);
}
