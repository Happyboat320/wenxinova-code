const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const DEEPSEEK_TRANSLATE_MODEL = process.env.DEEPSEEK_TRANSLATE_MODEL || DEEPSEEK_MODEL;
const AI_MOCK_MODE = process.env.AI_MOCK_MODE === 'true';

const CONTENT_SEP = '###CONTENT_START###';

// 风格化改编专用协议：前端据此渲染核心修改，普通正文展示时会移除全部控制符和理由。
const ADAPTATION_HIGHLIGHT_SYSTEM = `你是一位专业的文学改编专家，擅长根据用户需求对文学作品进行风格、叙事方式的改编。保持核心情节和人物关系。
在改编正文中，充分标记相较待处理内容发生实质变化的片段，例如关键情节重构、人物动机调整、叙事视角转换、场景重塑、代表性语言变化或风格化改写。改编篇幅在 1500 字以内时尽量标记 6-10 处，超过 1500 字时尽量每 300-500 字标记 1-2 处；不要标记纯标点变化，也不要把整篇正文一次性标记。
每处核心修改必须严格使用以下格式，三个控制符不得改写、嵌套或放入改编报告：
<<<CORE_CHANGE>>>实际出现在改编正文中的片段<<<CHANGE_REASON>>>不超过40字的具体修改理由<<<END_CORE_CHANGE>>>
除上述格式外，不要另列修改清单；正文去除控制符和理由后必须仍然完整、连贯。`;

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface DeepSeekResponse {
  choices?: Array<{
    message?: {
      content?: string;
      // DeepSeek 在思考模式下可能返回该字段；本项目只消费最终答案。
      reasoning_content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
  message?: string;
  code?: string | number;
}

interface DeepSeekStreamResponse {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
  error?: { message?: string };
  message?: string;
}

interface DeepSeekCallOptions {
  temperature?: number;
  max_tokens?: number;
  model?: string;
  signal?: AbortSignal;
  response_format?: { type: 'json_object' };
}

const MAX_API_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 300;
const RETRYABLE_ERROR_MESSAGE = '服务暂时繁忙，请稍后再试';

function getMockResponse(prompt: string): string {
  if (prompt.includes('剧本杀') && prompt.includes('故事大纲') && prompt.includes('每次输出')) {
    const seed = [...prompt].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const variants = [
      '沈砚将那封未封口的信压在案边，先前登记的落款日期却比纸上的墨迹晚了一日。掌管钥匙的顾蘅被迫说明当晚谁借走过侧门钥匙；她刚说出一个名字，廊下便传来锁舌回弹的声音。',
      '灯影移到屏风第三格时，陆衡发现案上香灰的断口朝向与众人描述相反。他没有立即指出，只让每个人按原站位重走一遍取物路线；走到窗前的人踩碎一粒藏在缝里的青瓷釉片，露出此前无人提及的暗格。',
      '谢棠把旧账册翻到夹页，发现其中一笔小额支出恰好对应那件遗物第一次失踪的日子。她抬头询问账房时，对方先回答了尚未问出口的地点；这句抢答使两人的旧关系从传闻变成了可以核对的事实。',
    ];
    return variants[seed % variants.length];
  }
  if (prompt.includes('请严格依据以下已生成的三幕故事大纲提取案件设置')) {
    return JSON.stringify({ '死者身份': '故事中的关键NPC', '案发场景': '三幕大纲明确的核心场所', '死亡原因': '依据大纲事件造成的致命伤害', '作案凶器': '大纲中出现并被角色接触的关键物件', '作案动机': '掩盖大纲中的核心秘密并阻止真相公开', '被谁发现': '大纲中最先到达现场的角色', '嫌疑人动向': '依据大纲行动路线整理的可疑时间线' });
  }
  if (prompt.includes('一次性生成完整的三幕故事大纲')) {
    const firstAct = `第一幕：背景与角色引入
酉时的闭市钟敲响前，沈砚带着县署盖印的货单进入临河纸坊，要求顾蘅在半个时辰内交出账上缺少的三刀澄心纸。顾蘅没有辩解，而是把库门钥匙放在六人中央：纸坊旧规规定，闭市后库门须由两名不同房头的人同时开锁，单独持钥者会被逐出行会。众人因此必须先公开各自当日去过的院落，再选出两人同行。谢棠拿出染坊收条，证明缺纸曾被裁成请帖；陆衡却认出收条背面的水纹只会出现在纸坊西槽，这使“货物从未入库”的说法无法成立。

六人分成两组查验前院账房与后院水槽。玩家可选择交换各自保管的半页货单，也可以暂时隐瞒落款来换取他人的路线信息；隐瞒者能先取得开库资格，却会在对照骑缝印时失去一次解释机会。沈砚在账房找到被重新装订的线孔，顾蘅在水槽捞出一角带朱砂指印的湿纸。两件东西拼在一起，恰好补出“寅末转入祠堂”的字样，但祠堂依行规只在祭纸日开放，今日值守的陆衡坚称自己从未开门。

众人按站位重走午后的运纸路线。谢棠发现顾蘅的鞋底没有河泥，却粘着祠堂香炉旁才有的白灰；顾蘅随即承认去过祠堂，但声称她是为了取回父亲留下的旧契。她愿意交出旧契，条件是众人先投票决定是否把缺纸一事报官。若立即报官，县役会封坊，所有人的私人物件都将被查验；若暂缓，六人必须在子时前自行补齐账目。投票尚未落定，库门内传出纸架倒地的闷响，而两把钥匙仍摆在桌上。`;
    const secondAct = `第二幕：关系与目标推进
顾蘅与沈砚同时开库，众人看见倒下的纸架后露出一道通往河埠的旧滑槽，槽口卡着半截蓝线。谢棠认出蓝线来自自己替陆衡补过的袖口，陆衡则要求当场检查所有人的衣袖。玩家必须在检查袖口与先封住河埠之间作出选择：先验衣能确认谁接触过滑槽，却会让河水冲走槽外的纸屑；先封河埠能保住漂浮物，却给持线者更换衣物的时间。无论选择哪一项，另一组都只能依据口供行动，因此两组交换信息时会出现一处可被质询的时间差。

从河埠捞回的不是失纸，而是一叠已经作废的婚书底纸。沈砚把底纸与旧契叠在灯下，发现两者的虫蛀孔完全重合，证明顾家旧契曾被拆开重抄。顾蘅承认父亲生前以纸坊作保替三户人偿债，若原契公开，纸坊会被债主接管；谢棠却指出婚书底纸上的三个名字正是被担保人，他们并非欠债，而是被行会除名后无法买纸谋生。此时玩家可以让顾蘅公开旧契换取三户证词，也可以让陆衡以值守身份调出祠堂名册；前者会动摇顾蘅的坊主资格，后者则会暴露陆衡私改名册的事实。

质询中，沈砚让每个人分别写下听见库内声响的时刻，再以闭市钟和水车停转的时刻校对。谢棠比其他人早一刻听见倒架声，说明她当时位于声音经滑槽传出的河埠，而不是自称的前院。她交出藏在袖中的另一截蓝线：有人用它牵动纸架，制造库内有人活动的假象。蓝线打的是船工结，六人中只有沈砚与陆衡会打。陆衡正要解释，祠堂方向忽然亮起三盏本应封存的验纸灯；按行规，三灯齐亮意味着有人正用原始水印核验一份足以改变坊产归属的契据。`;
    const thirdAct = `第三幕：结局与余韵
六人赶到祠堂时，验纸灯下摆着新旧两份契据，值夜老匠正按陆衡早先留下的口信等待见证人。陆衡承认改过名册并牵动纸架，但他的目的不是夺契：他发现沈砚带来的县署货单使用了已经停用半年的朱印，便制造声响逼众人同时进入库房，让所有人亲眼看见滑槽，免得顾蘅独自承担“监守自盗”的罪名。沈砚没有逃走，而是把自己的官凭压在桌上，要求众人先验证货单；玩家可用湿纸的纤维、账册线孔和验纸灯三项证据自由组合陈述，只有指出“伪货单诱使开库—滑槽转移旧契—封坊后低价接管纸坊”的完整次序，老匠才会交出原始水印版。

沈砚随后揭开真正身份：他受三户被除名纸工所托，伪造货单是为了迫使行会打开从不示人的旧账，但他隐瞒了封坊将使纸工彻底失去生计的代价。顾蘅必须在保住坊主名位与承认父亲篡改契据之间选择；谢棠也要决定是否公开自己协助运走婚书底纸的路线。两人若互相指责，老匠便依旧规收回水印版；若分别交出旧契和路线图，众人便能用两份材料证明三户纸工的份额从未失效。顾蘅最终把坊主印交给谢棠保管，自己在见证栏按下朱砂指印；谢棠则补上河埠时刻，承担私开滑槽的处罚。

子时前，六人共同重订账页：三户纸工恢复份额，纸坊改为由各房头轮值验账，任何转运都须留下双钥印与水槽纤维样。沈砚撤回伪货单并留下官凭作为赔偿抵押，陆衡当众撕去篡改过的名册页，却把蓝线结钉在库门旁，提醒后来者规则也可能被掌权者利用。闭市钟再次响起时，顾蘅亲手打开西槽，让第一张写有六人姓名的新纸浮出水面；每个人都看得见自己的选择被记录在何处，也清楚明日要为哪一项后果负责。`;
    return `${firstAct}\n\n${secondAct}\n\n${thirdAct}`;
  }
  if (prompt.includes('黛玉葬花参与') && prompt.includes('options')) {
    return JSON.stringify({
      options: [
        {
          playerLine: '二位且慢伤怀，落花虽去，情意尚可托于一抔净土。',
          replies: [
            { characterName: '林黛玉', content: '你也知落花不该委于浊流，倒算听懂了我这点痴意。' },
            { characterName: '贾宝玉', content: '这话正合我心，妹妹的花冢又添一位知音。' },
          ],
        },
        {
          playerLine: '若花有灵，想来也愿有人记得它盛放时的颜色。',
          replies: [
            { characterName: '林黛玉', content: '记得又如何，明年花发，旧人旧事未必仍在。' },
            { characterName: '贾宝玉', content: '既如此，我便日日记着，连同今日这句话一并不忘。' },
          ],
        },
      ],
    });
  }
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
  if (prompt.includes('线索设计要求')) {
    return '线索 01：沾泥的袖口\n类别：人物线索\n获得方式：搜查该角色的外衣后公开。\n卡面内容：右侧袖口沾有尚未干透的暗红色泥点，与后院窗下的土质相似。\n\n道具：旧木手杖\n外观：杖柄有一道新鲜裂痕。轻晃时，杖身内会传出细小的金属碰撞声。';
  }
  if (prompt.includes('角色') && prompt.includes('剧本')) {
    return '【第一幕】\n\n【场景：旧书店·傍晚】\n\n主角推开店门。门铃响过两声，柜台后的灯忽然熄灭。\n\n主角：（停下脚步）有人吗？\n\n里屋传来一阵急促的脚步声。\n\n店主：（隔着门）别再往前走。\n\n【第二幕】\n\n【场景：旧书店里屋·夜】\n\n主角握住门把手，迟疑片刻后推开了门。';
  }
  if (prompt.includes('翻译')) {
    return '【模拟译文】\n\n这是模拟生成的现代汉语译文，用于替代真实的 AI 翻译结果。';
  }
  if (prompt.includes('风格') || prompt.includes('改编')) {
    return '<<<ADAPTATION>>>\n【模拟改编结果】\n\n这是一段<<<CORE_CHANGE>>>加入夜雨追逐情节<<<CHANGE_REASON>>>强化悬疑节奏<<<END_CORE_CHANGE>>>的模拟改编内容。\n<<<REPORT>>>\n通过核心情节调整强化所选风格。';
  }
  if (prompt.includes('创作') || prompt.includes('续写')) {
    return '【模拟创作结果】\n\n这是一段模拟的创作内容。';
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
    // 不把服务配置细节暴露给用户，统一使用友好的稍后再试提示。
    console.error('DeepSeek 请求未配置 DEEPSEEK_API_KEY');
    throw new Error(RETRYABLE_ERROR_MESSAGE);
  }

  const requestBody: Record<string, unknown> = {
    model: options.model ?? DEEPSEEK_MODEL,
    messages,
    stream: false,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 2000,
    // 使用 deepseek-chat 的非思考模式，避免推理内容占用额度或混入正文。
    thinking: { type: 'disabled' },
  };
  // DeepSeek JSON Output 需要 response_format 和提示词同时约束，后续仍做结构校验。
  if (options.response_format) requestBody.response_format = options.response_format;

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_API_RETRIES; attempt += 1) {
    try {
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
        throw new Error(`DeepSeek API 调用失败（HTTP ${response.status}）：${data.error?.message || data.message || '未知错误'}`);
      }
      // 某些兼容 DeepSeek 的代理会将最终文本放到 reasoning_content，
      // 即使请求已关闭思考模式也可能出现该字段。优先使用正文，必要时回退，避免前端收到空值。
      const message = data.choices?.[0]?.message;
      const content = (message?.content || message?.reasoning_content)?.trim();
      if (!content) throw new Error('DeepSeek API 返回结果为空');
      return content;
    } catch (caught) {
      lastError = caught;
      // 请求被主动取消时无需重试，避免客户端断开后继续消耗 API 配额。
      if (options.signal?.aborted || attempt >= MAX_API_RETRIES) break;
      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
      console.warn(`DeepSeek 请求第 ${attempt + 1} 次失败，将在 ${delay}ms 后重试`);
      await new Promise<void>(resolve => setTimeout(resolve, delay));
    }
  }
  console.error('DeepSeek 请求最终失败:', lastError);
  throw new Error(RETRYABLE_ERROR_MESSAGE);
}

