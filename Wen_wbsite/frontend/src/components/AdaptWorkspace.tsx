import { useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AuthContext } from '@/contexts/authContext';
import MarkdownContent from '@/components/MarkdownContent';
import * as api from '@/api';

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
  characters: Character[];
  sourceTitle?: string;
  sourceChapterTitle?: string | null;
  initialMode?: WorkspaceMode;
  initialScriptSection?: ScriptSection;
}

type WorkspaceMode = 'style' | 'script';
type ScriptSection = 'props' | 'role' | 'dm';

interface WorkspaceCache {
  style: string;
  styleRequirement: string;
  selectedCharacter: string;
  generatedCharacters: Character[];
  result: string;
  continuationRequirement: string;
}

function readCache(key: string): Partial<WorkspaceCache> | null {
  try { return JSON.parse(localStorage.getItem(key) || 'null') as Partial<WorkspaceCache> | null; } catch { return null; }
}

const styles = [
  '浪漫言情', '恐怖悬疑', '武侠江湖', '侦探推理', '科幻幻想',
  '幽默诙谐', '讽刺批判', '奇幻冒险', '温馨治愈', '官场职场', '仙侠修真',
];

const scriptSectionCopy: Record<Exclude<ScriptSection, 'role'>, { title: string; prompt: string }> = {
  props: {
    title: '关键道具',
    prompt: '请将原文设计成剧本杀，整理关键道具清单。逐项说明道具外观、持有人、出现时机、公开信息、隐藏线索以及与真相的关系。',
  },
  dm: {
    title: 'DM 主持手册',
    prompt: '请将原文设计成可主持的剧本杀，并生成 DM 主持手册。包含背景导入、流程阶段、线索投放、关键时间点、控场提示、谜底与复盘话术。',
  },
};

