import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import * as api from '@/api';
import { AuthContext } from '@/contexts/authContext';

type Character = { id: number; name: string; description: string | null };
type Props = { bookId: number; title: string; sourceTitle?: string; originalText: string; translation: string; translationLoading: boolean; onRequestTranslation: () => Promise<boolean>; characters: Character[] };
const steps = ['剧本类型与人数','世界观构建','角色设计（核心）','故事大纲（三幕式）','分角色剧本','整合剧本'];
const MIN_ACT_LENGTH = 500;
// 不用固定句子填充短幕次或残缺结尾；质量不足时明确拒绝，避免套话进入成稿。
const normalizeAct = (text: string) => text.trim();
const OUTLINE_BOILERPLATE = /(?:主要人物在既定世界观下|彼此目标与矛盾逐步显现|围绕核心秘密展开行动|关系(?:变得|更加)复杂|线索指向(?:下一步危险|真相)|冲突(?:逐步升级|得到收束)|所有悬念(?:均|都)?(?:有回应|得到回应)|众人终于完成最后的选择|有助于推动剧情|为后续(?:剧情|情节)埋下伏笔)/;
const WORLD_BOILERPLATE = /(?:文化底蕴(?:十分|非常)?深厚|局势暗流涌动|各方势力(?:盘根错节|错综复杂)|为(?:后续)?故事提供(?:了)?(?:广阔的)?舞台|充满了无限可能|一切皆有可能)/;
const hasCompleteSentenceEnding = (text: string) => /[。！？.!?」』）)]\s*$/.test(text.trim());
const types = ['情感本','欢乐本','恐怖本','机制阵营本','硬核还原本','本格本','变格本'];
const recommend: Record<string, number> = { 情感本: 6, 欢乐本: 6, 恐怖本: 7, 机制阵营本: 8, 硬核还原本: 6, 本格本: 6, 变格本: 7 };
const typeProfiles: Record<string, string> = {
  情感本: '【情感本硬性契约】以温暖关系、陪伴、理解、成长和和解为核心；冲突优先来自误会、选择、承诺、重逢、共同完成心愿等现实关系，不设置案件、凶手、谋杀或阴暗阴谋，不以死亡和悲剧作为煽情捷径，结局必须给角色希望、修复或圆满。',
  欢乐本: '【欢乐本硬性契约】核心体验是让玩家持续发笑、互相接梗、完成荒诞但安全的共同目标，并以热闹庆典/团圆/圆满收束。世界观必须有喜剧规则、可玩任务、反差身份或善意误会；人物必须各自有鲜明笑点、夸张但可理解的欲望和互相成就的关系；大纲必须按“闹剧起因→误会升级→合作解决→全员庆祝”推进。禁止死亡、尸体、凶手、案件、谋杀、复仇、阴谋、灭口、刑讯、沉重创伤、恐怖压迫、悲剧结局和为了反转而反转；冲突只能是误会、比赛、竞选、筹备、丢失物品、身份错位、规则挑战等低风险事件，所有玩家角色必须安全存活且结局积极好笑。',
  恐怖本: '以氛围、未知感、探索和克服恐惧为核心，优先使用安全的悬念、传说或异常现象；不默认死亡，只有素材明确需要时才设置危险。恐怖来自未知和体验，不把血腥、虐待和沉重悲剧当作默认内容。',
  机制阵营本: '以合作或友好竞争、资源分配、谈判和规则博弈为核心，冲突服务于目标与成长；不默认阴谋、案件或死亡。',
  硬核还原本: '以严谨梳理原文事实、时间线和人物选择为核心，可还原事件、谜题或历史过程；不默认案件或死者，优先呈现真实抉择、因果和历史现场。',
  本格本: '以现实逻辑、观察和问题解决为核心，可根据原文需要设计谜题或事件；不强行添加案件、阴谋或死亡。',
  变格本: '以原文基础上的特殊想象、奇趣规则或超现实体验为核心，强调探索与主题表达；是否有危险、案件或死亡完全由素材和创作需要决定。',
};
const blank = (name = '') => ({ name, gender: '未知', age: '', race: '', job: '', relation: '', family: '', love: '', personality: '', position: '玩家' });
const SCRIPT_KILLER_RULES = '创作总原则：先忠实理解改编素材，再按所选类型扩写；不得把案件、阴谋、死亡、复仇或悲剧当作默认情节。故事应保留原文人物、场景、关系、主题和时代气质，新增内容必须从素材自然生长。情感本、欢乐本必须积极温暖、轻松圆满，即使原文悲苦也要重构为希望与好结局，禁止死者、案件、阴谋和强行悲剧；其他类型也只有在原文或类型确有必要时才引入危险与负面事件。如格式模板出现“案发”等字样但类型并不需要，必须改写为关系推进或主题事件，不得照抄。如剧情确实包含死者，死者只能是 NPC，所有玩家角色必须保持存活。';
const TYPE_CONTRACT = (type: string) => type === '欢乐本'
  ? '欢乐本逐环节锁定：世界观先定义喜剧场域、庆典目标、互动规则和安全边界；角色必须有可表演的笑点、误会来源、公开愿望与合作价值；大纲只能围绕低风险闹剧、任务、比赛、筹备、身份错位和善意误会推进，三幕分别完成起笑、升级、圆满庆祝；分角色剧本必须每幕都有可执行的搞笑行动、至少两轮轻松对白和与他人合作的选择。全程禁用死亡、尸体、案件、凶手、谋杀、阴谋、复仇、灭口、恐怖、沉重创伤和悲剧结局。'
  : type === '情感本'
    ? '情感本逐环节锁定：每一环都必须服务于关系、陪伴、理解、成长与和解，冲突不升级为案件或死亡，结局积极温暖。'
    : `当前类型逐环节锁定：${typeProfiles[type] || ''}`;
const FORBIDDEN_HAPPY = /死亡|死者|尸体|凶手|谋杀|杀人|案发|案件|阴谋|复仇|灭口|刑讯|悲剧|恐怖|血案|自杀/;
const summarizeClueContent = (value: string) => {
  const cleaned = value.replace(/^\s*(?:【[^】]*·线索】|\[[^\]]*·线索\])\s*/, '').replace(/^\s*(?:线索\s*[一二三四五六七八九十百\d]+)\s*[：:]\s*/, '').replace(/^\s*(?:现场物证|时间线索|素材对应线索|角色专属|密码线索|卡面内容|获得方式)\s*[：:]\s*/, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const phrases: string[] = [];
  const add = (phrase: string) => {
    const item = phrase.replace(/^(?:的|与|和|在|于|被|有|曾|却|但|并|一处|一件|一张|一封)/, '').replace(/(?:出现|留下|显示|表明|发生|存在|发现|记录|说明|用于|能够|可以)$/, '').trim();
    if (item.length >= 2 && !phrases.some(existing => existing === item || existing.includes(item) || item.includes(existing))) phrases.push(item.slice(0, 12));
  };
  // 优先提取“具体名词 + 可验证动作”两侧的短语，而不是整句。
  [...cleaned.matchAll(/([\u4e00-\u9fff]{2,10})(?:出现|留下|藏有|放着|压着|持有|转移|发出|传来|闻到|听见|记得|提到)/g)].forEach(match => add(match[1]));
  [...cleaned.matchAll(/(?:出现|留下|藏有|放着|压着|持有|转移|发出|传来|闻到|听见|记得|提到)(?:了|着)?(?:一方|一柄|一枚|一封|一张|一只|一件|一块|一把)?([\u4e00-\u9fff]{2,10})/g)].forEach(match => add(match[1]));
  const concrete = ['钥匙','书信','气味','脚印','伤痕','泥点','划痕','蜡屑','日期','门闩','铃声','布片','手杖','玉佩','药瓶','印记','时间差','证词矛盾'];
  concrete.forEach(word => { if (cleaned.includes(word)) add(word); });
  if (!phrases.length) add(cleaned.split(/[，。；！？、\n]/)[0]);
  return phrases.slice(0, 3).join('、').slice(0, 32);
};
const extractClueItems = (text: string) => {
  const normalized = text
    .replace(/^\s*(?:【[^】]*·线索】|\[[^\]]*·线索\])\s*$/gm, '')
    .replace(/^\s*地点\s*[/／]?\s*场景[：:].*$/gm, '')
    .trim();
  // 以“线索一/线索1”为边界保留完整段落，避免把细节、来源和因果拆成数条残缺套话。
  const matches = [...normalized.matchAll(/(?:^|\n)\s*(?:[-*]\s*)?线索\s*[一二三四五六七八九十百\d]+\s*[：:]\s*([\s\S]*?)(?=\n\s*(?:[-*]\s*)?线索\s*[一二三四五六七八九十百\d]+\s*[：:]|$)/g)];
  const contents = matches.length ? matches.map(match => match[1].trim()) : normalized.split(/\n\s*\n+/).map(block => block.trim()).filter(Boolean);
  return contents.map((content, i) => {
  const body = content.replace(/^【[^】]*·线索】\s*/, '').replace(/^\[[^\]]*·线索\]\s*/, '').replace(/^[-*\d.、\s]*(?:线索\s*[一二三四五六七八九十\d]+)?[：:]?\s*/, '').trim();
  const object = body.match(/(?:藏有|放着|压着|有|发现)\s*(?:一方|一柄|一枚|一封|一张|一只|一件|一块|一把)?\s*([^，。；、\s]{2,8})/)?.[1];
  return { id: Date.now() + i, name: object || `线索${i + 1}`, content: summarizeClueContent(body), category: '公开', level: '深入', role: '', where: '' };
  });
};
const cleanClueContent = (value: string) => value.replace(/^\s*(?:【[^】]*·线索】|\[[^\]]*·线索\])\s*/g, '').trim();
const stripOutlineMeta = (value: string) => value
  .split(/\n+/)
  .filter(line => !/(?:该故事大纲|本故事|本剧本|严格围绕|类型契约|创作说明|主题是|主题为|体现了|旨在|以下内容|故事分析|剧本分析)/.test(line.trim()))
  .join('\n').replace(/人物继续交流并完成新的共同目标，彼此的理解在具体行动中加深，温暖而积极的选择带来可见的改变。?/g, '').replace(/^(?:故事大纲|大纲)\s*[:：]\s*/i, '').trim();