async function callDeepSeekAPIStream(
  messages: AIMessage[],
  onDelta: (content: string) => void,
  options: DeepSeekCallOptions = {},
): Promise<void> {
  const prompt = messages.map(message => message.content).join('\n');
  if (AI_MOCK_MODE) {
    onDelta(getMockResponse(prompt));
    return;
  }
  if (!DEEPSEEK_API_KEY) {
    console.error('DeepSeek 请求未配置 DEEPSEEK_API_KEY');
    throw new Error(RETRYABLE_ERROR_MESSAGE);
  }

  const requestBody: Record<string, unknown> = {
    model: options.model ?? DEEPSEEK_MODEL,
    messages,
    stream: true,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 2000,
    // 流式请求同样显式关闭思考模式。
    thinking: { type: 'disabled' },
  };

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
    signal: options.signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as DeepSeekResponse;
    throw new Error(`DeepSeek API 调用失败（HTTP ${response.status}）：${body.error?.message || body.message || '未知错误'}`);
  }
  if (!response.body) throw new Error('DeepSeek API 未返回可读取的流');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let emittedContent = false;
  const consumeLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line || line.startsWith(':') || !line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    const chunk = JSON.parse(data) as DeepSeekStreamResponse;
    if (chunk.error?.message || chunk.message) {
      throw new Error(chunk.error?.message || chunk.message);
    }
    const delta = chunk.choices?.[0]?.delta;
    const content = delta?.content || delta?.reasoning_content;
    if (content) {
      emittedContent = true;
      onDelta(content);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) consumeLine(line);
    if (done) break;
  }
  if (buffer.trim()) consumeLine(buffer);
  if (!emittedContent) throw new Error('DeepSeek API 返回结果为空');
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

