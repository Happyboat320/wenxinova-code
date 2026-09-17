import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AuthContext } from '@/contexts/authContext';
import MarkdownContent from '@/components/MarkdownContent';
import * as api from '@/api';
import ScriptKillerWorkspace from '@/components/ScriptKillerWorkspace';

interface Character {
  id: number;
  name: string;
  description: string | null;
  deeds?: string | null;
}

interface Props {
  bookId: number;
  chapterId?: number | null;
  title: string;
  author: string;
  originalText: string;
  translation: string;
  translationLoading: boolean;
  onRequestTranslation: () => Promise<boolean>;
  characters: Character[];
  sourceTitle?: string;
  sourceChapterTitle?: string | null;
  initialMode?: WorkspaceMode;
  initialScriptSection?: ScriptSection;
}

type WorkspaceMode = 'style' | 'script';
type ScriptSection = 'role' | 'tasks';
type SourceMode = 'original' | 'translation';

interface WorkspaceCache {
  style: string;
  styleRequirement: string;
  selectedCharacter: string;
  generatedCharacters: Character[];
  result: string;
  adaptationReport: string;
  continuationRequirement: string;
}

const ADAPTATION_MARKER = '<<<ADAPTATION>>>';
const REPORT_MARKER = '<<<REPORT>>>';

/** 将同一次流式响应中的改编正文和报告拆开；长文本分块时允许标记重复出现。 */
function splitAdaptationResponse(raw: string): { content: string; report: string } {
  const sections: Record<'content' | 'report', string[]> = { content: [], report: [] };
  const markerPattern = /<<<(ADAPTATION|REPORT)>>>/g;
  let active: 'content' | 'report' = 'content';
  let cursor = 0;
  let matched = false;
  for (const marker of raw.matchAll(markerPattern)) {
    matched = true;
    const text = raw.slice(cursor, marker.index).trim();
    if (text) sections[active].push(text);
    active = marker[1] === 'REPORT' ? 'report' : 'content';
    cursor = (marker.index || 0) + marker[0].length;
  }
  const tail = raw.slice(cursor).replace(/\n?<{1,3}[A-Z_]*$/, '').trim();
  if (tail) sections[active].push(tail);
  return {
    content: (matched ? sections.content : [raw]).join('\n\n').trim(),
    report: sections.report.join('\n\n').trim(),
  };
}

function readCache(key: string): Partial<WorkspaceCache> | null {
  try { return JSON.parse(localStorage.getItem(key) || 'null') as Partial<WorkspaceCache> | null; } catch { return null; }
}