type MaterialPortrait = {
  names: string[]; locations: string[]; objects: string[];
  conflict: string; crime: string; clueTheme: string; setting: string; object: string; motif: string; hash: number;
  adaptationSeed: string;
};

const PORTRAIT_STOPWORDS = new Set('我们你们他们她们自己因为所以但是如果然后于是这个那个可以已经没有以及一个一种其中现在只是还有进行相关作为出现作者本文故事人物内容'.split(''));
const LOCATION_SUFFIXES = ['府','宅','院','楼','阁','寺','庙','宫','城','镇','村','渡','桥','江','河','客栈','书院','衙门','营','关'];
const OBJECT_WORDS = '剑琴印簪画书卷册信笺玉佩香炉酒杯药瓶令牌玉玺遗嘱账本地图钥匙鼓钟'.split('');

function materialPortrait(text: string, characters: Character[], title: string): MaterialPortrait {
  const source = text || title || '';
  const chars = [...source];
  const counts = new Map<string, number>();
  for (let i = 0; i < chars.length - 1; i += 1) {
    const pair = chars[i] + chars[i + 1];
    if (/^[\u4e00-\u9fff]{2}$/.test(pair) && ![...pair].some(c => PORTRAIT_STOPWORDS.has(c))) counts.set(pair, (counts.get(pair) || 0) + 1);
  }
  const frequent = [...counts.entries()].sort((a, b) => b[1] - a[1]).filter(([, n]) => n >= 2).map(([w]) => w);
  const names = [...new Set([...characters.map(c => c.name), ...frequent.filter(w => /[侯史阮马李王张赵刘孙周吴曹贾林薛]/.test(w))])].filter(Boolean).slice(0, 8);
  const locations = [...new Set([...frequent.filter(w => LOCATION_SUFFIXES.some(s => w.endsWith(s))), ...LOCATION_SUFFIXES.filter(s => source.includes(s)).map(s => source.slice(Math.max(0, source.indexOf(s) - 1), source.indexOf(s) + 1))])].slice(0, 5);
  const objects = [...new Set([...OBJECT_WORDS.filter(w => source.includes(w)), ...frequent.filter(w => OBJECT_WORDS.some(o => w.includes(o)))])].slice(0, 6);
  const pick = (list: string[], fallback: string) => list[0] || fallback;
  const setting = pick(locations, '原作核心场域'); const object = pick(objects, '关键遗物'); const motif = '未解旧事';
  const conflict = /婚|情|爱|相思|友情|亲情/.test(source) ? '关系与选择' : /战争|兵|国|乱|军/.test(source) ? '共同目标与立场' : /官|朝|政|税|科举/.test(source) ? '责任与理想' : /复仇|仇|血/.test(source) ? '创伤与和解' : '误会与成长';
  const crime = /毒|药|病/.test(source) ? '投毒伪装成旧疾' : /火|焚|烧/.test(source) ? '纵火灭证' : /溺|水|江|河/.test(source) ? '溺亡并制造意外' : /刀|剑|刺|杀/.test(source) ? '近身袭击后伪造现场' : '利用关键物件制造可控意外';
  const clueTheme = objects.length ? `${object}的持有、转移与损坏痕迹` : '原文反复出现的措辞、行动与证词矛盾';
  const hash = chars.reduce((sum, char) => sum + char.charCodeAt(0), 0);
  // 这是供后续生成使用的“隐性改编底稿”：先补足人物关系、未言明的动机和因果，再进入剧本杀结构。
  const adaptationSeed = `在不改变《${title}》原文核心人物、关系、时代气质与关键事实的前提下，先进行隐性续写：补足${names.slice(0, 3).join('、') || '主要人物'}的前史、日常行动、未言明的情感或利益牵连，让${object}成为有来源、有使用痕迹的关键物件。续写必须只从原文已有场景、人物和冲突生长，不得凭空引入无关世界观；再按照所选剧本杀类型改写为可互动的故事文本。`;
  return { names, locations, objects, conflict, crime, clueTheme, setting, object, motif, hash, adaptationSeed };
}