async function processLongTextStream(
  systemPrompt: string,
  fullUserContent: string,
  onDelta: (content: string) => void,
  options: {
    temperature?: number;
    max_tokens?: number;
    model?: string;
    signal?: AbortSignal;
    maxChunkSize?: number;
  } = {},
): Promise<void> {
  const { maxChunkSize = 2000, ...apiOptions } = options;
  const separatorIndex = fullUserContent.indexOf(CONTENT_SEP);
  const instruction = separatorIndex === -1 ? '' : fullUserContent.substring(0, separatorIndex);
  const textToProcess = separatorIndex === -1
    ? fullUserContent
    : fullUserContent.substring(separatorIndex + CONTENT_SEP.length);
  const chunks = splitTextIntoChunks(textToProcess, maxChunkSize);

  for (let index = 0; index < chunks.length; index += 1) {
    const trimmedChunk = chunks[index].trim();
    if (!trimmedChunk) continue;
    if (index > 0) onDelta('\n\n');
    const content = instruction
      ? `${instruction}${CONTENT_SEP}${trimmedChunk}`
      : trimmedChunk;
    await callDeepSeekAPIStream(buildMessages(systemPrompt, content), onDelta, apiOptions);
  }
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

/** 翻译内容按模型增量直接下发，供阅读页边生成边展示。 */
export function translateToModernChineseStream(
  originalText: string,
  onDelta: (content: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const system = '你是一位严谨的古典文学翻译家，请将古典中文翻译为现代白话中文。要求精准传达原文含义与语气，保持自然流畅。';
  return processLongTextStream(system, `请将以下古文翻译为现代汉语：\n\n${CONTENT_SEP}${originalText}`, onDelta, {
    temperature: 0.45,
    max_tokens: 3200,
    model: DEEPSEEK_TRANSLATE_MODEL,
    signal,
  });
}

const SCRIPT_WORLD_CREATION_SYSTEM = `你是剧本杀世界设计师。世界观不是百科背景，而是玩家能够利用、触犯和验证的一组具体条件。只保留会改变角色权限、空间路线、资源交换、信息获取或选择后果的设定；每段都要有专名、明确约束、利益相关者和可观察后果。设定必须从所给文学素材和已选类型自然生长，不得用通用奇幻、悬疑或古风模板补齐，不得提前续写三幕剧情。禁止“文化底蕴深厚”“暗流涌动”“势力错综复杂”“为故事提供舞台”等空泛句。只输出可直接进入作品的世界观正文。`;

const SCRIPT_OUTLINE_CREATION_SYSTEM = `你是资深剧本杀总编。把已锁定的素材、世界观和角色关系写成能够实际开玩的连续事件，而不是剧情简介。先在内部逐项核对角色欲望、已知信息、可用资源和行动限制，再建立“角色因何行动→留下何种可观察变化→谁据此作出选择→选择造成何种代价”的因果链。每幕必须有带姓名的角色、明确地点、具体行动、可核对信息和至少一次能在桌面执行的互动；不得用“众人讨论、寻找线索、矛盾升级、真相大白、关系修复”等词替代实际过程。所有玩家都要以不可替代的行动影响局势，第三幕必须用具体决定及后果回收前文，不得用总结句代替结局。只输出指定三幕正文和规定标题。`;

function scriptCreationSystem(prompt: string): string {
  if (prompt.includes('一次性生成完整') && prompt.includes('三幕故事大纲')) return SCRIPT_OUTLINE_CREATION_SYSTEM;
  if (prompt.includes('世界观') && /玩家|游戏场域|人文地理/.test(prompt)) return SCRIPT_WORLD_CREATION_SYSTEM;
  return ADAPTATION_HIGHLIGHT_SYSTEM;
}

export async function adaptBook(translation: string, prompt: string): Promise<string> {
  const system = scriptCreationSystem(prompt);
  // 三幕大纲是固定格式的单次生成，降低随机性，避免幕次缺失或顺序漂移。
  const outlineRequest = prompt.includes('一次性生成完整的三幕故事大纲');
  return processLongText(system, `改编要求：${prompt}\n\n待处理内容：\n${CONTENT_SEP}${translation}`, {
    temperature: outlineRequest ? 0.2 : 0.7,
    // 三幕故事大纲需要一次输出完整内容，避免在第二幕中途被截断。
    max_tokens: 4500,
    maxChunkSize: 10000,
  });
}

export function adaptBookStream(translation: string, prompt: string, onDelta: (content: string) => void, signal?: AbortSignal) {
  const system = scriptCreationSystem(prompt);
  const outlineRequest = prompt.includes('一次性生成完整') && prompt.includes('三幕故事大纲');
  return processLongTextStream(system, `改编要求：${prompt}\n\n待处理内容：\n${CONTENT_SEP}${translation}`, onDelta, {
    temperature: outlineRequest ? 0.35 : 0.65,
    max_tokens: 4500,
    // 剧本大纲必须基于完整素材一次生成，不能按原文分块后拼接多个不完整结果。
    maxChunkSize: 10000,
    signal,
  });
}

export async function creativeWrite(originalText: string, prompt: string): Promise<string> {
  const system = '你是一位富有想象力的文学创作助手，擅长基于已有文本进行高质量的续写或二次创作。保持原有的艺术魅力，风格协调。';
  return processLongText(system, `创作要求：${prompt}\n\n基础文本：\n${CONTENT_SEP}${originalText}`, {
    temperature: 0.8,
    max_tokens: 2500,
  });
}

export function creativeWriteStream(originalText: string, prompt: string, onDelta: (content: string) => void, signal?: AbortSignal) {
  const system = '你是一位富有想象力的文学创作助手，擅长基于已有文本进行高质量的续写或二次创作。保持原有的艺术魅力，风格协调。';
  return processLongTextStream(system, `创作要求：${prompt}\n\n基础文本：\n${CONTENT_SEP}${originalText}`, onDelta, {
    temperature: 0.8,
    max_tokens: 2500,
    signal,
  });
}

/** 从已有生成结果的末尾续写，避免将长文分块后对每块各续写一次。 */
const SCRIPT_OUTLINE_CONTINUATION_SYSTEM = `你是负责改编古典文学素材的剧本杀总编，不是通用网文续写器。当前任务是把指定幕的既有正文继续写成可直接入稿的具体情节。

先在内部建立一条不可见的因果链：原文事实/意象 → 人物当下欲望与隐情 → 具体行动 → 可观察后果 → 下一步选择。只输出因果链落地后的正文，不输出分析过程。必须优先使用用户提供的改编素材、世界观、角色卡和当前幕正文中的专名、关系、物件与地点；素材中没有依据的元素不得用悬疑模板补齐。

每次输出都必须引入一个此前正文没有出现的新事实或新行动，并改变至少一个人物的处境、关系或选择。新内容必须能被时间、空间、物件状态、言行矛盾或行动路线验证；禁止用“众人意识到危险”“线索指向真相”“关系更加复杂”等抽象句替代事件。禁止复述背景、泛泛描写气氛、罗列流程、制造无来源的死者/凶手/证据。直接从上下文最后一个完整动作接写，输出叙事段落，不加标题、总结、解释或元话语。`;

const SCRIPT_WORLD_CONTINUATION_SYSTEM = `你是剧本杀世界设计师，当前任务只是补足已有世界观，不是续写故事或制造案件。只添加此前未出现、玩家能够利用、触犯或验证的具体规则；每段写明专名、约束对象、执行方式、受益或受限者，以及会留下的可观察后果。新设定必须改变权限、路线、资源、信息或选择代价，并与已有素材和类型一致。禁止复述已有设定、百科式风土介绍、情节总结、创作建议和空泛气氛句。只输出可直接追加到世界观中的正文。`;

function isScriptOutlineContinuation(requirement?: string): boolean {
  return /剧本杀/.test(requirement || '') && /故事大纲/.test(requirement || '');
}

function isScriptWorldContinuation(requirement?: string): boolean {
  return /剧本杀/.test(requirement || '') && /世界观/.test(requirement || '') && !/故事大纲/.test(requirement || '');
}

export async function continueWriting(existingContent: string, requirement?: string): Promise<string> {
  const context = existingContent.slice(-6000);
  const scriptOutline = isScriptOutlineContinuation(requirement);
  const scriptWorld = isScriptWorldContinuation(requirement);
  const instruction = requirement?.trim()
    ? `续写要求：${requirement.trim()}`
    : '请根据上文自由续写，自然推进情节。';
  return callDeepSeekAPI(buildMessages(
    scriptOutline ? SCRIPT_OUTLINE_CONTINUATION_SYSTEM : scriptWorld ? SCRIPT_WORLD_CONTINUATION_SYSTEM : '你是一位擅长长篇叙事的文学创作助手。请紧接现有内容续写，保持人物、文风、视角和情节连贯，不要重复上文。',
    `${instruction}\n\n现有内容（仅作上下文）：\n${CONTENT_SEP}${context}`,
  ), {
    temperature: scriptOutline ? 0.75 : scriptWorld ? 0.6 : 0.8,
    max_tokens: 2500,
  });
}

export function continueWritingStream(existingContent: string, requirement: string | undefined, onDelta: (content: string) => void, signal?: AbortSignal) {
  const context = existingContent.slice(-6000);
  const scriptOutline = isScriptOutlineContinuation(requirement);
  const scriptWorld = isScriptWorldContinuation(requirement);
  const instruction = requirement?.trim()
    ? `续写要求：${requirement.trim()}`
    : '请根据上文自由续写，自然推进情节。';
  return callDeepSeekAPIStream(buildMessages(
    scriptOutline ? SCRIPT_OUTLINE_CONTINUATION_SYSTEM : scriptWorld ? SCRIPT_WORLD_CONTINUATION_SYSTEM : '你是逻辑严密、擅长悬疑案件的剧本杀作家。续写必须从现有文本最后一个动作或事实开始，直接写可入稿的正文。禁止复述、总结、解释、教学、建议和元话语，禁止使用“接下来/续写/本幕将/需要/可以/以下”等套话。每一段必须包含具体的时间、地点、人物行动或可验证痕迹，并让至少一条因果链向前推进；没有新事件就不要写。保留已有角色和事实，不凭空改写已确定的真相。',
    `${instruction}\n\n现有内容（仅作上下文）：\n${CONTENT_SEP}${context}`,
  ), onDelta, { temperature: scriptOutline ? 0.78 : scriptWorld ? 0.62 : 0.85, max_tokens: 3200, signal });
}

const CHARACTER_SCRIPT_SYSTEM = `你是一位大师级悬疑作家兼剧本杀编剧。处理参考原文时，先在内部完成一轮不可见的续写与改编底稿：补足案发前史、人物之间相互牵制的关系、每人的公开目标与隐藏目标、可验证的行动因果，以及至少一条能够回收的伏笔；然后再把底稿改写为指定角色视角的分幕剧本。内部续写过程绝不输出。

把参考原文改编成指定角色版本的分幕剧本。

这是一次独立生成。只依据本次提供的参考原文和角色名，不沿用任何旧剧本、旧设定或旧输出结构。

输出格式是最高优先级规则：
1. 第一行必须是“【第一幕】”。之后直接进入场景，不写剧名、角色背景、角色秘密、角色目标、人际关系、时间轴、剧情简介、创作说明、结尾留白、你的任务或任何前言后记。
2. 每一幕使用独占一行的“【第X幕】”，每个场景使用独占一行的“【场景：地点·时段】”。必须创作多幕，系统会把一幕显示为一页。
3. 场景环境、人物动作和神态提示单独成段。每句对白单独成段，严格写成“角色名：台词”。对白内的表演提示写成“角色名：（动作或语气）台词”。
4. 纯舞台提示使用全角括号并单独成段，例如“（天玑抬眼看她，片刻后压低声音。）”。不得使用“幕启”“幕中”“画外音”等替代格式。
5. 不得把动作、旁白及多个人物对白挤在同一段；不得写小说式长篇独白；不得使用 Markdown 标题、项目符号、编号说明或表格。
6. 核心人物、时代气质和原文关键事实必须保留。允许在不违背原文的前提下，为剧本杀需要补写合理的前史、隐情、利益牵连、误导性行动和案件因果；新增内容必须服务于人物动机与可验证线索，不得无因堆砌反转，不得擅自改变人物生死或原作结局的核心意义。不同指定角色的版本可以在其所见、反应、对白和行动上有所变化。
7. 原文确有反复意象时才将其作为线索或时间标记；若没有稳定意象，改用场景动线、光线、声响、气味、天气、物件状态、书信或证词矛盾等可观察信号，禁止为了套模板强行添加月雨花灯等意象。
8. 只写角色能够参与或获知的场景，不使用全知视角，不揭示其未知的幕后信息。
9. 只输出剧本正文，不生成线索卡、道具卡、搜证内容、主持人手册、解析或谜底。

必须严格仿照以下排版，不要输出示例本身：
【第一幕】

【场景：书房·夜】

明意走到书房门口。房门自动打开，她走入，看到天玑正在书案后泡茶。

明意：（郑重行礼）星辰万古，福泽临渊，明意拜见极星神君。

天玑看着明意正经的动作，忍不住笑了，给她倒了杯茶。

天玑：这一整日，只怕唯有你和羞云对我行的礼，是真心的。

（天玑抬眼看她，片刻后压低声音。）

天玑：明意，你相信我能做这个神君么？`;

/** 最后一道格式保护：仅移除代码围栏和模型偶发的元说明，保留剧本的分幕、对白与任务格式。 */
function cleanCharacterStory(raw: string): string {
  const cleaned = raw
    .replace(/```(?:markdown|text)?/gi, '')
    .replace(/```/g, '')
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*#{1,6}\s*/, '').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const firstAct = cleaned.search(/^\s*【第一幕】\s*$/m);
  return firstAct >= 0 ? cleaned.slice(firstAct).trim() : cleaned;
}

const CLUE_SYSTEM = '你是一位专业的剧本杀线索设计师。先在内部梳理原文经隐性续写后形成的人物关系、公开目标、隐藏目标和案件因果，再输出与指定人物剧本严格一致、可直接投入游戏的线索卡和必要道具说明。线索必须能被现场、物件状态、行动路线、书信记录或证词矛盾验证；原文没有稳定反复意象时，不得强行制造月、雨、花、灯等意象，可使用其他可观察信号。不得输出个人任务、胜利条件、幕次、分页、时间轴、表格、DM 手册、幕后解析、完整谜底或复盘话术。';

export async function generateCharacterScript(originalText: string, characterName: string): Promise<string> {
  const story = await callDeepSeekAPI(buildMessages(
    CHARACTER_SCRIPT_SYSTEM,
    `指定视角角色：${characterName}\n\n参考原文：\n${originalText}`,
  ), {
    temperature: 0.65,
    max_tokens: 4500,
  });
  return cleanCharacterStory(story);
}

export async function generateCharacterScriptStream(originalText: string, characterName: string, onDelta: (content: string) => void, signal?: AbortSignal) {
  let story = '';
  await callDeepSeekAPIStream(buildMessages(
    CHARACTER_SCRIPT_SYSTEM,
    `指定视角角色：${characterName}\n\n参考原文：\n${originalText}`,
  ), content => { story += content; }, {
    temperature: 0.65,
    max_tokens: 4500,
    signal,
  });
  onDelta(cleanCharacterStory(story));
}

export async function generateScriptTasks(originalText: string, instruction: string): Promise<string> {
  const system = CLUE_SYSTEM;
  return processLongText(system, `线索设计要求：${instruction}\n\n改编所依据的原文：\n${CONTENT_SEP}${originalText}`, {
    temperature: 0.6,
    max_tokens: 4000,
    maxChunkSize: 48000,
  });
}

export function generateScriptTasksStream(originalText: string, instruction: string, onDelta: (content: string) => void, signal?: AbortSignal) {
  const system = CLUE_SYSTEM;
  return processLongTextStream(system, `线索设计要求：${instruction}\n\n改编所依据的原文：\n${CONTENT_SEP}${originalText}`, onDelta, {
    temperature: 0.6,
    max_tokens: 4000,
    signal,
    maxChunkSize: 48000,
  });
}

export async function customPrompt(content: string, prompt: string): Promise<string> {
  const system = '你是一位全能的古典文学处理专家，请严格按照用户的指令要求对提供的文本进行处理。';
  return processLongText(system, `指令要求：${prompt}\n\n文本内容：\n${CONTENT_SEP}${content}`, {
    temperature: 0.7,
    max_tokens: 2500,
  });
}

export function customPromptStream(content: string, prompt: string, onDelta: (content: string) => void, signal?: AbortSignal) {
  const system = '你是一位全能的古典文学处理专家，请严格按照用户的指令要求对提供的文本进行处理。';
  return processLongTextStream(system, `指令要求：${prompt}\n\n文本内容：\n${CONTENT_SEP}${content}`, onDelta, {
    temperature: 0.7,
    max_tokens: 2500,
    signal,
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

export interface JinlingParticipationOption {
  playerLine: string;
  replies: Array<{ characterName: string; content: string }>;
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

export async function generateFavoriteCharacterReply(
  character: CoPlayCharacterPrompt,
  history: CoPlayHistoryMessage[],
  userMessage: string,
): Promise<string> {
  if (AI_MOCK_MODE) {
    return `我是${character.name}。你方才所问，我会依照自己的经历与性情回应：${userMessage.slice(0, 80)}`;
  }

  const prompt = `你现在只扮演一个剧本杀收藏角色，与用户进行一对一对话。

角色名字：${character.name}
来源文本：${character.sourceTitle || '未知文本'}
人物属性：${character.description || '无'}
灵魂与记忆：${character.deeds || '无'}

近期对话：
${history.length ? history.map(message => `${message.role === 'user' ? '用户' : character.name}：${message.content}`).join('\n') : '尚未开始'}

用户最新消息：${userMessage}

请只以【${character.name}】的身份回答。回答必须贴合人物属性、灵魂与记忆、来源文本语气和经历；不要跳出角色，不要解释你是 AI，不要替用户发言。`;

  return callDeepSeekAPI([
    { role: 'system', content: '你是古典文学剧本杀角色扮演引擎，必须严格保持角色人设、记忆、语气和行动动机一致。' },
    { role: 'user', content: prompt },
  ], { temperature: 0.78, max_tokens: 1200 });
}

function parseJinlingParticipationOptions(raw: string, expectedNames: string[] = ['林黛玉', '贾宝玉']): JinlingParticipationOption[] {
  const value = parseJsonObject(raw) as { options?: unknown };
  if (!Array.isArray(value.options)) throw new Error('共演参与返回缺少 options');
  const expected = new Set(expectedNames);
  const options = value.options.map(item => {
    const row = item as { playerLine?: unknown; replies?: unknown };
    const replies = Array.isArray(row.replies)
      ? row.replies.map(reply => {
          const next = reply as { characterName?: unknown; content?: unknown };
          return {
            characterName: cleanString(next.characterName, 20),
            content: cleanString(next.content, 180),
          };
        }).filter(reply => expected.has(reply.characterName) && reply.content)
      : [];
    return {
      playerLine: cleanString(row.playerLine, 180),
      replies,
    };
  }).filter(option => option.playerLine && option.replies.length === 2).slice(0, 2);

  if (options.length !== 2) throw new Error('共演参与候选数量不完整');
  return options.map(option => ({
    playerLine: option.playerLine,
    replies: option.replies.map(reply => ({
      characterName: reply.characterName,
      content: reply.content,
    })),
  }));
}

export async function generateJinlingParticipationOptions(
  character: CoPlayCharacterPrompt,
  context: CoPlayHistoryMessage[],
  scene: 'jinling' | 'sangu' | 'water-margin' | 'journey' = 'jinling',
): Promise<JinlingParticipationOption[]> {
  const sangu = scene === 'sangu';
  const waterMargin = scene === 'water-margin';
  const journey = scene === 'journey';
  const expectedNames = sangu ? ['刘备', '诸葛亮', '关羽', '张飞'] : waterMargin ? ['鲁智深', '林冲', '张三', '李四'] : journey ? ['孙悟空', '铁扇公主', '猪八戒', '牛魔王'] : ['林黛玉', '贾宝玉'];
  if (AI_MOCK_MODE) {
    if (sangu) return [
      { playerLine: '皇叔三顾之诚，足令山川动容。', replies: [{ characterName: '刘备', content: '足下此言，愈教备不敢懈怠。' }, { characterName: '诸葛亮', content: '求贤以诚，亮已尽见。' }] },
      { playerLine: '卧龙既陈天下大势，何不即刻出山？', replies: [{ characterName: '关羽', content: '此问正合云长之意。' }, { characterName: '张飞', content: '说得好，俺正等先生一句准话！' }] },
    ];
    if (waterMargin) return [
      { playerLine: '师傅这等神力，俺愿在菜园里替你看守。', replies: [{ characterName: '鲁智深', content: '有这份心便好，少做恶事才是真。' }, { characterName: '林冲', content: '二位若能守义相助，实是难得。' }] },
      { playerLine: '倒拔垂杨柳之后，还请师傅指点枪棒。', replies: [{ characterName: '鲁智深', content: '指点谈不上，先把拳脚练扎实。' }, { characterName: '林冲', content: '师傅所言极是，练武贵在持久。' }] },
    ];
    if (journey) return [
      { playerLine: '大圣且慢，借扇为过山，莫把旧怨越结越深。', replies: [{ characterName: '孙悟空', content: '老孙只求路通，扇用过自然奉还。' }, { characterName: '铁扇公主', content: '说得轻巧，我儿之怨又该如何算？' }] },
      { playerLine: '既是镇山宝物，不如当面立约，灭火之后即刻归还。', replies: [{ characterName: '牛魔王', content: '若真能说到做到，我便听这一句。' }, { characterName: '猪八戒', content: '立约便立约，先救我师父过山要紧。' }] },
    ];
    return parseJinlingParticipationOptions(getMockResponse('黛玉葬花参与 options'));
  }

  const sceneTitle = sangu ? '三顾茅庐' : waterMargin ? '倒拔垂杨柳' : journey ? '三借芭蕉扇' : '黛玉葬花';
  const sceneDescription = sangu ? '《三国演义》“三顾茅庐”的刘备、诸葛亮、关羽、张飞对话' : waterMargin ? '《水浒传》“倒拔垂杨柳”的鲁智深、林冲、张三、李四对话' : journey ? '《西游记》“三借芭蕉扇”的孙悟空、铁扇公主、猪八戒、牛魔王对话' : '《红楼梦》“潇湘馆・黛玉葬花”的宝黛对话';
  const decisionBoundary = sangu
    ? '不要替刘备、诸葛亮、关羽或张飞决定是否出山或如何行动'
    : waterMargin
      ? '不要替鲁智深、林冲、张三或李四决定如何行动'
      : journey
        ? '不要替孙悟空、铁扇公主、猪八戒或牛魔王决定借扇、还扇或罢战'
        : '不要替林黛玉或贾宝玉作决定';
  const prompt = `${sceneTitle}参与生成任务。用户将以一个收藏角色插入${sceneDescription}。

参与角色：
名字：${character.name}
来源文本：${character.sourceTitle || '未知文本'}
人物属性：${character.description || '无'}
灵魂与记忆：${character.deeds || '无'}

当前剧情上下文：
${context.length ? context.map(message => `${message.characterName || '旁白'}：${message.content}`).join('\n') : '剧情刚开始'}

请生成两个可供用户选择的参与角色发言候选，并为每个候选生成${sangu || waterMargin || journey ? '在当前上下文中最相关的两位原场景人物' : '林黛玉和贾宝玉'}的即时回应。原场景人物只能从${expectedNames.join('、')}中选择。
要求：
1. playerLine 必须严格符合参与角色的人物属性、经历和语言气质。
2. 原场景人物的回应必须围绕 playerLine 改写，不沿用原固定台词。
3. 回应要贴合“${sceneTitle}”的情境、人物关系和各自语气。
4. 只能围绕当前“${sceneTitle}”场景，不得混入其他三个共演主题的人物、地点、事件或意象。
5. ${decisionBoundary}；不要跳出现代说明。
6. 每句不超过 70 个汉字，语言直接凝练。
7. options 数组必须恰好有 2 项，每项 replies 必须恰好有 2 项。

只输出合法 JSON，不使用 Markdown。格式：
{"options":[{"playerLine":"候选发言一","replies":[{"characterName":"${expectedNames[0]}","content":"人物回应"},{"characterName":"${expectedNames[1]}","content":"人物回应"}]},{"playerLine":"候选发言二","replies":[{"characterName":"${expectedNames[1]}","content":"人物回应"},{"characterName":"${expectedNames[0]}","content":"人物回应"}]}]}`;

  return callStructuredJson([
    { role: 'system', content: '你是古典文学互动剧情导演，擅长让外部角色自然插入经典名著场景，并保持所有人物语气一致。输出必须是机器可解析 JSON。' },
    { role: 'user', content: prompt },
  ], raw => parseJinlingParticipationOptions(raw, expectedNames), `${sceneTitle}参与`, {
    temperature: 0.68,
    max_tokens: 900,
  });
}