export default function AdaptWorkspace({ bookId, chapterId, title, author, originalText, characters, sourceTitle, sourceChapterTitle, initialMode = 'style', initialScriptSection = 'role' }: Props) {
  const { user, openLogin } = useContext(AuthContext);
  const [mode, setMode] = useState<WorkspaceMode>(initialMode);
  const [style, setStyle] = useState(styles[0]);
  const [styleRequirement, setStyleRequirement] = useState('');
  const [scriptSection, setScriptSection] = useState<ScriptSection>(initialScriptSection);
  const [selectedCharacter, setSelectedCharacter] = useState(characters[0]?.name || '主角');
  const [generatedCharacters, setGeneratedCharacters] = useState<Character[]>([]);
  const [analyzingCharacters, setAnalyzingCharacters] = useState(false);
  const [result, setResult] = useState('');
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
  const [favoriteCharacters, setFavoriteCharacters] = useState<api.FavoriteCharacter[]>([]);
  const [favoriteSaving, setFavoriteSaving] = useState<number | null>(null);

  const roleOptions = generatedCharacters.length > 0 ? generatedCharacters : characters;

  useEffect(() => {
    if (roleOptions.length > 0 && !roleOptions.some(character => character.name === selectedCharacter)) {
      setSelectedCharacter(roleOptions[0].name);
    }
  }, [roleOptions, selectedCharacter]);

  useEffect(() => {
    if (!user) {
      setFavoriteCharacters([]);
      return;
    }
    api.getFavoriteCharacters()
      .then(setFavoriteCharacters)
      .catch(caught => toast.error(caught instanceof Error ? caught.message : '收藏角色加载失败'));
  }, [user]);

  const request = useMemo(() => {
    if (mode === 'style') {
      const extra = styleRequirement.trim() ? `\n补充要求：${styleRequirement.trim()}` : '';
      return { type: 'adapt' as const, prompt: `请将作品改编为“${style}”风格。保留核心人物关系与主要情节，使语言、节奏和氛围符合该类型。${extra}` };
    }
    if (scriptSection === 'role') {
      return { type: 'script' as const, prompt: selectedCharacter };
    }
    return { type: 'custom' as const, prompt: scriptSectionCopy[scriptSection].prompt };
  }, [mode, scriptSection, selectedCharacter, style, styleRequirement]);

  // 保存独立分类，避免社区再根据可变的提示词内容猜测类型。
  const creationCategory: api.CreationCategory = mode === 'style'
    ? 'adaptation'
    : scriptSection === 'role' ? 'script' : scriptSection;
  const cacheKey = `wenxin:workspace:v1:${user?.id || 'guest'}:${bookId}:${creationCategory}`;
  const navigationCacheKey = `wenxin:workspace-nav:v1:${user?.id || 'guest'}:${bookId}`;

  // 页面重新挂载时先恢复上次停留的创作模式，再加载该分类的编辑内容。
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(navigationCacheKey) || 'null') as { mode?: WorkspaceMode; scriptSection?: ScriptSection } | null;
      if (saved?.mode === 'style' || saved?.mode === 'script') setMode(saved.mode);
      if (saved?.scriptSection === 'props' || saved?.scriptSection === 'role' || saved?.scriptSection === 'dm') setScriptSection(saved.scriptSection);
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
        if (typeof cached?.style === 'string' && styles.includes(cached.style)) setStyle(cached.style);
        if (typeof cached?.styleRequirement === 'string') setStyleRequirement(cached.styleRequirement);
        if (typeof cached?.selectedCharacter === 'string') setSelectedCharacter(cached.selectedCharacter);
        if (Array.isArray(cached?.generatedCharacters)) setGeneratedCharacters(cached.generatedCharacters);
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
    const state: WorkspaceCache = { style, styleRequirement, selectedCharacter, generatedCharacters, result, continuationRequirement };
    try { localStorage.setItem(cacheKey, JSON.stringify(state)); } catch { /* 内容过大或隐私模式下静默降级。 */ }
  }, [cacheKey, continuationRequirement, generatedCharacters, hydratedCacheKey, result, selectedCharacter, style, styleRequirement]);

  const generate = async () => {
    if (!user) {
      toast.error('请先登录后使用 AI 创作');
      openLogin();
      return;
    }
    if (!originalText.trim()) {
      toast.error('当前作品没有可用于改编的原文');
      return;
    }
    try {
      setLoading(true);
      setResult(await api.adaptBook(originalText, request.type, request.prompt));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '内容生成失败');
    } finally {
      setLoading(false);
    }
  };

  const analyzeCharacters = async () => {
    if (!user) {
      toast.error('请先登录后分析角色');
      openLogin();
      return;
    }
    try {
      setAnalyzingCharacters(true);
      const response = await api.adaptBook(
        originalText,
        'custom',
        '提取最适合剧本杀和数字共演的 3-6 个主要角色。严格只输出合法 JSON 数组，不使用 Markdown。数组元素格式为 {"name":"角色名","description":"不超过30字的身份、性格及人物关系简介","deeds":"该角色在原文中的主要事迹，80-180字"}。不要编号，不要输出其他内容。',
      );
      const normalized = response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const rows = JSON.parse(normalized) as Array<{ name?: unknown; description?: unknown; deeds?: unknown }>;
      if (!Array.isArray(rows)) throw new Error('AI 返回的角色结构无效');
      const parsed = rows.map((row, index) => ({
        id: -(index + 100),
        name: typeof row.name === 'string' ? row.name.trim().slice(0, 20) : '',
        description: typeof row.description === 'string' ? row.description.trim().slice(0, 60) : null,
        deeds: typeof row.deeds === 'string' ? row.deeds.trim().slice(0, 300) : null,
      })).filter(character => character.name).slice(0, 6) as Character[];
      if (parsed.length === 0) throw new Error('未能识别角色，请稍后重试');
      setGeneratedCharacters(parsed);
      setSelectedCharacter(parsed[0].name);
      toast.success('角色方案已生成');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '角色分析失败');
    } finally {
      setAnalyzingCharacters(false);
    }
  };

  const isFavorite = (character: Character) => favoriteCharacters.some(favorite => (
    favorite.bookId === bookId
    && favorite.chapterId === (chapterId || null)
    && favorite.name === character.name
    && favorite.sourceType === (character.id > 0 ? 'database' : 'ai')
  ));

  const favoriteCharacter = async (character: Character) => {
    if (!user) {
      toast.error('请先登录后收藏角色');
      openLogin();
      return;
    }
    try {
      setFavoriteSaving(character.id);
      const favorite = await api.addFavoriteCharacter({
        bookId,
        chapterId: chapterId || undefined,
        characterId: character.id > 0 ? character.id : undefined,
        name: character.name,
        description: character.description,
        deeds: character.deeds || null,
        sourceType: character.id > 0 ? 'database' : 'ai',
        sourceTitle: sourceTitle || title,
        sourceChapterTitle,
      });
      setFavoriteCharacters(current => current.some(item => item.id === favorite.id) ? current : [favorite, ...current]);
      toast.success('已加入数字共演收藏夹');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '收藏角色失败');
    } finally {
      setFavoriteSaving(null);
    }
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
      setContinuing(true);
      setContinuationDialogOpen(false);
      const continuation = await api.adaptBook(
        // 仅传递末尾上下文，避免多次续写后请求体超限。
        result.slice(-12000),
        'continue',
        requirement.trim() || '根据上文自由续写，保持文风和情节连贯',
      );
      setResult(current => `${current.trimEnd()}\n\n${continuation.trimStart()}`);
      setContinuationRequirement('');
      toast.success('续写内容已追加');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '续写失败');
    } finally {
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
    const blob = new Blob([result], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${title}-${mode === 'style' ? style : scriptSectionCopy[scriptSection as Exclude<ScriptSection, 'role'>]?.title || selectedCharacter}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const panel = 'rounded-xl border border-amber-100 bg-white text-gray-800 shadow-lg';
  const outputTitle = mode === 'style'
    ? `${style}风格改编`
    : scriptSection === 'role' ? `${selectedCharacter} · 角色剧本` : scriptSectionCopy[scriptSection].title;
  const contentUnchanged = persistedVersion?.content === result.trim();

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-7 text-center">
        <h2 className="title-serif text-3xl">{title} - {mode === 'style' ? '风格化改编' : '剧本杀创作'}</h2>
        {(mode !== 'style' || author.trim()) && (
          <p className="mt-1 text-gray-500">{mode === 'style' ? `作者：${author}` : '将经典名著改编为互动剧本杀体验'}</p>
        )}
        <div className="mt-5 inline-flex rounded-lg border border-amber-200 bg-white p-1">
          <button className={`rounded-md px-5 py-2 ${mode === 'style' ? 'bg-amber-700 text-white' : 'text-amber-800'}`} onClick={() => { setMode('style'); setResult(''); }}>风格化改编</button>
          <button className={`rounded-md px-5 py-2 ${mode === 'script' ? 'bg-amber-700 text-white' : 'text-amber-800'}`} onClick={() => { setMode('script'); setResult(''); }}>剧本杀创作</button>
        </div>
      </div>

      {mode === 'style' ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(260px,0.85fr)_minmax(380px,1.2fr)_minmax(220px,0.65fr)]">
          <OriginalPanel className={panel} text={originalText} />
          <OutputPanel
            className={panel}
            title={outputTitle}
            result={result}
            onChange={setResult}
            loading={loading}
            onGenerate={generate}
            continuation={{
              loading: continuing,
              onFree: () => void continueWriting(),
              onCustom: () => setContinuationDialogOpen(true),
            }}
          />
          <section className={`${panel} p-6`}>
            <h3 className="mb-4 text-xl font-medium"><i className="fa-solid fa-palette mr-2 text-amber-700" />风格选项</h3>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {styles.map(item => <button key={item} onClick={() => setStyle(item)} className={`rounded-lg border px-4 py-2.5 text-left transition ${style === item ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-transparent hover:bg-amber-50'}`}>{item}</button>)}
            </div>
            <label className="mt-5 block text-sm text-gray-600">补充要求（可选）</label>
            <textarea value={styleRequirement} onChange={event => setStyleRequirement(event.target.value)} className="mt-2 w-full resize-none rounded-lg border border-amber-200 p-3 focus:outline-none focus:ring-2 focus:ring-amber-400" rows={4} placeholder="例如：使用第一人称，控制在 1500 字内" />
          </section>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(280px,0.75fr)_minmax(560px,1.75fr)]">
          <OriginalPanel className={panel} text={originalText} />
          <div>
            <div className="mb-6 grid grid-cols-3 border-b border-amber-200">
              {([['props', '道具'], ['role', '分角色剧本'], ['dm', 'DM(主持人)']] as const).map(([key, label]) => (
                <button key={key} onClick={() => { setScriptSection(key); setResult(''); }} className={`border-b-2 px-4 py-3 text-lg ${scriptSection === key ? 'border-amber-600 text-amber-800' : 'border-transparent text-gray-600'}`}>{label}</button>
              ))}
            </div>
            {scriptSection === 'role' && (
              <div className="mb-6">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <p className="text-sm text-gray-500">选择角色后生成其背景、秘密、目标、关系和行动时间线</p>
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
            <OutputPanel className={panel} title={outputTitle} result={result} onChange={setResult} loading={loading} onGenerate={generate} />
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-center gap-4">
        <button onClick={() => void persist('draft')} disabled={!result.trim() || saving || publishing || draftLoading || Boolean(contentUnchanged)} className="btn-secondary min-w-36 disabled:cursor-not-allowed disabled:opacity-40"><i className="fa-solid fa-floppy-disk mr-2" />{saving ? '保存中...' : '保存'}</button>
        <button onClick={() => void persist('publish')} disabled={!result.trim() || saving || publishing || draftLoading || ((persistedVersion?.status === 'published' || persistedVersion?.status === 'pending') && contentUnchanged)} className="btn-primary min-w-36 disabled:cursor-not-allowed disabled:opacity-40"><i className="fa-solid fa-paper-plane mr-2" />{publishing ? '提交中...' : user?.role === 'admin' ? '发布' : '提交审核'}</button>
        <button onClick={exportResult} disabled={!result.trim()} className="btn-secondary min-w-40 disabled:cursor-not-allowed disabled:opacity-40"><i className="fa-solid fa-download mr-2" />导出</button>
      </div>

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

function OriginalPanel({ className, text }: { className: string; text: string }) {
  return <section className={`${className} p-6`}><h3 className="mb-4 text-xl font-medium"><i className="fa-solid fa-bookmark mr-2 text-amber-700" />原文</h3><div className="h-[620px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-amber-200 p-5 font-serif text-lg leading-8">{text || '暂无原文'}</div></section>;
}

function OutputPanel({ className, title, result, onChange, loading, onGenerate, continuation }: {
  className: string;
  title: string;
  result: string;
  onChange: (value: string) => void;
  loading: boolean;
  onGenerate: () => void;
  continuation?: { loading: boolean; onFree: () => void; onCustom: () => void };
}) {
  const [preview, setPreview] = useState(false);
  const [continuationMenuOpen, setContinuationMenuOpen] = useState(false);

  return (
    <section className={`${className} p-6`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-medium"><i className="fa-solid fa-pen-to-square mr-2 text-amber-700" />{title}</h3>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-amber-200 bg-amber-50 p-1 text-sm">
            <button onClick={() => setPreview(false)} className={`rounded-md px-3 py-1.5 ${!preview ? 'bg-white text-amber-800 shadow-sm' : 'text-gray-600'}`}>编辑</button>
            <button onClick={() => setPreview(true)} className={`rounded-md px-3 py-1.5 ${preview ? 'bg-white text-amber-800 shadow-sm' : 'text-gray-600'}`}>预览</button>
          </div>
          <button onClick={onGenerate} disabled={loading} className="btn-secondary disabled:opacity-50"><i className="fa-solid fa-wand-magic-sparkles mr-2" />{loading ? '生成中...' : '生成内容'}</button>
        </div>
      </div>
      {preview ? (
        <div className="h-[620px] overflow-y-auto rounded-lg border border-gray-200 p-5">
          {result.trim() ? <MarkdownContent content={result} /> : <p className="text-gray-400">生成内容后可在这里预览 Markdown 排版效果。</p>}
        </div>
      ) : (
        <textarea value={result} onChange={event => onChange(event.target.value)} className="h-[620px] w-full resize-none rounded-lg border border-gray-200 p-5 leading-8 focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder={loading ? 'AI 正在创作，请稍候…' : '生成的内容将显示在这里，生成后可以继续编辑…'} />
      )}
      {continuation && (
        <div className="relative mt-4 flex justify-center">
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