export default function ScriptKillerWorkspace({ bookId, title, sourceTitle, originalText, translation, translationLoading, onRequestTranslation, characters }: Props) {
  const { user, openLogin } = useContext(AuthContext);
  const canonicalTitle = sourceTitle || title;
  const storageKey = `scriptProject:${canonicalTitle}:${originalText.length}:${originalText.slice(0, 48)}`;
  const [projectTitle, setProjectTitle] = useState(canonicalTitle); const [editingTitle, setEditingTitle] = useState(false);
  const [step, setStep] = useState(0); const [collapsed, setCollapsed] = useState(false); const [sourceMode, setSourceMode] = useState<'original'|'translation'>('original');
  const [type, setType] = useState('情感本'); const [players, setPlayers] = useState(6); const [name, setName] = useState('');
  const [world, setWorld] = useState<Record<string,string>>({}); const [worldText, setWorldText] = useState('');
  const [roles, setRoles] = useState<any[]>([]); const [acts, setActs] = useState(['','', '']); const [actTab, setActTab] = useState(0); const [actRoles, setActRoles] = useState<boolean[]>([]);
  const [roleScripts, setRoleScripts] = useState<Record<string, string>>({});
  const [integrationRoleDesigns, setIntegrationRoleDesigns] = useState<Record<string, string>>({});
  const [selectedRoleScript, setSelectedRoleScript] = useState('');
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [outlineText, setOutlineText] = useState('');
  const [continueAct, setContinueAct] = useState(0);
  const [caseData, setCaseData] = useState<Record<string,string>>({}); const [clues, setClues] = useState<any[]>([]); const [clueText, setClueText] = useState(''); const [manual, setManual] = useState(''); const [review, setReview] = useState(''); const [integratedScript, setIntegratedScript] = useState(''); const [integrationOpen, setIntegrationOpen] = useState(false); const [integrationAct, setIntegrationAct] = useState<0|1>(0);
  const [generation, setGeneration] = useState(0); const [continuing, setContinuing] = useState(false); const [generating, setGenerating] = useState(false);
  const [generatingStep, setGeneratingStep] = useState<number | null>(null);
  const [creationDraftId, setCreationDraftId] = useState<number | undefined>();
  const [draftSaving, setDraftSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const creationSaving = draftSaving || publishing;
  const [hydrated, setHydrated] = useState(false);
  const contentRevision = useRef(0);
  const source = sourceMode === 'translation' ? translation : originalText;
  useEffect(() => {
    if (!integrationOpen) return;
    const onArrowClick = (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest('button');
      if (button?.textContent?.includes('返回修改')) { setIntegrationOpen(false); setIntegrationAct(0); setStep(0); return; }
      if (integrationAct !== 1) return;
      const target = event.target as HTMLElement;
      const dialog = target.closest('.sk-integration-dialog') as HTMLElement | null;
      if (!dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left && event.clientX > rect.left - 90 && event.clientY > rect.top && event.clientY < rect.bottom) setIntegrationAct(0);
    };
    document.addEventListener('click', onArrowClick, true);
    return () => document.removeEventListener('click', onArrowClick, true);
  }, [integrationOpen, integrationAct]);
  const sourceBasis = (source || title || '原著素材').replace(/\s+/g, ' ').slice(0, 180);
  const sourceSignals = useMemo(() => materialPortrait(source, characters, title), [source, title, characters]);
  const environmentHint = '案发现场的光线、声响、气味、天气与物件状态';
  // 各创作环节共用一份精简“故事圣经”，避免每次请求重新猜测人物和案件事实。
  const continuityContext = useMemo(() => {
    const mainNames = [...new Set([...characters.map(c => c.name), ...roles.map(r => r.name), ...sourceSignals.names])].filter(Boolean).slice(0, 12);
    const clip = (value: string, max = 900) => value.replace(/\s+/g, ' ').slice(0, max);
    return `${SCRIPT_KILLER_RULES}\n${TYPE_CONTRACT(type)}\n改编素材原型：${clip(source, 3200)}\n原型书名：${canonicalTitle}\n原型主要人物（必须优先沿用，不得擅自改名、改身份或改生死）：${mainNames.join('、') || '以原文人物为准'}\n已确定剧本杀类型与人数（后续所有环节必须严格遵循，不得偏离）：${type}，${players}人\n原型场景：${sourceSignals.setting}；关键物件：${sourceSignals.object}；核心冲突：${sourceSignals.conflict}；案件方向：${sourceSignals.crime}\n当前已确定世界观：${clip(worldText)}\n当前角色卡：${clip(roles.map(r => `${r.name}|${r.position}|${r.job}|${r.relation}`).join('；'))}\n当前三幕大纲：${clip(acts.join('；'))}\n当前案件：${clip(Object.entries(caseData).map(([k, v]) => `${k}:${v}`).join('；'))}\n当前线索：${clip(clues.map(c => c.content).join('；'))}\n主持人手册与复盘锚点：${clip(`${manual} ${review}`, 700)}`;
  }, [source, canonicalTitle, characters, roles, sourceSignals, worldText, acts, caseData, clues, type, players]);
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (s) { setProjectTitle(canonicalTitle); setType(s.type || '情感本'); setPlayers(s.players || 6); setName(s.name || ''); setWorld(s.world || {}); setWorldText(s.worldText || ''); setRoles(s.roles || []); setRoleScripts(s.roleScripts || {}); setIntegrationRoleDesigns(s.integrationRoleDesigns || {}); setSelectedRoleScript(s.selectedRoleScript || s.roles?.[0]?.name || ''); setActs(s.acts || ['', '', '']); setOutlineText(s.outlineText || (s.acts || ['', '', '']).join('\n\n')); setCaseData(s.caseData || {}); setClues((s.clues || []).map((c: any) => ({ ...c, content: summarizeClueContent(c.content || '') }))); setClueText(s.clueText || s.clues?.map((c: any) => c.content).join('\n') || ''); setManual(s.manual || ''); setReview(s.review || ''); setIntegratedScript(s.integratedScript || ''); } } catch {} finally { setHydrated(true); } }, [storageKey, canonicalTitle]);
  useEffect(() => {
    if (!user || !hydrated) return;
    api.getDraft(bookId, 'script').then(draft => {
      if (!draft) return;
      setCreationDraftId(draft.id);
      try {
        const parsed = JSON.parse(draft.content);
        if (Array.isArray(parsed.roles) && parsed.roles.length) setRoles(parsed.roles);
      } catch { /* 整合剧本正文不是角色 JSON，保留本地编辑状态 */ }
    }).catch(() => { /* 草稿加载失败不影响本地创作 */ });
  }, [bookId, hydrated, user]);
  useEffect(() => {
    if (!hydrated) return;
    setActs(current => current.map(act => stripOutlineMeta(act)));
    setOutlineText(current => current ? stripOutlineMeta(current) : current);
  }, [hydrated]);
  useEffect(() => {
    try {
      const pending = JSON.parse(localStorage.getItem(`${storageKey}:generation`) || 'null');
      if (!pending?.output || pending.status !== 'completed') return;
      const value = String(pending.output).trim();
      if (pending.activeStep === 1) setWorldText(value);
      else if (pending.activeStep === 2) { const parsed = JSON.parse(value.match(/\[[\s\S]*\]/)?.[0] || value); if (Array.isArray(parsed)) setRoles(current => parsed.slice(0, players).map((role: any, i: number) => ({ ...current.filter(r => r.position === '玩家')[i], ...role, name: role.name || current.filter(r => r.position === '玩家')[i]?.name || `玩家角色${i + 1}`, position: '玩家' }))); }
      else if (pending.activeStep === 3) { setActs(current => { const next = [...current]; next[Number.isInteger(pending.actTab) ? pending.actTab : 0] = `${next[Number.isInteger(pending.actTab) ? pending.actTab : 0]}${next[Number.isInteger(pending.actTab) ? pending.actTab : 0] ? '\n\n' : ''}${stripOutlineMeta(value)}`; setOutlineText(next.join('\n\n')); return next; }); }
      else if (pending.activeStep === 4) { const parsed = JSON.parse(value.match(/\{[\s\S]*\}/)?.[0] || value); setCaseData(parsed); }
      else if (pending.activeStep === 5) { setClueText(value); setClues(extractClueItems(value)); }
      else if (pending.activeStep === 6) setManual(value);
      else if (pending.activeStep === 7) setReview(value);
    } catch { /* 忽略不完整或旧格式的生成缓存 */ }
  }, [storageKey]);
  useEffect(() => { if (!hydrated) return; localStorage.setItem(storageKey, JSON.stringify({ projectTitle, type, players, name, world, worldText, roles, roleScripts, integrationRoleDesigns, selectedRoleScript, acts, outlineText, caseData, clues, clueText, manual, review, integratedScript })); }, [hydrated, storageKey, projectTitle,type,players,name,world,worldText,roles,roleScripts,integrationRoleDesigns,selectedRoleScript,acts,outlineText,caseData,clues,clueText,manual,review,integratedScript]);
  useEffect(() => {
    const available = roles.filter(r => r.name);
    if (available.length && !available.some(r => r.name === selectedRoleScript)) setSelectedRoleScript(available[0].name);
  }, [roles, selectedRoleScript]);
  useEffect(() => {
    if (roles.length || !characters.length) return;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (Array.isArray(saved?.roles) && saved.roles.length) return;
    } catch { /* ignore malformed saved state */ }
    setRoles(Array.from({ length: players }, (_, i) => blank(characters[i]?.name || `角色${i + 1}`)));
  }, [characters, players, storageKey, roles.length]);
  const persistProject = (message: string, overrides: Record<string, unknown> = {}) => {
    const snapshot = { projectTitle, type, players, name, world, worldText, roles, roleScripts, integrationRoleDesigns, selectedRoleScript, acts, outlineText, caseData, clues, clueText, manual, review, integratedScript, ...overrides };
    try { localStorage.setItem(storageKey, JSON.stringify(snapshot)); if (message) toast.success(message); }
    catch { toast.error('保存失败，请检查浏览器存储权限'); }
  };
  const persistIntegratedCreation = async (action: 'draft' | 'publish') => {
    if (!user) { openLogin(); return; }
    // 我的创作卡片和 UGC 社区只保存可直接阅读的三幕故事大纲，不混入改编过程、角色分析或内部提示。
    const value = stripOutlineMeta(outlineText || acts.join('\n\n')).trim();
    if (!value) { toast.error('请先生成整合剧本'); return; }
    if (action === 'draft') setDraftSaving(true); else setPublishing(true);
    try {
      setIntegratedScript(value);
      // 先保留本地编辑状态，远端成功后再提示用户，避免接口失败时出现“已保存”假象。
      persistProject('', { integratedScript: value });
      const creation = await api.saveCreation({ bookId, category: 'script', prompt: '剧本杀故事大纲', content: value, action, draftId: creationDraftId });
      if (action === 'draft') {
        setCreationDraftId(creation.id);
        toast.success('已保存到“我的创作”');
      } else {
        setCreationDraftId(undefined);
        toast.success(creation.status === 'published' ? '已发布到 UGC 社区' : '已提交 UGC 社区审核，通过后将在社区公开');
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : action === 'draft' ? '保存失败' : '发布失败');
    } finally { if (action === 'draft') setDraftSaving(false); else setPublishing(false); }
  };
  const saveRoles = () => persistProject('角色设计已保存（将在整合剧本环节统一提交）');
  const saveTypeAndPlayers = () => persistProject('您已设置好剧本杀类型与人数');
  const saveOutline = () => {
    const text = outlineText || acts.join('\n\n');
    const next = text.split(/(?=第一幕：|第二幕：|第三幕：)/).filter(Boolean).concat(['','','']).slice(0,3);
    const bodies = next.map(part => part.replace(/^(第一幕|第二幕|第三幕)\s*：?\s*/, '').trim());
    if (next.length < 3 || bodies.some(body => body.length < MIN_ACT_LENGTH)) { toast.error(`每一幕正文至少${MIN_ACT_LENGTH}字，请补充后再保存`); return; }
    setActs(next); setOutlineText(next.join('\n\n'));
    persistProject('您已确定故事大纲', { acts: next, outlineText: next.join('\n\n') });
  };
  const clearStep = (target: number) => {
    contentRevision.current += 1;
    if (target === 0) { setName(''); setType('情感本'); setPlayers(6); }
    else if (target === 1) { setWorld({}); setWorldText(''); }
    else if (target === 2) setRoles([]);
    else if (target === 3) { setActs(['', '', '']); setOutlineText(''); setContinueAct(0); }
    else if (target === 4) setRoleScripts({});
    else if (target === 5) setIntegratedScript('');
    try {
      localStorage.removeItem(`${storageKey}:generation`);
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
      if (target === 0) Object.assign(saved, { name: '', type: '情感本', players: 6 });
      else if (target === 1) Object.assign(saved, { world: {}, worldText: '' });
      else if (target === 2) Object.assign(saved, { roles: [], roleText: '' });
      else if (target === 3) Object.assign(saved, { acts: ['', '', ''], outlineText: '' });
      else if (target === 4) saved.roleScripts = {};
      else if (target === 5) saved.integratedScript = '';
      localStorage.setItem(storageKey, JSON.stringify(saved));
    } catch { /* 状态更新后的自动保存仍会写入空内容 */ }
    toast.success(`已清空${steps[target]}内容`);
  };
  const aiComplete = async (requestedStep = step) => {
    const activeStep = requestedStep;
    const requestRevision = contentRevision.current;
    // 故事大纲生成必须严格绑定用户当前选中的幕，生成过程中即使界面切换也不串幕。
    const selectedAct = actTab;
    const version = generation + 1; setGeneration(version);
    if (activeStep >= 0) {
      if (!user) { toast.error('请先登录后使用 AI 生成'); openLogin(); return; }
      const sectionNames = ['剧本类型与人数','世界观构建','角色设计','故事大纲'];
      const typeRule = typeProfiles[type] || '';
      const existing = activeStep === 0 ? `${name}\n类型：${type}\n人数：${players}` : activeStep === 1 ? worldText : activeStep === 2 ? roles.map(r => JSON.stringify(r)).join('\n') : activeStep === 3 ? acts.join('\n\n') : activeStep === 4 ? JSON.stringify(caseData) : activeStep === 5 ? clues.map(c => c.content).join('\n') : activeStep === 6 ? manual : review;
      const format = activeStep === 0 ? '只输出三行：剧本名称、推荐类型、建议人数。' : activeStep === 1 ? `直接输出可供玩家行动的完整世界观正文，不要 Markdown 代码围栏，也不要百科式分项凑数。严格围绕已确定的${type}、${players}人，把素材中的时代、地点、物件、关系和社会矛盾改造成一个封闭且可互动的游戏场域。必须写清：至少三个有名称且能往返行动的核心地点及其空间关系；一条所有角色都受约束的公开规则；一种会引发争夺、交换或取舍的资源；一个能实施奖惩或控制信息的组织/习俗；一项会在游戏中留下可观察痕迹的环境、技术或特殊条件。人文地理、生态物种、社会形态、信仰、政策与经济只写素材有依据且会改变玩家权限、路线、资源、信息或选择后果的部分。每项设定都要落到“谁因何受益或受限、玩家能做什么、行动会留下什么后果”，不得使用“文化底蕴深厚、局势暗流涌动、各方势力错综复杂、为故事提供舞台”等空泛表述，不得提前编写三幕剧情。` : activeStep === 2 ? `只输出 JSON 数组，必须恰好包含${players}个玩家角色；所有角色的 position 必须为“玩家”，不得输出 NPC。角色必须优先使用世界观和原文中已经出现的人物，不得擅自替换、改名或增加无关角色。每项包含 name、gender、age、race、job、relation、family、love、personality、position 字段。` : activeStep === 3 ? `一次性生成完整、能够实际开玩的三幕故事大纲。必须严格使用且仅使用以下三个一级标题，并按顺序逐行原样输出（每个标题单独占一行，不得改写、合并或添加其他幕次）：
第一幕：背景与角色引入
第二幕：关系与目标推进
第三幕：结局与余韵。每一幕至少 ${MIN_ACT_LENGTH} 字（严格统计每个幕标题之后的正文，不足 ${MIN_ACT_LENGTH} 字不得输出），必须用连贯的小说化叙事段落展开，而不是提纲清单、字段罗列或流程说明。每幕都必须出现：带姓名的角色在明确地点采取具体行动；行动缘由；其他角色可观察到的物件、记录、言语矛盾或状态变化；由此产生的关系或资源后果；至少一次可在桌面上执行的玩家互动（交换信息、搜寻、协商、质询、投票、合作完成任务或在互斥方案间选择）。互动必须嵌在事件里，写清可供判断的信息与不同选择的代价，不能写“玩家展开讨论/众人寻找线索”一笔带过。让前一事件的结果迫使角色作出下一选择，每个玩家角色在三幕中都至少有一次不可替代的行动，不得只作旁观者。第一、二幕结尾停在具体的新发现、期限、选择或局势变化上；第三幕回收前文可观察信息，写出角色的实际决定及其具体后果并完整收束，不得用“真相大白、关系得到修复、故事落幕”等概括句代替结局。严格、逐项应用当前已保存的世界观与角色卡，不得擅自改名、改身份、改关系、改动机或增加无关人物。` : '直接输出可编辑的正文，不要 Markdown 代码围栏。';
      const clueFormat = '生成至少6条与当前案件直接相关、彼此形成证据链的具体线索。每条必须包含可观察细节（具体物件、声音、回忆、记录或证词矛盾）、持有人或发现方式，以及与案件因果的明确指向；禁止“有助于推理”“指向真相”“发现异常”等空泛套话。地点只写一次，放在线索综述开头“地点/场景：……”中；各条线索不要重复地点，也禁止输出“【地点·线索】”或“地点·线索”标题。之后按“线索一：……”逐条输出完整段落，保留原文人物、物件、行动和时间关系；不要输出类别、等级、主持人说明、任务或谜底。';
      const instruction = `你是资深剧本杀编剧。${SCRIPT_KILLER_RULES}${TYPE_CONTRACT(type)}当前类型为“${type}”，类型规则：${typeRule}。先将改编素材隐性续写成符合该类型的丰富文本，再进行剧本杀改编；冲突应服务于类型主题，不要为了刺激而添加阴谋或死亡。所有新增内容必须围绕原文人物、场景、关系和核心主题生长，不得另起无关主线。只做“${sectionNames[activeStep] || '当前创作'}”这一环节，不能改写其他环节。以下故事圣经是唯一连续性依据：\n${continuityContext}\n\n本环节已有编辑内容：${existing.slice(-5000)}\n\n硬性要求：主要人物必须与原文一致；允许新增人物，但新增人物只能服务于既有关系与主题。${activeStep === 3 && (type === '情感本' || type === '欢乐本') ? '本类型禁止死者、案件、阴谋和悲剧结局，结局应积极、温暖、轻松或圆满。' : '只有原文和类型确有需要时才设置危险或负面事件；如设置死者，死者只能是 NPC，玩家角色必须保持存活。'} ${activeStep === 5 ? clueFormat : format} 只输出可直接使用的内容，禁止创作说明、套话、总结、建议或“以下/可以/需要/接下来”等元话语。`;
      let output = '';
      setGenerating(true); setGeneratingStep(activeStep);
      try {
        if (activeStep === 4) {
          // 案件提取需要一次性返回 JSON；故事大纲与世界观使用同一条流式生成接口。
          const requestInstruction = activeStep === 4 ? `${instruction}\n\n请严格依据以下已生成的三幕故事大纲提取案件设置，不得另编情节：\n${acts.join('\n\n')}\n只输出一个 JSON 对象，必须包含且仅包含：死者身份、案发场景、死亡原因、作案凶器、作案动机、被谁发现、嫌疑人动向。` : instruction;
          output = await api.adaptBook(activeStep === 4 ? acts.join('\n\n') : source.slice(0, 4200), activeStep === 5 ? 'script-tasks' : 'adapt', requestInstruction);
        } else if (activeStep === 3) {
          output = await api.adaptBook(source.slice(0, 9000), 'adapt', instruction);
        } else {
          await api.adaptBookStream(source.slice(0, 4200), activeStep === 5 ? 'script-tasks' : 'adapt', instruction, chunk => {
            output += chunk;
            try { localStorage.setItem(`${storageKey}:generation`, JSON.stringify({ activeStep, actTab: selectedAct, output, status: 'running' })); } catch {}
          });
        }
          const value = activeStep === 3 ? stripOutlineMeta(output.trim()) : output.trim();
        if (requestRevision !== contentRevision.current) return;
        if (!value) throw new Error('AI没有返回内容，请稍后重试');
        if (type === '欢乐本' && FORBIDDEN_HAPPY.test(value)) throw new Error('生成内容不符合欢乐本硬性契约：包含案件、死亡、阴谋或沉重情节，请重试');
        if (activeStep === 0) {
          const lines = value.split(/\n/).map(line => line.replace(/^\s*(剧本名称|名称|类型|推荐类型|建议人数)[:：]?\s*/, '').trim()).filter(Boolean);
          if (lines[0]) setName(lines[0]);
          const detectedType = types.find(item => value.includes(item));
          if (detectedType) setType(detectedType);
          const detectedPlayers = value.match(/(?:建议人数|人数)\D{0,3}(\d{1,2})/);
          if (detectedPlayers) setPlayers(Math.max(4, Math.min(12, Number(detectedPlayers[1]))));
        }
        else if (activeStep === 1) {
          if (WORLD_BOILERPLATE.test(value)) throw new Error('生成的世界观含有空泛套话，缺少可执行设定，请重试');
          setWorldText(value);
        }
        else if (activeStep === 2) {
          const json = value.match(/\[[\s\S]*\]/)?.[0];
          try {
            const parsed = JSON.parse(json || value);
            if (Array.isArray(parsed)) setRoles(parsed.slice(0, players).map((r, i) => {
              const lockedName = characters[i]?.name || r.name;
              return { ...blank(lockedName || `玩家角色${i + 1}`), ...r, name: lockedName || `玩家角色${i + 1}`, position: '玩家' };
            }));
            else setWorldText(value);
          } catch { setWorldText(value); }
        } else if (activeStep === 3) {
          const normalized = value.replace(/[【\[]\s*(第一幕|第二幕|第三幕)\s*[】\]]/g, '$1：').replace(/(第一幕|第二幕|第三幕)\s*[:：]?/g, '$1：');
          const matches = [...normalized.matchAll(/(第一幕|第二幕|第三幕)：([\s\S]*?)(?=(?:第一幕|第二幕|第三幕)：|$)/g)];
          if (matches.length < 3) {
            throw new Error('生成内容未包含完整三幕，请点击“生成故事大纲”重试');
          }
          const bodies = matches.slice(0, 3).map(m => normalizeAct(m[2]));
          if (bodies.some(body => body.length < MIN_ACT_LENGTH)) {
            throw new Error(`生成内容不达标：每一幕正文至少${MIN_ACT_LENGTH}字，请重试`);
          }
          if (bodies.some(body => OUTLINE_BOILERPLATE.test(body))) {
            throw new Error('生成内容含有概括性套话，未形成具体可玩情节，请重试');
          }
          if (!hasCompleteSentenceEnding(bodies[2])) {
            throw new Error('第三幕结尾不完整，未能完成情节收束，请重试');
          }
          const parts = matches.slice(0, 3).map((m, i) => `${m[1]}：${bodies[i]}`);
          setActs(parts); setOutlineText(parts.join('\n\n'));
        }
        else if (activeStep === 4) { const json = value.match(/\{[\s\S]*\}/)?.[0]; try { setCaseData(JSON.parse(json || value)); } catch { const lines = value.split(/\n+/).map(line => line.replace(/^[-*\d.、]+\s*/, '').split(/[：:]/)); const parsed = Object.fromEntries(lines.filter(x => x.length > 1).map(([k, ...v]) => [k.trim(), v.join(':').trim()])); setCaseData(Object.keys(parsed).length ? parsed : { '案件设置': value }); } }
        else if (activeStep === 5) { setClueText(value); setClues(extractClueItems(value)); }
        else if (activeStep === 6) setManual(value);
        else setReview(value);
        try { localStorage.setItem(`${storageKey}:generation`, JSON.stringify({ activeStep, actTab: selectedAct, output: value, status: 'completed' })); } catch {}
        toast.success(`已生成${sectionNames[activeStep]}`);
      } catch (e) {
        // 接口异常时仍提供可编辑的本地草稿，避免环节完全不可用。
        if (activeStep === 3) {
          toast.error(e instanceof Error ? e.message : '故事大纲生成失败，请重试');
        } else if (activeStep === 4) {
          setCaseData({ '死者身份': '故事中的关键NPC', '案发场景': sourceSignals.setting, '死亡原因': sourceSignals.crime, '作案凶器': sourceSignals.object, '作案动机': `掩盖${sourceSignals.motif}并控制关键证据`, '被谁发现': '与案发现场最接近的角色', '嫌疑人动向': `围绕${sourceSignals.setting}分头行动并制造时间差` }); toast.success('已生成案件设置草稿');
        } else toast.error(e instanceof Error ? e.message : '生成失败');
      }
      finally { setGenerating(false); setGeneratingStep(null); }
      return;
    }
    if (step === 0) { setName(`${canonicalTitle}·剧本杀${version > 1 ? `·V${version}` : ''}`); setType(type); setPlayers(recommend[type]); }
    if (step === 1) { const { setting, object, conflict } = sourceSignals; const next = { '人文地理':`隐性续写将原文高频场景【${setting}】扩展为封闭案发空间，${version % 2 ? '入口与退路' : '前后厅与隐蔽通道'}都围绕它设计。`, '生态物种':`以${environmentHint}构成可验证的环境变化，玩家据此判断${object}何时被移动。`, '社会形态':`以【${conflict}】为核心，围绕${object}形成守护者、受益者与揭密者三方关系；每个人同时背负公开立场与隐藏目标。`, '宗教信仰':`由时代习俗、禁忌与日常仪式补足公共规则，凶手借共同认知制造错误目击。`, '政策与经济结构':`${object}的归属会改变${setting}内的权力与资源分配，死者掌握能让至少两名角色失去现有身份的证据。` }; setWorld(next); setWorldText(`${Object.values(next).join('。')}\n\n隐性续写底稿：人物【${sourceSignals.names.join('、') || '原文人物'}】在【${setting}】形成相互牵制，物件【${sourceSignals.objects.join('、') || object}】成为可验证的行动证据；冲突【${conflict}】将推动案件升级。`); }
    if (step === 2) generateRoles();
    if (step === 3) setActs([`第一幕：${sourceBasis}。${sourceSignals.names.slice(0, 3).join('、') || '原文人物'}因【${sourceSignals.conflict}】齐聚${sourceSignals.setting}；旧日恩怨使每人既有盟友又有牵制者，${sourceSignals.object}的归属成为公开争端。`, `第二幕：隐性续写让死者准备公开与${sourceSignals.motif}有关的证据，${sourceSignals.object}出现异常转移；每个人都用公开立场与私下秘密制造不在场证明，${environmentHint}留下可核验的时间差。`, `第三幕：案发后，玩家依次获得围绕【${sourceSignals.clueTheme}】的现场、人物与密码线索，还原“动机—准备—执行—灭口”链条，并决定是否公开原作真相。`]);
    if (step === 4) setCaseData({ '案发场景':sourceSignals.setting,'死者身份':roles.find(r=>r.position==='NPC')?.name || '原文关键人物（请先生成角色）','死亡原因':sourceSignals.crime,'作案凶器':`${sourceSignals.object}及其可被利用的特性`,'作案动机':`掩盖与「${sourceSignals.motif}」相关的真相，并控制${sourceSignals.object}的归属`,'被谁发现':`熟悉${sourceSignals.setting}的人在关键时间发现`,'嫌疑人动向':`众人沿原文关系分头行动；凶手利用${environmentHint}制造时间差`});
    if (step === 5) generateClues();
    if (step === 6) setManual(`【主持人手册｜第${version}版】\n素材依据：${sourceBasis}\n\n${players}人${type}；核心冲突：${sourceSignals.conflict}。案发空间：${sourceSignals.setting}；核心物件：${sourceSignals.object}。\n流程：背景宣读→角色自述→公开搜证→交换专属线索→讨论投票→复盘。\n\n发放顺序：先公开${sourceSignals.setting}现场与${sourceSignals.object}的异常，再发放围绕“${sourceSignals.clueTheme}”的角色线索，最后开放密码线索。卡住时依次提示：谁能接触核心物件？${environmentHint}；谁的时间线与原文行动不一致？`);
    if (step === 7) setReview(`【完整复盘｜第${version}版】\n起因：${sourceBasis}中的【${sourceSignals.conflict}】升级，死者试图公开与${sourceSignals.motif}有关的证据。\n\n真相：凶手利用${sourceSignals.object}的特性，在${sourceSignals.setting}实施${sourceSignals.crime}，并借${environmentHint}制造错误时间线。\n\n伏笔回收：所有线索均回到“${sourceSignals.clueTheme}”；人物动机、物件痕迹与地点动线共同锁定真凶。`);
    toast.success(`AI已补全${steps[step]}`);
  };
  const exportFile = (kind: 'word'|'pdf') => { const content = integratedScript || buildIntegratedScript(); const html = `<html><meta charset="utf-8"><body><h1>${projectTitle} - 剧本杀创作</h1><pre style="white-space:pre-wrap;font-family:serif">${content}</pre></body></html>`; if(kind==='pdf'){ window.print(); return; } const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([html],{type:'application/msword'})); a.download=`${projectTitle}.doc`; a.click(); toast.success('Word 文档已导出'); };
  const generateRoles = () => { const generated = Array.from({length: players}, (_,i) => ({
    ...blank(sourceSignals.names[i] || `素材角色${i + 1}`),
    gender: i % 2 ? '女' : '男',
    age: `${24 + i * 3}岁`,
    job: i === 0 ? `${sourceSignals.object}持有人／调查者` : i === players - 1 ? `${sourceSignals.setting}管事` : `${sourceSignals.motif}相关人物`,
    relation: i === 0 ? `与死者争夺${sourceSignals.object}的真相` : `与${sourceSignals.names[0] || '主角'}存在${i % 2 ? '情感' : '利益'}牵连，并掌握一段会改变案发因果的前史`,
    personality: i % 2 ? '敏感谨慎，善于观察细节' : '沉稳果断，擅长隐藏情绪',
    family: `与${sourceSignals.setting}及${sourceSignals.motif}有关，背负一段未公开的往事`,
    position: i === players - 1 ? 'NPC' : '玩家',
  })); setRoles(generated); setSelectedRoleScript(generated[0]?.name || ''); setRolePickerOpen(false); };
  const generateRoleScripts = async () => {
    if (generating || generatingStep === 4) return;
    if (!user) { toast.error('请先登录后使用 AI 生成'); openLogin(); return; }
    if (!roles.filter(r => r.name).length) { toast.error('请先生成角色设计'); return; }
    setGenerating(true); setGeneratingStep(4);
    const role = selectedRoleScript || roles.find(r => r.name)?.name;
    if (!role) { setGenerating(false); setGeneratingStep(null); toast.error('请先生成角色设计'); return; }
    const next: Record<string, string> = { ...roleScripts };
    try {
        const roleData = roles.find(r => r.name === role) || {};
        const roleCard = JSON.stringify(roleData);
        const fullOutline = (outlineText || acts.join('\n\n')).slice(0, 16000);
        const prompt = `你是剧本杀首席编剧。本次使用内容生成接口，只为当前选中的角色【${role}】生成一份完整、可直接发给该玩家的单视角分角色剧本。绝对禁止生成其他角色剧本、角色列表、通用模板或创作说明。\n\n${TYPE_CONTRACT(type)}\n\n${continuityContext}\n\n【唯一有效的世界观设置】\n${worldText}\n\n【唯一有效的当前角色卡】\n${roleCard}\n\n【唯一有效的三幕故事大纲】\n${fullOutline}\n\n逐项核对后创作：只能从以上世界观、角色卡和三幕大纲提取设定。必须把${role}的身份、关系、家庭、感情、性格、秘密、目标，以及三幕中该角色实际参与的事件、行动、对白和后果，全部写成具体情节；不得概括复述，不得擅自新增、改名、改身份、改关系、改动机或改写已确定事实。\n\n视角与描写：全篇只使用第一人称“我”，只写${role}亲眼看到、亲耳听到、亲自做过、当下想到、记得的往事或基于可见事实的推断；不得上帝视角，不得描写其他角色内心或幕后行动。按三幕完整展开，每幕包含具体场景、人物动作/心理、感官细节、目标、选择及后果。\n\n输出格式硬性要求：只输出该角色剧本正文。严格按“场景描写 + 人物动作/心理 + 分段人物对话”组织；每个场景单独成段，动作或心理单独成段，每句对白单独成段。对白只能使用“我：……”或“与我交流的角色姓名：……”格式，多轮出现且每轮推动关系或行动。禁止 Markdown 标题、列表、代码围栏以及“*”“#”等多余符号，禁止剧名、角色介绍、任务说明、主持人手册、谜底、总结或元话语。保持${type}基调与${SCRIPT_KILLER_RULES}`;
        // 使用通用内容改编接口承载完整 prompt；script 类型在后端是旧的“仅传角色名”接口，会丢失本环节设定。
        next[role] = (await api.adaptBook(source.slice(0, 9000), 'adapt', prompt)).replace(/[＊*#＃]/g, '').trim();
      setRoleScripts(next); if (!selectedRoleScript && roles[0]?.name) setSelectedRoleScript(roles[0].name); toast.success('已生成分角色剧本');
    } catch (e) { toast.error(e instanceof Error ? e.message : '分角色剧本生成失败'); }
    finally { setGenerating(false); setGeneratingStep(null); }
  };
  const continueRoleScript = async () => {
    const role = selectedRoleScript || roles[0]?.name;
    if (!role) { toast.error('请先选择角色'); return; }
    if (!user) { toast.error('请先登录后使用 AI 续写'); openLogin(); return; }
    setContinuing(true);
    try {
      const roleCard = JSON.stringify(roles.find(r => r.name === role) || {});
      const prompt = `请续写角色【${role}】的单视角剧本。只能使用第一人称“我”，从现有文本最后一个具体动作、对白或心理状态直接接续；只写我能看到、听到、想到、记得和亲自完成的事，不得上帝视角，不得揭示其他角色内心或幕后真相。必须把该角色的内心秘密、隐藏动机、欲望、恐惧和选择写成具体心理与行动，加入多轮自然对白及对话后的反应。保持原文素材、世界观、故事大纲和${type}基调，禁止套话、总结和无关案件。${type === '欢乐本' || type === '情感本' ? '保持积极、温暖、轻松或圆满走向，禁止死者、案件、阴谋和强行悲剧。' : ''}\n\n角色卡：${roleCard}\n\n已保存故事上下文：${continuityContext}\n\n现有单视角剧本：${roleScripts[role] || ''}`;
      const value = (await api.adaptBook(source.slice(0, 9000), 'continue', `${prompt}\n\n续写时仍须严格遵守“场景+人物动作+人物对话”结构，对话使用“角色名：……”格式，且只续写【${role}】。`)).replace(/[＊*#＃]/g, '').trim();
      setRoleScripts(v => ({ ...v, [role]: `${v[role] ? `${v[role]}\n\n` : ''}${value}` }));
      toast.success(`${role}的分角色剧本续写完成`);
    } catch (e) { toast.error(e instanceof Error ? e.message : '续写失败'); }
    finally { setContinuing(false); }
  };
  const addClue = () => setClues([...clues,{id: clues.length+1,name:`线索${clues.length+1}`,content:'',category:'公开',level:'初级',role:'',where:''}]);
  const generateClues = () => { const v = generation + 1; setGeneration(v); const npc = roles.find(r=>r.position==='NPC')?.name || '原文关键人物'; const fresh = [
    {content:`现场物证：${sourceSignals.object}出现与正常使用不符的${v%2 ? '磨损' : '残留痕迹'}，与${sourceSignals.crime}相互印证。`,category:'公开',level:'初级',where:sourceSignals.setting},
    {content:`时间线索：${environmentHint}在不同证词中的状态不一致，暴露案发时间差。`,category:'公开',level:'初级',where:sourceSignals.setting},
    {content:`素材对应线索：原文中的“${sourceBasis.slice(0, 28)}”与${sourceSignals.object}的持有记录吻合，指向${sourceSignals.conflict}。`,category:'公开',level:'深入',where:sourceSignals.locations[0] || sourceSignals.setting},
    {content:`角色专属：${npc}曾单独接触${sourceSignals.object}，但对${sourceSignals.motif}的说法与原文行动矛盾。`,category:'专属',level:'深入',role:npc,where:'角色私人物品'},
    {content:`角色专属：${sourceSignals.names[0] || '主角'}保留一段能解释${sourceSignals.clueTheme}的私密记录，可与另一名玩家的证词互证。`,category:'专属',level:'深入',role:sourceSignals.names[0] || '主角',where:'私人记录'},
    {content:`密码线索：将${sourceSignals.objects.slice(0, 3).join('、') || sourceSignals.object}按原文出现顺序排列，可还原${sourceSignals.setting}的行动路线。`,category:'密码',level:'深入',where:'原文批注'},
  ].map((c,i)=>({...c,id:i+1})); setClues(fresh.map(c => ({ ...c, content: summarizeClueContent(c.content) }))); setClueText(fresh.map(c => c.content).join('\n')); };
  const buildIntegratedScript = () => {
    const outlineSection = outlineText || acts.join('\n\n');
    const roleSection = integrationRoles.map((role: any) => {
      const design = integrationRoleDesigns[role.name] ?? [role.description, [role.gender, role.age, role.race, role.job, role.relation, role.family, role.love, role.personality].filter(Boolean).join('；')].filter(Boolean).join('\n');
      return `[${role.name}]\n【角色设计】\n${design}\n【分角色剧本】\n${roleScripts[role.name] || ''}`;
    }).join('\n\n');
    return [
      `【第一环节｜剧本类型与人数】\n剧本名称：${name || ''}\n剧本类型：${type}\n玩家人数：${players}人`,
      `【第二环节｜世界观构建】\n${worldText || ''}`,
      `【第四环节｜故事大纲（三幕式）】\n${outlineSection}`,
      `【第三环节｜角色设计】与【第五环节｜分角色剧本】\n${roleSection}`,
    ].join('\n\n');
  };
  const roleDesignText = (role: any) => [
    role.description,
    [
      ['性别', role.gender], ['年龄', role.age], ['种族', role.race], ['身份/职业', role.job],
      ['人物关系', role.relation], ['家庭背景', role.family], ['感情经历', role.love], ['性格特征', role.personality],
      ['人物定位', role.position],
    ].filter(([, value]) => value).map(([label, value]) => `${label}：${value}`).join('\n'),
  ].filter(Boolean).join('\n');
  const roleScriptText = (role: string) => (roleScripts[role] || '').replace(/\n{3,}/g, '\n\n').trim();
  const editorHeight = (value: string, minimum = 180) => ({ height: `${Math.max(minimum, Math.min(1800, (value || '').split('\n').length * 30 + 48))}px`, overflow: 'hidden' as const });
  const integrateScript = () => { if (!roles.length && characters.length) setRoles(characters.map((c, i) => ({ ...blank(c.name || `角色${i + 1}`), description: c.description || '' }))); const result = buildIntegratedScript(); setIntegratedScript(result); setIntegrationAct(0); setIntegrationOpen(true); };
  const integrationRoles = (roles.filter(r => r.name).length
    ? roles.filter(r => r.name)
    : characters.filter(c => c.name).map((c, i) => ({ ...blank(c.name || `角色${i + 1}`), description: c.description || '' }))
  ).length
    ? (roles.filter(r => r.name).length ? roles.filter(r => r.name) : characters.filter(c => c.name).map((c, i) => ({ ...blank(c.name || `角色${i + 1}`), description: c.description || '' })))
    : Object.keys(roleScripts).map(name => ({ ...blank(name), description: '' }));
  const continueText = async (kind: 'overview'|'world'|'roles'|'act'|'case'|'clues'|'manual'|'review') => {
    const requestRevision = contentRevision.current;
    const current = kind === 'overview' ? `${name}\n类型：${type}\n人数：${players}` : kind === 'world' ? worldText : kind === 'roles' ? roles.map(r => JSON.stringify(r)).join('\n') : kind === 'act' ? acts.join('\n\n') : kind === 'case' ? Object.entries(caseData).map(([k, v]) => `${k}：${v}`).join('\n') : kind === 'clues' ? clues.map(c => c.content).join('\n') : kind === 'manual' ? manual : review;
    const draftActs = outlineText ? outlineText.split(/(?=第一幕：|第二幕：|第三幕：)/).filter(Boolean).concat(['','','']).slice(0,3) : acts;
    const context = kind === 'act' ? (draftActs[continueAct]?.trim() || sourceBasis) : (current.trim() || sourceBasis);
    if (continuing) return;
    const continuationVersion = generation + 1;
    setGeneration(continuationVersion);
    if (!user) { toast.error('请先登录后使用 AI 续写'); openLogin(); return; }
    setContinuing(true);
    let generated = '';
    try {
      const section = kind === 'overview' ? '剧本类型、人数和名称设定' : kind === 'world' ? '世界观中的具体制度、空间和人物利益' : kind === 'roles' ? '必要NPC的角色关系、动机和秘密' : kind === 'act' ? `故事大纲第${continueAct + 1}幕的事件推进` : kind === 'case' ? '案件设置中的作案因果、时间线和现场细节' : kind === 'clues' ? '线索设计中的可验证物证、证词矛盾和指向关系' : kind === 'manual' ? '主持人可执行的发放、提示和判定流程' : '复盘中从证据到真相的因果回收';
      const format = kind === 'overview' ? '请输出三行：剧本名称、推荐类型、建议人数。' : kind === 'world' ? '只补充尚未出现、会改变玩家权限、路线、资源、信息或选择后果的世界规则。每段至少包含一个专名、一个明确约束和一个可观察后果；不得续写故事情节，不得重复已有设定，不得百科式介绍风土。' : kind === 'roles' ? `请只输出 JSON 数组，补充 1-3 个必要的 NPC（position 必须为 NPC），每项包含 name、gender、age、race、job、relation、family、love、personality、position、necessity 字段。每个 NPC 必须明确写出 necessity，说明其如何推动${type}剧本的情节或使世界观设定得以运转；若没有必要新增角色则输出空数组。不得生成玩家角色，不得重复已有角色。` : kind === 'case' ? '请输出 JSON 对象，包含案发场景、死者身份、死亡原因、作案凶器、作案动机、被谁发现、嫌疑人动向。' : kind === 'clues' ? '先写“地点/场景：……”作为综述开头，再按“线索一：……”逐条写出详细、可验证的物证描写。每条线索必须来自已保存的世界观、角色、三幕大纲和案件设置，明确具体物件、位置、状态、来源及其与案件的关联；不要输出分类、等级或主持人说明。' : '请紧接现有内容写可直接使用的正文。';
    const actNames = ['第一幕：背景与角色引入', '第二幕：关系与目标推进', '第三幕：结局与余韵'];
      const selectedActName = actNames[continueAct] || actNames[0];
      const continuityPacket = kind === 'world' ? [
        `改编素材依据：${sourceSignals.adaptationSeed}`,
        `所选类型与人数：${type}，${players}人。`,
        `已有世界观（只补缺口，不复述）：${worldText}`,
        `已锁定角色及其利益：${roles.map(r => `${r.name}|${r.job}|${r.relation}`).join('；') || '尚未填写，优先沿用原文人物。'}`,
      ].join('\n') : [
        `改编素材的隐性续写底稿：${sourceSignals.adaptationSeed}`,
        `本次只处理${selectedActName}，不得改写另外两幕。`,
        `已保存世界观（必须逐项遵守）：${worldText || '尚未填写，依据改编素材与类型设定保持时代、空间和制度一致。'}`,
        `已保存角色卡（人物姓名、身份、关系、动机和秘密均视为锁定）：${roles.map(r => JSON.stringify(r)).join('；') || '尚未填写，优先沿用原文人物。'}`,
        `该幕已有正文（从最后一个完整动作接续）：${context.slice(-7000)}`,
      ].join('\n');
      const continuationInstruction = kind === 'world'
        ? `你正在补充剧本杀的世界观，不是在续写剧情。只增加能够被玩家利用、触犯或验证的具体设定，并明确它怎样改变行动权限、空间路线、资源交换、信息获取或选择代价。新设定必须从原素材、${type}类型和已有世界观自然生长，不得新增无关时代、地点、超自然体系或案件主线。禁止“文化底蕴深厚”“暗流涌动”“势力错综复杂”“提供舞台”等套话，禁止总结、建议和创作说明。\n\n${continuityPacket}\n${format}`
        : `你正在补充剧本杀的${section}。${selectedActName}是唯一写作目标。请把改编素材中未明说的前因后果自然写出来，像原作故事继续发生一样，不要写成套话或流程说明。必须从该幕原文最后一个完整事件、动作或事实直接落笔，写出具体场景、人物选择、对话或反应，并让至少一条因果链产生新的、可验证的结果。\n\n严格要求：保持世界观的时代、空间规则、社会利益和素材气质；保持角色卡中的姓名、身份、关系、动机和已知事实；不得凭空加入无关地点、时代、超自然设定、人物或案件主线。相较于已有正文，本次必须带来未出现过的新行动、新信息、新物件状态或新的关系变化，不能换词重复旧事件；若已有线索已出现，必须推进它的后果而不是再次介绍。至少安排一次玩家可执行的交换信息、搜寻、协商、质询、投票、合作任务或互斥选择，并写清可判断的信息和选择代价，不得用“众人讨论/寻找线索”概括。输出只包含可直接粘贴进正文的叙事段落，不要幕标题，不要复述前文，不要解释创作过程，不要出现“第几次”“续写”“接下来”“本幕”“可以”“需要”“建议”“以下”等元话语。${continueAct === 2 ? '这是最终一幕，必须完成所有冲突、回应全部线索并写出明确结局，不得留下悬念、不得戛然而止，最后一句必须是完整收束的句子。' : '结尾要停在一个具体的新状态、选择或悬念上，给下一次点击留下继续推进的空间。'}\n\n${continuityPacket}\n${format}`;
      await api.adaptBookStream(continuityPacket, 'continue', continuationInstruction, chunk => {
        generated += chunk;
        try { localStorage.setItem(`${storageKey}:generation`, JSON.stringify({ activeStep: step, output: generated, status: 'running' })); } catch {}
      }, undefined);
        let value = generated.trim();
      if (requestRevision !== contentRevision.current) return;
      if (kind === 'act') {
        // 模型偶尔会把内部指令泄露到正文，续写结果只保留可直接入稿的叙事内容。
        value = value
          .replace(/^(?:第\s*\d+\s*次\s*)?续写\s*[:：]\s*/i, '')
          .replace(/^(?:第一幕|第二幕|第三幕)\s*[:：]\s*/i, '')
          .replace(/^(?:接下来|以下(?:内容)?|本幕(?:将)?)[：:]?\s*/i, '')
          .trim();
        value = stripOutlineMeta(value);
        if (OUTLINE_BOILERPLATE.test(value)) throw new Error('续写内容仍是概括性套话，未产生具体可玩事件，请重试');
        if (continueAct === 2 && !hasCompleteSentenceEnding(value)) throw new Error('第三幕续写被截断，尚未形成完整结局，请重试');
      }
      if (!value) throw new Error('AI没有返回内容，请稍后重试');
      if (kind === 'overview') {
        const lines = value.split(/\n/).map(line => line.replace(/^\s*(剧本名称|名称|类型|推荐类型|建议人数|人数)[:：]?\s*/, '').trim()).filter(Boolean);
        if (lines[0]) setName(lines[0]);
        const detectedType = types.find(item => value.includes(item)); if (detectedType) setType(detectedType);
        const detectedPlayers = value.match(/(?:建议人数|人数)\D{0,3}(\d{1,2})/); if (detectedPlayers) setPlayers(Math.max(4, Math.min(12, Number(detectedPlayers[1]))));
      } else if (kind === 'world') {
        if (WORLD_BOILERPLATE.test(value)) throw new Error('世界观续写仍含空泛套话，请重试');
        setWorldText(v => `${v}\n\n${value}`);
      }
      else if (kind === 'roles') { const json = value.match(/\[[\s\S]*\]/)?.[0]; const parsed = JSON.parse(json || value); if (!Array.isArray(parsed)) throw new Error('NPC补充格式无效'); const npcs = parsed.filter((r: any) => r && (r.position === 'NPC' || r.position === 'npc')).slice(0, 3); setRoles(v => [...v.filter(r => r.position === '玩家'), ...npcs.map((r: any, i: number) => ({ ...blank(r.name || `补充NPC${i + 1}`), ...r, position: 'NPC' }))]); }
      else if (kind === 'act') {
        setActs(v => { const base = outlineText ? draftActs : v; const next = [...base]; next[continueAct] = `${next[continueAct]}\n\n${value}`.trim(); setOutlineText(next.join('\n\n')); return next; });
      }
      else if (kind === 'case') { const json = value.match(/\{[\s\S]*\}/)?.[0]; const parsed = JSON.parse(json || value); setCaseData(v => ({ ...v, ...parsed })); }
      else if (kind === 'clues') { setClueText(v => `${v}${v.trim() ? '\n' : ''}${value}`.trim()); setClues(v => [...v, ...extractClueItems(value)]); }
      else if (kind === 'manual') setManual(v => `${v}\n\n${value}`);
      else setReview(v => `${v}\n\n${value}`);
      try { localStorage.setItem(`${storageKey}:generation`, JSON.stringify({ activeStep: step, output: value, status: 'completed' })); } catch {}
      toast.success(kind === 'act' ? '故事大纲续写完成' : `续写${section}完成`);
      } catch (e) {
        if (kind === 'act') {
          const fallbackVariants = [
            `${sourceSignals.names.slice(0, 2).join('与') || '两名角色'}在${sourceSignals.setting}交接${sourceSignals.object}时，发现封口处多了一道不属于原持有人的划痕。持有记录与现场尘痕对不上，迫使其中一人当众改变说法；另一人没有争辩，只把一张写有旧约时间的纸折进袖中。这个动作让${sourceSignals.conflict}从口角变成必须立刻验证的行动。`,
            `夜色压过${sourceSignals.setting}后，${sourceSignals.names[0] || '最早到场的人'}沿着被忽略的侧门检查${sourceSignals.object}，在门闩背面摸到尚未干透的蜡屑。蜡印对应的不是现有钥匙，说明有人在众人聚齐前改过出入规则；掌管门锁的人不得不交出一份与先前证词矛盾的值守记录。`,
            `一段关于${sourceSignals.motif}的旧话被${sourceSignals.names[1] || '另一名角色'}当场截断。对方从袖中取出沾有${sourceSignals.object}气味的布片，指出它曾被放在不该出现的地方；众人顺着气味找到一处被挪动的陈设，里面露出能改变${sourceSignals.conflict}走向的日期。`,
          ];
          const fallback = fallbackVariants[(continuationVersion - 1) % fallbackVariants.length];
          setActs(v => { const next = [...v]; next[continueAct] = `${next[continueAct]}\n\n${fallback}`.trim(); setOutlineText(next.join('\n\n')); return next; });
          toast.success('故事大纲续写完成');
        } else toast.error(e instanceof Error ? e.message : '续写失败');
      }
    finally { setContinuing(false); }
  };
  const sectionGenerate = (label: string, target: number) => <button className="sk-primary" disabled={generatingStep === target} onClick={() => void aiComplete(target)}>{generatingStep === target ? '生成中…' : label}</button>;
  const renderStep = () => { if(step===0) return <><div className="sk-grid">{types.map(t=><button className={type===t?'active':''} onClick={()=>{setType(t);setPlayers(recommend[t])}}>{t}<small>推荐 {recommend[t]} 人</small></button>)}</div><div className="sk-counter">玩家人数 <button onClick={()=>setPlayers(Math.max(4,players-1))}>−</button><b>{players}</b><button onClick={()=>setPlayers(Math.min(12,players+1))}>＋</button><span>（4~12人）</span></div><div className="sk-type-actions"><button className="sk-primary" onClick={()=>void continueText('overview')} disabled={continuing}>{continuing ? '续写中…' : '补充类型'}</button><div className="sk-save-group"><button className="sk-clear" onClick={()=>clearStep(0)}>清空</button><button className="sk-primary sk-type-save" onClick={saveTypeAndPlayers}>保存</button></div></div></>;
    if(step===1) return <><textarea className="sk-rich sk-world-editor" value={worldText} onChange={e=>setWorldText(e.target.value)} placeholder={`完整世界观描述（可编辑）：请围绕${type}、${players}人，并涵盖人文地理、生态物种、社会形态、宗教信仰、政策与经济结构……`} /><div className="sk-world-actions"><button className="sk-secondary" onClick={()=>void continueText('world')} disabled={continuing || !worldText.trim()}>{continuing ? '续写中…' : '续写世界观'}</button><div className="sk-save-group"><button className="sk-clear" onClick={()=>clearStep(1)}>清空</button><button className="sk-primary sk-world-save" onClick={()=>persistProject('您已完成剧本杀的世界观构建')}>保存</button></div></div></>;
    if(step===2) return <>{!roles.length && <textarea className="sk-rich sk-role-editor sk-role-placeholder" value="" readOnly tabIndex={-1} aria-hidden="true" />}<div>{roles.map((r,i)=><details open className="sk-role"><summary>{r.name || `角色${i+1}`} · {r.position}</summary><div className="sk-fields">{[['姓名','name'],['性别','gender'],['年龄','age'],['种族','race'],['身份/职业','job'],['人物关系','relation'],['家庭背景','family'],['感情经历','love'],['性格特征','personality']].map(([l,k])=><label>{l}<input value={r[k]} onChange={e=>{const x=[...roles];x[i]={...x[i],[k]:e.target.value};setRoles(x)}} /></label>)}<label>人物定位<select value={r.position} onChange={e=>{const x=[...roles];x[i]={...x[i],position:e.target.value};setRoles(x)}}><option>玩家</option><option>NPC</option></select></label></div></details>)}</div><div className="sk-role-actions"><button className="sk-primary" disabled={continuing} onClick={()=>void continueText('roles')}>{continuing ? '生成中…' : '补充NPC（非玩家角色）'}</button><div className="sk-save-group"><button className="sk-clear" onClick={()=>clearStep(2)}>清空</button><button className="sk-primary sk-role-save" onClick={saveRoles}>保存</button></div></div></>;
    if(step===3) return <><p className="sk-outline-hint">内容可编辑，共分成三幕；每一幕正文至少 {MIN_ACT_LENGTH} 字：
第一幕：背景与角色引入
第二幕：关系与目标推进
第三幕：结局与余韵</p><textarea className="sk-rich sk-outline-editor" value={outlineText || acts.join('\n\n')} onChange={e=>setOutlineText(e.target.value)} placeholder={`请完整填写第一幕、第二幕和第三幕的故事内容，每幕至少${MIN_ACT_LENGTH}字`}/><div className="sk-outline-actions"><label className="sk-outline-select">选择续写幕次：<select value={continueAct} onChange={e=>setContinueAct(Number(e.target.value))}><option value={0}>第一幕：背景与角色引入</option><option value={1}>第二幕：关系与目标推进</option><option value={2}>第三幕：结局与余韵</option></select></label><button className="sk-secondary" disabled={continuing || !(outlineText || acts.join('')).trim()} onClick={()=>void continueText('act')}>{continuing ? '续写中…' : '续写故事大纲'}</button><div className="sk-save-group"><button className="sk-clear" onClick={()=>clearStep(3)}>清空</button><button className="sk-primary" onClick={()=>{ const text = outlineText || acts.join('\n\n'); const next = text.split(/(?=第一幕：|第二幕：|第三幕：)/).filter(Boolean).concat(['','','']).slice(0,3); const bodies = next.map(part => part.replace(/^(第一幕|第二幕|第三幕)\s*：?\s*/, '').trim()); if (next.length < 3 || bodies.some(body => body.length < MIN_ACT_LENGTH)) { toast.error(`每一幕正文至少${MIN_ACT_LENGTH}字，请补充后再保存`); return; } setActs(next); setOutlineText(next.join('\n\n')); persistProject('您已确定故事大纲', { acts: next, outlineText: next.join('\n\n') }); }}>保存</button></div></div></>;;
    if(step===4) return <div className="sk-role-scripts"><div className="sk-role-script-list">{roles.filter(r=>r.name).map(role=><details open className="sk-role-script-card" key={role.name}><summary>{role.name} · 单视角剧本</summary><textarea value={roleScripts[role.name] || ''} onChange={e=>setRoleScripts(v=>({...v,[role.name]:e.target.value}))} /></details>)}</div><div className="sk-role-script-actions"><select value={selectedRoleScript} onChange={e=>setSelectedRoleScript(e.target.value)}>{roles.filter(r=>r.name).map(role=><option key={role.name} value={role.name}>{role.name}</option>)}</select><button className="sk-secondary" disabled={continuing} onClick={()=>void continueRoleScript()}>{continuing ? '续写中…' : '续写分角色剧本'}</button><div className="sk-save-group"><button className="sk-clear" onClick={()=>clearStep(4)}>清空</button><button className="sk-primary" onClick={()=>persistProject('分角色剧本已保存')}>保存</button></div></div></div>;
    if(step===5) return <div className="sk-integration-placeholder"><span>✦</span><p>点击左侧“整合剧本”，打开专注式整合预览</p></div>;
    return null;
  };
 return <div className="script-killer"><header className="sk-header"><div>{editingTitle?<input autoFocus value={projectTitle} onChange={e=>setProjectTitle(e.target.value)} onBlur={()=>setEditingTitle(false)}/>:<h1>{projectTitle} - 剧本杀创作 <button onClick={()=>setEditingTitle(true)}>✎</button></h1>}</div><div><button onClick={()=>exportFile('word')}>导出Word</button><button onClick={()=>exportFile('pdf')}>导出PDF</button></div></header><section className={`sk-source ${collapsed?'collapsed':''}`}><div className="sk-source-head"><b>改编素材</b><button onClick={()=>setCollapsed(!collapsed)}>{collapsed?'▼ 展开':'▲ 折叠'}</button></div>{!collapsed&&<><div className="sk-source-tabs"><button className={sourceMode==='original'?'active':''} onClick={()=>setSourceMode('original')}>原文</button><button className={sourceMode==='translation'?'active':''} onClick={()=>{setSourceMode('translation');if(!translation)void onRequestTranslation()}}>{translationLoading?'加载中…':'译文'}</button></div><div className="sk-source-text">{source||'暂无素材'}</div></>}</section><main className="sk-main"><nav>{steps.map((s,i)=><button key={s} className={step===i?'active':''} onClick={()=>{setStep(i);if(i===5) integrateScript();}}><span>{i<step?'✓':i+1}</span>{s}</button>)}</nav><section className="sk-editor"><div className="sk-editor-head"><div><h2>{steps[step]}</h2>{step === 0 && <p>请选择剧本杀类型，您可以修改人数</p>}</div><div className="sk-editor-actions">{step === 1 && <button className="sk-primary sk-world-generate" disabled={generatingStep === 1} onClick={()=>void aiComplete(1)}>{generatingStep === 1 ? '生成中…' : '生成世界观'}</button>}{step === 2 && <button className="sk-primary sk-role-generate" disabled={generatingStep === 2} onClick={()=>void aiComplete(2)}>{generatingStep === 2 ? '生成中…' : '生成角色'}</button>}{step === 3 && <button className="sk-primary" disabled={generatingStep === 3} onClick={()=>void aiComplete(3)}>{generatingStep === 3 ? '生成中…' : '生成故事大纲'}</button>}{step === 4 && <><div className="sk-role-picker-wrap"><span className="sk-role-picker-hint">请选择角色生成分角色剧本</span><button className="sk-role-picker-toggle" onClick={()=>setRolePickerOpen(v=>!v)}>{rolePickerOpen ? '收起角色' : (selectedRoleScript || '请选择')}</button>{rolePickerOpen && <select className="sk-role-picker" autoFocus value={selectedRoleScript} onChange={e=>{setSelectedRoleScript(e.target.value);setRolePickerOpen(false)}}>{roles.filter(r=>r.name).map(role=><option key={role.name} value={role.name}>{role.name}</option>)}</select>}</div><button className="sk-ai-complete" disabled={generatingStep === 4 || !selectedRoleScript} onClick={()=>void generateRoleScripts()}>{generatingStep === 4 ? '生成中…' : '生成分角色剧本'}</button></>}{step === 5 && <button className="sk-ai-complete" onClick={integrateScript}>生成整合剧本</button>}</div></div>{renderStep()}</section></main>{integrationOpen && <div className="sk-integration-modal" role="dialog" aria-modal="true" onClick={()=>{setIntegrationOpen(false);setStep(4);}}><div className="sk-integration-dialog" onClick={e=>e.stopPropagation()}><div className="sk-integration-dialog-head"><div><span className="sk-integration-eyebrow">✦ {integrationAct===0?'第一幕 · 剧本总览':'第二幕 · 角色与分角色剧本'}</span><h2>{projectTitle || '整合剧本'}</h2></div><div className="sk-integration-head-actions"><button className="sk-integration-next" onClick={()=>setIntegrationAct(1)} aria-label="进入第二幕">›</button><button onClick={()=>setIntegrationOpen(false)} aria-label="关闭">×</button></div></div><div className="sk-integration-slider" style={{transform:`translateX(-${integrationAct*100}%)`}}><section className="sk-integration-slide"><div className="sk-integration-content-box"><div className="sk-integration-copy-section"><h3>第一环节｜剧本类型与人数</h3><p>剧本名称：{name || projectTitle || ''}<br/>剧本类型：{type}<br/>玩家人数：{players}人</p></div><div className="sk-integration-copy-section"><h3>第二环节｜世界观构建</h3><textarea className="sk-integration-inline-editor" value={worldText} onChange={e=>setWorldText(e.target.value)} placeholder="编辑世界观构建内容" /></div><div className="sk-integration-copy-section"><h3>第四环节｜故事大纲（三幕式）</h3><textarea className="sk-integration-inline-editor sk-outline-inline-editor" value={outlineText || acts.join('\n\n')} onChange={e=>setOutlineText(e.target.value)} placeholder="编辑故事大纲" /></div></div></section><section className="sk-integration-slide"><div className="sk-integration-content-box sk-role-content-box">{integrationRoles.map((role,i)=><section className="sk-integration-role-block" key={`${role.name}-${i}`}><h3 className="sk-integration-role-title">[{role.name}]</h3><div className="sk-integration-role-design"><h4>第三环节｜角色设计</h4><textarea className="sk-integration-inline-editor" value={integrationRoleDesigns[role.name] ?? roleDesignText(role)} onChange={e=>setIntegrationRoleDesigns(v=>({...v,[role.name]:e.target.value}))} placeholder="编辑角色设计" /></div><div className="sk-integration-role-script"><h4>第五环节｜分角色剧本</h4><textarea className="sk-integration-inline-editor sk-role-script-editable" value={roleScripts[role.name] || ''} onChange={e=>setRoleScripts(v=>({...v,[role.name]:e.target.value}))} placeholder="编辑该角色的分角色剧本" /></div></section>)}</div></section></div><div className="sk-integration-modal-actions"><button className="sk-secondary" onClick={()=>setIntegrationAct(0)}>返回修改</button><button className="sk-primary" disabled={draftSaving} onClick={()=>void persistIntegratedCreation('draft')}>{draftSaving ? '保存中…' : '保存'}</button><button className="sk-primary" disabled={publishing} onClick={()=>void persistIntegratedCreation('publish')}>{publishing ? '提交中…' : '发布'}</button></div></div></div>}</div>;
}