/** 玩家阅读态只展示正文，隐藏模型偶尔带出的 Markdown 装饰符号。 */
function cleanPlayerText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, value => value.replace(/```/g, ''))
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[*_~-]{1,3}\s*/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 玩家阅读态分页：优先在段落边界切页，避免把对白或句子截断。 */
function paginatePlayerText(text: string, pageSize = 1800): string[] {
  const cleaned = cleanPlayerText(text);
  if (!cleaned) return [];
  // 剧本优先按“第 X 幕”分页，确保一幕一页；模型未按要求输出幕标题时再回退到长度分页。
  const actParts = cleaned.split(/(?=^\s*【?第\s*[一二三四五六七八九十百零〇0-9]+\s*幕】?\s*$)/m).map(part => part.trim()).filter(Boolean);
  if (actParts.length > 1) return actParts;
  const paragraphs = cleaned.split(/\n{2,}/).map(paragraph => paragraph.trim()).filter(Boolean);
  const pages: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > pageSize) {
      pages.push(current);
      current = '';
    }
    // 单段过长时按换行切分，最后才按字符切分。
    if (paragraph.length > pageSize) {
      if (current) { pages.push(current); current = ''; }
      for (let index = 0; index < paragraph.length; index += pageSize) {
        pages.push(paragraph.slice(index, index + pageSize));
      }
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) pages.push(current);
  return pages;
}

const styles = [
  '浪漫言情', '恐怖悬疑', '武侠江湖', '侦探推理', '科幻幻想',
  '幽默诙谐', '讽刺批判', '奇幻冒险', '温馨治愈', '官场职场', '仙侠修真',
];

const cluePrompt = (characterName: string) => `请基于原文和已经生成的人物剧本，为剧本杀角色【${characterName}】生成配套“线索”。

必须与人物剧本中的案件、人物关系、知识边界和因果链一致，并遵守：
1. 不写个人任务、胜利条件、幕次、分页指令、时间轴或表格，只输出线索卡与确有必要的实物道具说明。
2. 线索卡按内容分为四类：
   - 人物线索：玩家或 NPC 的身体特征、随身物品、伤痕、气味、衣着和异常状态，用于核对作案手法或还原故事。
   - 现场线索：死者、尸检、案发地点和现场物证，用于判断死亡原因、作案手法和推理方向。
   - 传闻信息：死者生前行为、人物关系和近期事件；明确传闻来源，允许存在偏差，但不能用无依据谣言硬造误导。
   - 设定信息：仅在变格、新本格或特殊世界观确有需要时提供，清楚写明能力边界、触发条件、限制和例外，避免规则漏洞；普通本不要强加设定。
3. 每张卡使用短段落依次写“编号与卡名、类别、获得方式、卡面内容”。卡面只写玩家实际能看到或得知的事实，不写“指向”“误导”“真相解析”等幕后分析。
4. 搜证方式可以是搜查地点或人物、解开小谜题、按顺序选择卡片，或完成一个符合剧情的动作后获得；获得方式必须具体、可执行且与场景相符。
5. 道具必须服务于剧情、角色特征或推理。写清外观、持有人、使用方法和可被发现的细节；可暗藏线索，但不要凭空堆砌符咒、铃铛、梳子、发簪等类型化物件。
6. 控制信息权限：角色私有信息只发给【${characterName}】，公共搜证卡可注明“公开”；不要泄露该角色不可能知道的内容、完整谜底或凶手答案。
7. 所有线索都必须至少能与人物剧本中的一个事实互相印证，并共同形成可推导的证据链；避免重复、矛盾、孤证定案和纯气氛废线索。

只输出可直接用于游戏的线索卡和道具说明，不要生成 DM 手册、主持流程、个人任务、答案复盘或幕后解析。`;

export default function AdaptWorkspace({ bookId, title, author, originalText, translation, translationLoading, onRequestTranslation, characters, sourceTitle, initialMode = 'style', initialScriptSection = 'role' }: Props) {
  const { user, openLogin } = useContext(AuthContext);
  const [mode, setMode] = useState<WorkspaceMode>(initialMode);
  const [style, setStyle] = useState(styles[0]);
  const [styleRequirement, setStyleRequirement] = useState('');
  const [scriptSection, setScriptSection] = useState<ScriptSection>(initialScriptSection);
  const [selectedCharacter, setSelectedCharacter] = useState(characters[0]?.name || '主角');
  const [result, setResult] = useState('');
  const [adaptationReport, setAdaptationReport] = useState('');
  const [loading, setLoading] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [continuationDialogOpen, setContinuationDialogOpen] = useState(false);
  const [continuationRequirement, setContinuationRequirement] = useState('');
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [hydratedCacheKey, setHydratedCacheKey] = useState('');
  const [draftId, setDraftId] = useState<number | undefined>();
  const [persistedVersion, setPersistedVersion] = useState<{ status: api.Creation['status']; content: string } | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>('original');
  const [sourceCollapsed, setSourceCollapsed] = useState(false);
  const streamControllerRef = useRef<AbortController | null>(null);

  const sourceText = sourceMode === 'translation' ? translation : originalText;

  useEffect(() => () => streamControllerRef.current?.abort(), []);

  const request = useMemo(() => {
    if (mode === 'style') {
      const extra = styleRequirement.trim() ? `\n补充要求：${styleRequirement.trim()}` : '';
      return { type: 'adapt' as const, prompt: `请将作品改编为“${style}”风格。保留核心人物关系与主要情节，使语言、节奏和氛围符合该类型。${extra}\n\n请一次性生成改编正文和改编报告，并严格使用以下纯文本标记分隔，不要改写、遗漏标记：\n${ADAPTATION_MARKER}\n（完整改编正文）\n${REPORT_MARKER}\n（改编报告，说明风格策略、情节与人物处理、语言和节奏变化、保留及创新之处）` };
    }
    if (scriptSection === 'role') {
      return { type: 'script' as const, prompt: selectedCharacter };
    }
    return { type: 'script-tasks' as const, prompt: cluePrompt(selectedCharacter) };
  }, [mode, scriptSection, selectedCharacter, style, styleRequirement]);

  // 保存独立分类，避免社区再根据可变的提示词内容猜测类型。
  const creationCategory: api.CreationCategory = mode === 'style'
    ? 'adaptation'
    : scriptSection === 'role' ? 'script' : 'props';
  const cacheKey = `wenxin:workspace:v1:${user?.id || 'guest'}:${bookId}:${creationCategory}`;
  const navigationCacheKey = `wenxin:workspace-nav:v1:${user?.id || 'guest'}:${bookId}`;

  // 页面重新挂载时先恢复上次停留的创作模式，再加载该分类的编辑内容。
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(navigationCacheKey) || 'null') as { mode?: WorkspaceMode; scriptSection?: ScriptSection } | null;
      if (saved?.mode === 'style' || saved?.mode === 'script') setMode(saved.mode);
      // 旧版的“道具 / DM”导航不再存在，统一安全回落到人物剧本。
      if (saved?.scriptSection === 'role' || saved?.scriptSection === 'tasks') setScriptSection(saved.scriptSection);
    } catch { /* 浏览器禁用存储时仍可正常使用在线功能。 */ }
  }, [navigationCacheKey]);

  useEffect(() => {
    try { localStorage.setItem(navigationCacheKey, JSON.stringify({ mode, scriptSection })); } catch { /* 忽略存储配额错误。 */ }
  }, [mode, navigationCacheKey, scriptSection]);

  useEffect(() => {
    if (!user) {
      setDraftId(undefined);
      return;
    }
    let cancelled = false;
    setHydratedCacheKey('');
    setDraftLoading(true);
    const cached = readCache(cacheKey);
    api.getDraft(bookId, creationCategory)
      .then(draft => {
        if (cancelled) return;
        setDraftId(draft?.id);
        // 本地内容可能比服务端草稿更新，优先恢复用户离开页面前的编辑现场。
        setResult(typeof cached?.result === 'string' ? cached.result : draft?.content || '');
        setAdaptationReport(typeof cached?.adaptationReport === 'string' ? cached.adaptationReport : '');
        if (typeof cached?.style === 'string' && styles.includes(cached.style)) setStyle(cached.style);
        if (typeof cached?.styleRequirement === 'string') setStyleRequirement(cached.styleRequirement);
        if (typeof cached?.selectedCharacter === 'string') setSelectedCharacter(cached.selectedCharacter);
        if (typeof cached?.continuationRequirement === 'string') setContinuationRequirement(cached.continuationRequirement);
        setPersistedVersion(draft ? { status: draft.status, content: draft.content } : null);
      })
      .catch(caught => {
        if (!cancelled) toast.error(caught instanceof Error ? caught.message : '草稿恢复失败');
      })
      .finally(() => {
        if (!cancelled) { setDraftLoading(false); setHydratedCacheKey(cacheKey); }
      });
    return () => { cancelled = true; };
  }, [bookId, cacheKey, creationCategory, user]);

  useEffect(() => {
    // 分类切换的首帧不能把空白状态误写到目标分类缓存。
    if (hydratedCacheKey !== cacheKey) return;
    const state: WorkspaceCache = { style, styleRequirement, selectedCharacter, generatedCharacters: [], result, adaptationReport, continuationRequirement };
    try { localStorage.setItem(cacheKey, JSON.stringify(state)); } catch { /* 内容过大或隐私模式下静默降级。 */ }
  }, [adaptationReport, cacheKey, continuationRequirement, hydratedCacheKey, result, selectedCharacter, style, styleRequirement]);

  const generate = async () => {
    if (!user) {
      toast.error('请先登录后使用 AI 创作');
      openLogin();
      return;
    }
    if (!sourceText.trim()) {
      toast.error(`当前作品没有可用于改编的${sourceMode === 'translation' ? '译文' : '原文'}`);
      return;
    }
    try {
      streamControllerRef.current?.abort();
      const controller = new AbortController();
      streamControllerRef.current = controller;
      setLoading(true);
      setResult('');
      if (mode === 'style') setAdaptationReport('');
      let rawResponse = '';
      await api.adaptBookStream(
        sourceText,
        request.type,
        request.prompt,
        content => {
          if (mode !== 'style') {
            rawResponse += content;
            setResult(current => current + content);
            return;
          }
          rawResponse += content;
          const separated = splitAdaptationResponse(rawResponse);
          setResult(separated.content);
          setAdaptationReport(separated.report);
        },
        controller.signal,
      );
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
        toast.error(caught instanceof Error ? caught.message : '内容生成失败');
      }
    } finally {
      streamControllerRef.current = null;
      setLoading(false);
    }
  };

  const changeSourceMode = async (nextMode: SourceMode) => {
    if (nextMode === 'original') {
      setSourceMode('original');
      return;
    }
    setSourceMode('translation');
    if (!translation && !await onRequestTranslation()) setSourceMode('original');
  };

  const continueWriting = async (requirement = '') => {
    if (!user) {
      toast.error('请先登录后使用 AI 续写');
      openLogin();
      return;
    }
    if (!result.trim()) {
      toast.error('请先生成或输入需要续写的内容');
      return;
    }
    try {
      streamControllerRef.current?.abort();
      const controller = new AbortController();
      streamControllerRef.current = controller;
      setContinuing(true);
      setContinuationDialogOpen(false);
      const existingResult = result.trimEnd();
      setResult(`${existingResult}\n\n`);
      await api.adaptBookStream(
        // 仅传递末尾上下文，避免多次续写后请求体超限。
        result.slice(-12000),
        'continue',
        requirement.trim() || '根据上文自由续写，保持文风和情节连贯',
        content => setResult(current => current + content),
        controller.signal,
      );
      setContinuationRequirement('');
      toast.success('续写内容已追加');
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
        toast.error(caught instanceof Error ? caught.message : '续写失败');
      }
    } finally {
      streamControllerRef.current = null;
      setContinuing(false);
    }
  };

  const persist = async (action: 'draft' | 'publish') => {
    if (!user) {
      openLogin();
      return;
    }
    if (!result.trim()) return;
    try {
      if (action === 'draft') setSaving(true);
      else setPublishing(true);
      const creation = await api.saveCreation({
        bookId,
        category: creationCategory,
        prompt: request.prompt,
        content: result,
        action,
        draftId,
      });
      if (action === 'draft') {
        setDraftId(creation.id);
        setPersistedVersion({ status: 'draft', content: creation.content });
        toast.success('已保存到“我的创作 · 草稿”');
      } else {
        setDraftId(undefined);
        setPersistedVersion({ status: creation.status, content: creation.content });
        toast.success(creation.status === 'published' ? '已发布到 UGC 社区' : '已提交审核，通过后将在 UGC 社区公开');
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : action === 'draft' ? '保存失败' : '发布失败');
    } finally {
      if (action === 'draft') setSaving(false);
      else setPublishing(false);
    }
  };

  const exportResult = () => {
    if (!result.trim()) return;
    const exportText = mode === 'script' ? cleanPlayerText(result) : result;
    const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${title}-${mode === 'style' ? style : scriptSection === 'tasks' ? `${selectedCharacter}-线索` : selectedCharacter}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const panel = 'rounded-xl border border-amber-100 bg-white text-gray-800 shadow-lg';
  const outputTitle = mode === 'style'
    ? `${style}风格改编`
    : scriptSection === 'role' ? `${selectedCharacter} · 分幕剧本` : `${selectedCharacter} · 线索`;
  const contentUnchanged = persistedVersion?.content === result.trim();

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-7 text-center">
        <h2 className="title-serif text-2xl sm:text-3xl">{title} - {mode === 'style' ? '风格化改编' : '剧本杀创作'}</h2>
        {(mode !== 'style' || author.trim()) && (
          <p className="mt-1 text-gray-500">{mode === 'style' ? `作者：${author}` : '将经典名著改编为互动剧本杀体验'}</p>
        )}
        <div className="mt-5 inline-flex rounded-lg border border-amber-200 bg-white p-1">
          <button className={`rounded-md px-5 py-2 ${mode === 'style' ? 'bg-amber-700 text-white' : 'text-amber-800'}`} onClick={() => { setMode('style'); setResult(''); setAdaptationReport(''); }}>风格化改编</button>
          <button className={`rounded-md px-5 py-2 ${mode === 'script' ? 'bg-amber-700 text-white' : 'text-amber-800'}`} onClick={() => { setMode('script'); setResult(''); setAdaptationReport(''); }}>剧本杀创作</button>
        </div>
      </div>

      {mode === 'style' ? (
        <>
        <div className="mb-5">
          <OriginalPanel className={panel} text={sourceText} sourceMode={sourceMode}
            loading={translationLoading} disabled={loading || continuing} onSourceChange={changeSourceMode} collapsed={sourceCollapsed} onToggleCollapse={() => setSourceCollapsed(value => !value)} />
        </div>
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(260px,0.85fr)_minmax(560px,2fr)] lg:gap-6">
          <section className={`${panel} min-w-0 p-6`}>
            <h3 className="mb-4 text-xl font-medium"><i className="fa-solid fa-palette mr-2 text-amber-700" />风格选项</h3>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">{styles.map(item => <button key={item} onClick={() => setStyle(item)} className={`rounded-lg border px-4 py-2.5 text-left transition ${style === item ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-transparent hover:bg-amber-50'}`}>{item}</button>)}</div>
            <label className="mt-5 block text-sm text-gray-600">补充要求（可选）</label>
            <textarea value={styleRequirement} onChange={event => setStyleRequirement(event.target.value)} className="mt-2 w-full resize-none rounded-lg border border-amber-200 p-3 focus:outline-none focus:ring-2 focus:ring-amber-400" rows={4} placeholder="例如：使用第一人称，控制在 1500 字内" />
          </section>
          <OutputPanel
            className={panel}
            title={outputTitle}
            result={result}
            onChange={setResult}
            loading={loading}
            onGenerate={generate}
            report={adaptationReport}
            onReportChange={setAdaptationReport}
            continuation={{
              loading: continuing,
              onFree: () => void continueWriting(),
              onCustom: () => setContinuationDialogOpen(true),
              onClear: () => setResult(''),
            }}
          />
        </div>
        </>
      ) : (
        <>
        <ScriptKillerWorkspace bookId={bookId} title={title} sourceTitle={sourceTitle} originalText={originalText} translation={translation} translationLoading={translationLoading} onRequestTranslation={onRequestTranslation} characters={characters} />
        {/* <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(280px,0.75fr)_minmax(560px,1.75fr)] lg:gap-6">
          <OriginalPanel className={panel} text={sourceText} sourceMode={sourceMode}
            loading={translationLoading} disabled={loading || continuing} onSourceChange={changeSourceMode} />
          <div>
            <div className="mb-6 flex items-center rounded-t-xl bg-[#242331] px-3 text-stone-200 shadow-lg">
              <div className="grid flex-1 grid-cols-2">
              {([['role', '人物剧本'], ['tasks', '线索']] as const).map(([key, label]) => (
                <button key={key} onClick={() => { setScriptSection(key); setResult(scriptBatchResults[key] || ''); }} className={`border-b-2 px-4 py-3 text-lg transition ${scriptSection === key ? 'border-amber-400 text-amber-300' : 'border-transparent text-stone-300 hover:text-white'}`}>{label}</button>
              ))}
              </div>
              <button type="button" onClick={() => void generate()} disabled={batchGenerating || loading} className="btn-primary ml-3 whitespace-nowrap text-sm disabled:opacity-50"><i className="fa-solid fa-film mr-1" />{loading ? '分幕生成中…' : '生成分幕剧本'}</button>
            </div>
            {scriptSection === 'role' && (
              <div className="mb-6">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <p className="text-sm text-gray-500">选择角色后，生成依据原文改编、按幕分页的影视化分角色剧本</p>
                  <button onClick={analyzeCharacters} disabled={analyzingCharacters} className="btn-secondary shrink-0 disabled:opacity-50"><i className="fa-solid fa-users-viewfinder mr-2" />{analyzingCharacters ? '分析中...' : roleOptions.length ? '重新分析角色' : 'AI 分析角色'}</button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {(roleOptions.length ? roleOptions : [{ id: -1, name: '主角', description: '点击“AI 分析角色”生成作品专属角色方案' }]).map(character => (
                  <div key={character.id} className={`rounded-lg border bg-white p-5 text-left shadow transition hover:-translate-y-0.5 ${selectedCharacter === character.name ? 'border-amber-400 ring-1 ring-amber-300' : 'border-gray-200'}`}>
                    <button type="button" onClick={() => { setSelectedCharacter(character.name); setResult(''); }} className="block w-full text-left">
                      <strong className="block text-center text-lg font-medium">{character.name}</strong>
                      <span className="mt-2 block text-center text-sm text-gray-500">{character.description || '从原文人物关系中提取角色动机与秘密'}</span>
                    </button>
                    {character.id !== -1 && (
                      <button
                        type="button"
                        onClick={() => void favoriteCharacter(character)}
                        disabled={favoriteSaving === character.id || isFavorite(character)}
                        className="mt-4 w-full rounded-lg border border-amber-200 px-3 py-2 text-sm text-amber-800 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50">
                        <i className={`fa-${isFavorite(character) ? 'solid' : 'regular'} fa-star mr-2`} />{isFavorite(character) ? '已收藏' : favoriteSaving === character.id ? '收藏中...' : '加入数字共演'}
                      </button>
                    )}
                  </div>
                ))}
                </div>
              </div>
            )}
            <OutputPanel className={panel} title={outputTitle} result={result} onChange={setResult} loading={loading} onGenerate={generate} readingMode />
          </div>
        </div> */}
        </>
      )}

      {mode === 'style' && <div className="mt-6 grid grid-cols-1 gap-3 sm:flex sm:justify-center sm:gap-4">
        <button onClick={() => void persist('draft')} disabled={!result.trim() || saving || publishing || draftLoading || Boolean(contentUnchanged)} className="btn-secondary sm:min-w-36 disabled:cursor-not-allowed disabled:opacity-40"><i className="fa-solid fa-floppy-disk mr-2" />{saving ? '保存中...' : '保存'}</button>
        <button onClick={() => void persist('publish')} disabled={!result.trim() || saving || publishing || draftLoading || ((persistedVersion?.status === 'published' || persistedVersion?.status === 'pending') && contentUnchanged)} className="btn-primary sm:min-w-36 disabled:cursor-not-allowed disabled:opacity-40"><i className="fa-solid fa-paper-plane mr-2" />{publishing ? '提交中...' : user?.role === 'admin' ? '发布' : '提交审核'}</button>
        <button onClick={exportResult} disabled={!result.trim()} className="btn-secondary sm:min-w-40 disabled:cursor-not-allowed disabled:opacity-40"><i className="fa-solid fa-download mr-2" />导出</button>
      </div>}

      {continuationDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onMouseDown={() => setContinuationDialogOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="continuation-dialog-title"
            className="w-full max-w-xl rounded-2xl bg-white p-7 text-gray-800 shadow-2xl"
            onMouseDown={event => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 id="continuation-dialog-title" className="title-serif text-2xl">输入续写要求</h3>
                <p className="mt-1 text-sm text-gray-500">AI 会承接当前内容，按你的情节、人物或篇幅要求续写</p>
              </div>
              <button type="button" aria-label="关闭" onClick={() => setContinuationDialogOpen(false)} className="rounded-lg px-3 py-1.5 text-gray-500 hover:bg-gray-100"><i className="fa-solid fa-xmark" /></button>
            </div>
            <textarea
              autoFocus
              value={continuationRequirement}
              maxLength={1000}
              onChange={event => setContinuationRequirement(event.target.value)}
              rows={7}
              className="w-full resize-none rounded-xl border border-amber-200 p-4 leading-7 outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="例如：让主角在雨夜发现新线索，加强悬疑氛围，续写约 1000 字……"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setContinuationDialogOpen(false)} className="btn-secondary">取消</button>
              <button
                type="button"
                disabled={!continuationRequirement.trim() || continuing}
                onClick={() => void continueWriting(continuationRequirement)}
                className="btn-primary min-w-32 disabled:cursor-not-allowed disabled:opacity-50">
                {continuing ? '续写中…' : '开始续写'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OriginalPanel({ className, text, sourceMode, loading, disabled, onSourceChange, collapsed = false, onToggleCollapse }: {
  className: string;
  text: string;
  sourceMode: SourceMode;
  loading: boolean;
  disabled: boolean;
  onSourceChange: (mode: SourceMode) => void | Promise<void>;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  return (
    <section className={`${className} min-w-0 p-4 sm:p-6`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-medium"><i className="fa-solid fa-bookmark mr-2 text-amber-700" />改编素材</h3>
        <div className="flex items-center gap-2"><button type="button" onClick={onToggleCollapse} className="rounded-md border border-amber-200 px-3 py-1.5 text-sm text-amber-800">{collapsed ? '展开' : '折叠'}</button><div className="inline-flex rounded-lg border border-amber-200 bg-amber-50 p-1 text-sm" aria-label="切换改编素材">
          <button type="button" disabled={disabled} onClick={() => void onSourceChange('original')}
            className={`rounded-md px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 ${sourceMode === 'original' ? 'bg-white text-amber-800 shadow-sm' : 'text-gray-600'}`}>
            原文
          </button>
          <button type="button" disabled={disabled || loading} onClick={() => void onSourceChange('translation')}
            className={`rounded-md px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50 ${sourceMode === 'translation' ? 'bg-white text-amber-800 shadow-sm' : 'text-gray-600'}`}>
            {loading ? '译文加载中…' : '译文'}
          </button>
        </div></div>
      </div>
      {!collapsed && <div className="h-[45dvh] min-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-amber-200 p-4 font-serif text-base leading-8 sm:h-[420px] sm:p-5 sm:text-lg">
        {loading && sourceMode === 'translation' ? '正在加载译文…' : text || `暂无${sourceMode === 'translation' ? '译文' : '原文'}`}
      </div>}
    </section>
  );
}

function OutputPanel({ className, title, result, onChange, loading, onGenerate, continuation, report, onReportChange, readingMode }: {
  className: string;
  title: string;
  result: string;
  onChange: (value: string) => void;
  loading: boolean;
  onGenerate: () => void;
  continuation?: { loading: boolean; onFree: () => void; onCustom: () => void; onClear?: () => void };
  report?: string;
  onReportChange?: (value: string) => void;
  readingMode?: boolean;
}) {
  const [preview, setPreview] = useState(false);
  const [continuationMenuOpen, setContinuationMenuOpen] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [readingPage, setReadingPage] = useState(0);
  const displayedText = showReport ? report || '' : result;
  const changeDisplayedText = showReport ? onReportChange : onChange;
  const readingPages = useMemo(() => paginatePlayerText(displayedText), [displayedText]);

  useEffect(() => {
    setReadingPage(0);
  }, [displayedText, readingMode, showReport]);

  return (
    <section className={`${className} min-w-0 p-4 sm:p-6`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-medium"><i className={`fa-solid ${showReport ? 'fa-clipboard-list' : 'fa-pen-to-square'} mr-2 text-amber-700`} />{showReport ? '改编报告' : title}</h3>
        <div className="flex items-center gap-2">
          {report !== undefined && (
            <button type="button" disabled={loading && !report} onClick={() => { setShowReport(current => !current); setPreview(false); }} className="btn-secondary whitespace-nowrap disabled:opacity-50">
              <i className={`fa-solid ${showReport ? 'fa-arrow-left' : 'fa-clipboard-list'} mr-2`} />{showReport ? '返回改编内容' : '查看改编报告'}
            </button>
          )}
          <div className="inline-flex rounded-lg border border-amber-200 bg-amber-50 p-1 text-sm">
            <button onClick={() => setPreview(false)} className={`rounded-md px-3 py-1.5 ${!preview ? 'bg-white text-amber-800 shadow-sm' : 'text-gray-600'}`}>编辑</button>
            <button onClick={() => setPreview(true)} className={`rounded-md px-3 py-1.5 ${preview ? 'bg-white text-amber-800 shadow-sm' : 'text-gray-600'}`}>预览</button>
          </div>
          {!showReport && <button onClick={onGenerate} disabled={loading} className="btn-secondary disabled:opacity-50"><i className="fa-solid fa-wand-magic-sparkles mr-2" />{loading ? '生成中...' : '生成内容'}</button>}
        </div>
      </div>
      {readingMode && !showReport ? (
        <>
          <div className="min-h-[55dvh] max-h-[70dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-stone-700 bg-[#f2ecd8] px-5 py-7 font-serif text-[17px] leading-8 text-stone-800 shadow-inner sm:px-9 sm:py-10 sm:text-lg">
            {loading && !displayedText
              ? '正在生成玩家内容，请稍候……'
              : readingPages[readingPage] || '生成内容后将在这里完整展示。'}
          </div>
          {readingPages.length > 1 && (
            <div className="mt-3 flex items-center justify-center gap-3 text-sm text-stone-600">
              <button type="button" onClick={() => setReadingPage(page => Math.max(0, page - 1))} disabled={readingPage === 0} className="rounded-md border border-amber-200 px-3 py-1.5 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40">上一页</button>
              <span>第 {readingPage + 1} / {readingPages.length} 页</span>
              <button type="button" onClick={() => setReadingPage(page => Math.min(readingPages.length - 1, page + 1))} disabled={readingPage === readingPages.length - 1} className="rounded-md border border-amber-200 px-3 py-1.5 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40">下一页</button>
            </div>
          )}
        </>
      ) : preview ? (
        <div className="h-[55dvh] min-h-80 overflow-y-auto break-words rounded-lg border border-gray-200 p-4 sm:h-[620px] sm:p-5">
          {displayedText.trim() ? <MarkdownContent content={cleanPlayerText(displayedText)} /> : <p className="text-gray-400">{showReport && loading ? 'AI 正在生成改编报告…' : '生成内容后可在这里预览 Markdown 排版效果。'}</p>}
        </div>
      ) : (
        <textarea value={displayedText} onChange={event => changeDisplayedText?.(event.target.value)} className="h-[55dvh] min-h-80 w-full resize-none rounded-lg border border-gray-200 p-4 leading-8 focus:outline-none focus:ring-2 focus:ring-amber-400 sm:h-[620px] sm:p-5" placeholder={loading ? (showReport ? 'AI 正在生成改编报告…' : 'AI 正在创作，请稍候…') : showReport ? '生成后的改编报告将单独显示在这里…' : '生成的内容将显示在这里，生成后可以继续编辑…'} />
      )}
      {continuation && !showReport && (
        <div className="relative mt-4 flex justify-center gap-3">
          {continuation.onClear && <button type="button" onClick={continuation.onClear} disabled={!result.trim() || loading || continuation.loading} className="btn-secondary min-w-28 disabled:opacity-40">清空</button>}
          <button
            type="button"
            disabled={!result.trim() || loading || continuation.loading}
            onClick={() => setContinuationMenuOpen(open => !open)}
            className="btn-primary min-w-36 disabled:cursor-not-allowed disabled:opacity-40">
            <i className="fa-solid fa-feather-pointed mr-2" />{continuation.loading ? '续写中…' : '续写'}
            {!continuation.loading && <i className={`fa-solid fa-chevron-${continuationMenuOpen ? 'up' : 'down'} ml-2 text-xs`} />}
          </button>
          {continuationMenuOpen && !continuation.loading && (
            <div className="absolute bottom-full z-20 mb-2 w-52 overflow-hidden rounded-xl border border-amber-200 bg-white p-2 shadow-xl">
              <button type="button" onClick={() => { setContinuationMenuOpen(false); continuation.onFree(); }} className="w-full rounded-lg px-4 py-3 text-left text-sm hover:bg-amber-50"><i className="fa-solid fa-wand-magic-sparkles mr-2 text-amber-700" />AI 自由续写</button>
              <button type="button" onClick={() => { setContinuationMenuOpen(false); continuation.onCustom(); }} className="w-full rounded-lg px-4 py-3 text-left text-sm hover:bg-amber-50"><i className="fa-solid fa-pen mr-2 text-amber-700" />我有续写要求</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
