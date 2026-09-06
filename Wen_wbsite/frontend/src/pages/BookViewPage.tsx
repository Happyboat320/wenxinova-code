import { useContext, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import * as api from '@/api';
import AdaptWorkspace from '@/components/AdaptWorkspace';
import KnowledgeGraphView from '@/components/KnowledgeGraphView';
import { AuthContext } from '@/contexts/authContext';
import SiteHeader from '@/components/SiteHeader';
import { READING_FONT_SIZES, useReadingPreferences, type ReadingBackground } from '@/hooks/useReadingPreferences';

type ReadingTab = 'original' | 'annotated' | 'translation';
type PageTab = ReadingTab | 'adapt' | 'knowledge';

interface BookData {
  id: number;
  title: string;
  author: string;
  content: string;
  chapter: (api.BookChapterOption & { summary: string | null }) | null;
  chapters: api.BookChapterOption[];
  annotations: { index: number; content: string }[];
  characters: { id: number; name: string; description: string | null }[];
}

const MARKER_PATTERN = /(\[\d+\]|【\d+】|〔\d+〕)/g;
const ESCAPED_MARKER_PATTERN = /\\(?=\[\d+\])/g;

export default function BookViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, openLogin } = useContext(AuthContext);
  const bookId = Number.parseInt(id || '', 10);
  const requestedChapterValue = new URLSearchParams(location.search).get('chapter');
  const requestedChapterId = requestedChapterValue ? Number.parseInt(requestedChapterValue, 10) : undefined;

  const [bookData, setBookData] = useState<BookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PageTab>('original');
  const [translation, setTranslation] = useState('');
  const [translationLoading, setTranslationLoading] = useState(false);
  const [editingField, setEditingField] = useState<'original' | 'translation' | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [savingContent, setSavingContent] = useState(false);
  const isAdmin = user?.role === 'admin';
  const { preferences, setPreferences } = useReadingPreferences();

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab');
    if (tab && ['original', 'annotated', 'translation', 'adapt', 'knowledge'].includes(tab)) {
      setActiveTab(tab as PageTab);
    }
  }, [location.search]);

  useEffect(() => { if (bookData && bookData.annotations.length === 0 && activeTab === 'annotated') setActiveTab('original'); }, [activeTab, bookData]);

  useEffect(() => {
    const load = async () => {
      if (!Number.isInteger(bookId) || bookId <= 0) {
        setError('无效的书籍编号');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const data = await api.getBookContent(bookId, requestedChapterId);
        setBookData({ id: bookId, ...data });
        // 每个回目的译文相互独立，切换时不能继续展示上一回内容。
        setTranslation('');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '加载书籍数据失败');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [bookId, requestedChapterId]);

  const annotationsByIndex = useMemo(
    () => new Map(bookData?.annotations.map(annotation => [annotation.index, annotation.content]) || []),
    [bookData?.annotations],
  );

  const loadTranslation = async (): Promise<boolean> => {
    if (translation) return true;
    if (!user) {
      toast.error('请先登录后查看译文');
      openLogin();
      return false;
    }
    try {
      setTranslationLoading(true);
      const content = await api.getBookTranslation(bookId, bookData?.chapter?.id);
      setTranslation(content);
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '加载译文失败');
      return false;
    } finally {
      setTranslationLoading(false);
    }
  };

  const beginEdit = (field: 'original' | 'translation') => {
    const current = field === 'original' ? bookData?.content : translation;
    if (!current) return;
    setDraftContent(current);
    setEditingField(field);
  };

  const saveEdit = async () => {
    if (!editingField || !draftContent.trim() || !bookData) { toast.error('内容不能为空'); return; }
    try {
      setSavingContent(true);
      const updated = await api.updateBookContent(bookId, { chapterId: bookData.chapter?.id, field: editingField, content: draftContent });
      if (editingField === 'original') setBookData(current => current ? { ...current, content: updated } : current);
      else setTranslation(updated);
      setEditingField(null);
      toast.success('内容已保存');
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : '保存内容失败'); }
    finally { setSavingContent(false); }
  };

  const showTranslation = () => {
    setActiveTab('translation');
    void loadTranslation();
  };

  const indentLines = (text: string) => bookData?.title === '明清传奇' ? text : text.split('\n').map(line => `　　${line}`).join('\n');
  const renderText = (text: string, annotated: boolean) => {
    const normalized = text.replace(ESCAPED_MARKER_PATTERN, '');
    if (!annotated) return indentLines(normalized.replace(MARKER_PATTERN, ''));

    return indentLines(normalized).split(MARKER_PATTERN).map((part, index) => {
      const number = part.match(/\d+/)?.[0];
      if (!number) return <span key={index}>{part}</span>;
      const annotationIndex = Number(number);
      const content = annotationsByIndex.get(annotationIndex);
      return (
        <span key={`${annotationIndex}-${index}`} className="group relative inline-block">
          <button type="button" className="mx-0.5 align-super text-xs font-semibold text-amber-700 underline decoration-dotted underline-offset-2"
            aria-label={`查看注释 ${annotationIndex}`}>
            [{annotationIndex}]
          </button>
          {content && (
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-64 -translate-x-1/2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-sm font-normal leading-6 text-stone-700 shadow-xl sm:group-hover:block sm:group-focus-within:block">
              <strong className="mr-1 text-amber-800">[{annotationIndex}]</strong>{content}
              <span className="absolute left-1/2 top-full -translate-x-1/2 border-8 border-transparent border-t-amber-200" />
            </span>
          )}
        </span>
      );
    });
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#f8f5ef] text-stone-600">正在展开书卷…</div>;
  if (error || !bookData) return <div className="flex min-h-screen items-center justify-center bg-[#f8f5ef] text-red-700">{error || '书籍不存在'}</div>;

  const readingActive = activeTab !== 'adapt' && activeTab !== 'knowledge';
  const requestedSection = new URLSearchParams(location.search).get('section');
  const initialScriptSection = requestedSection === 'props' || requestedSection === 'dm' ? requestedSection : 'role';
  const activeChapterIndex = bookData.chapter
    ? bookData.chapters.findIndex(chapter => chapter.id === bookData.chapter?.id)
    : -1;

  const changeChapter = (chapterId: number) => {
    const params = new URLSearchParams(location.search);
    params.set('chapter', String(chapterId));
    navigate({ search: params.toString() });
  };
  const fontSizeIndex = READING_FONT_SIZES.indexOf(preferences.fontSize as typeof READING_FONT_SIZES[number]);
  const adjustFontSize = (direction: -1 | 1) => {
    const nextSize = READING_FONT_SIZES[fontSizeIndex + direction];
    if (nextSize) setPreferences(current => ({ ...current, fontSize: nextSize }));
  };
  const hasNextChapter = activeChapterIndex >= 0 && activeChapterIndex < bookData.chapters.length - 1;
  const backgroundStyle: CSSProperties = preferences.background === 'custom' && preferences.customImage
    ? { backgroundImage: `url(${preferences.customImage})`, backgroundSize: 'cover', backgroundAttachment: 'fixed' }
    : {};

  return (
    <div style={backgroundStyle} className={`reading-page reading-theme-${preferences.background} min-h-screen`}>
      <div className="reading-header border-b px-4 py-4 sm:px-6 lg:px-12">
        <SiteHeader beforeNavigation={<button onClick={() => navigate('/classical-library')} className="reading-muted transition hover:opacity-75">← 返回文库</button>} />
      </div>

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <div className="mb-7 text-center">
          <h1 className="reading-accent font-serif text-3xl font-bold">{bookData.title}</h1>
          {bookData.author.trim() && <p className="reading-muted mt-2">作者：{bookData.author}</p>}
          {bookData.chapter && <p className="reading-accent mt-3 font-serif text-xl">{bookData.chapter.title}</p>}
        </div>

        {bookData.chapters.length > 0 && bookData.chapter && (
          <section className="reading-card mb-7 rounded-xl border p-4 shadow-sm" aria-label="回目切换">
            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-center">
              <button
                type="button"
                disabled={activeChapterIndex <= 0}
                onClick={() => changeChapter(bookData.chapters[activeChapterIndex - 1].id)}
                className="reading-button rounded-lg border px-4 py-2 transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                <i className="fa-solid fa-chevron-left mr-2" />上一回
              </button>
              <label htmlFor="chapter-select" className="sr-only">选择回目</label>
              <select
                id="chapter-select"
                value={bookData.chapter.id}
                onChange={event => changeChapter(Number(event.target.value))}
                className="reading-control order-first col-span-2 w-full rounded-lg border px-4 py-2.5 focus:outline-none focus:ring-2 sm:order-none sm:w-auto sm:min-w-[20rem]"
              >
                {bookData.chapters.map(chapter => (
                  <option key={chapter.id} value={chapter.id}>{chapter.title}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={activeChapterIndex < 0 || activeChapterIndex >= bookData.chapters.length - 1}
                onClick={() => changeChapter(bookData.chapters[activeChapterIndex + 1].id)}
                className="reading-button rounded-lg border px-4 py-2 transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                下一回<i className="fa-solid fa-chevron-right ml-2" />
              </button>
            </div>
            {bookData.chapter.summary && (
              <p className="reading-divider reading-muted mx-auto mt-4 max-w-4xl border-t pt-4 text-sm leading-7">
                <span className="reading-accent font-medium">本回梗概：</span>{bookData.chapter.summary}
              </p>
            )}
          </section>
        )}

        <div className="mb-8 grid grid-cols-3 border-b border-amber-200/70">
          <button onClick={() => { if (!readingActive) setActiveTab('original'); }}
            className={`px-2 py-3 text-sm transition sm:px-8 sm:text-base ${readingActive ? 'border-b-2 border-amber-600 bg-amber-50 text-amber-800' : 'text-stone-600 hover:text-amber-800'}`}>
            阅读文本
          </button>
          <button onClick={() => setActiveTab('knowledge')} className={`px-2 py-3 text-sm transition sm:px-8 sm:text-base ${activeTab === 'knowledge' ? 'border-b-2 border-amber-600 bg-amber-50 text-amber-800' : 'text-stone-600 hover:text-amber-800'}`}>知识图谱</button>
          <button onClick={() => setActiveTab('adapt')}
            className={`px-2 py-3 text-sm transition sm:px-8 sm:text-base ${activeTab === 'adapt' ? 'border-b-2 border-amber-600 bg-amber-50 text-amber-800' : 'text-stone-600 hover:text-amber-800'}`}>
            创意工坊
          </button>
        </div>

        {readingActive ? (
          <section className="reading-card rounded-xl border p-5 shadow-lg sm:p-8">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <h2 className="reading-accent font-serif text-xl font-semibold">文本阅读</h2>
              <div className="reading-muted flex flex-wrap items-center gap-3 text-sm">
                <span>共 {bookData.annotations.length} 条注释</span>
                <div className="reading-control inline-flex items-center overflow-hidden rounded-lg border" aria-label={`当前字号 ${preferences.fontSize} 像素`}>
                  <button type="button" aria-label="减小字号" disabled={fontSizeIndex <= 0} onClick={() => adjustFontSize(-1)} className="reading-step-button px-3 py-1 font-bold disabled:cursor-not-allowed disabled:opacity-35">−</button>
                  <span className="min-w-14 border-x px-2 py-1 text-center tabular-nums">{preferences.fontSize}px</span>
                  <button type="button" aria-label="增大字号" disabled={fontSizeIndex >= READING_FONT_SIZES.length - 1} onClick={() => adjustFontSize(1)} className="reading-step-button px-3 py-1 font-bold disabled:cursor-not-allowed disabled:opacity-35">+</button>
                </div>
                <label>背景 <select value={preferences.background} onChange={e => setPreferences(p => ({ ...p, background: e.target.value as ReadingBackground }))} className="reading-control rounded border px-2 py-1"><option value="paper">宣纸</option><option value="mist">雾灰</option><option value="green">青绿</option><option value="ink">墨色</option><option value="custom">本地图片</option></select></label>
                <label className="reading-accent cursor-pointer">选图<input type="file" accept="image/*" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setPreferences(p => ({ ...p, background: 'custom', customImage: String(reader.result) })); reader.readAsDataURL(file); }} /></label>
              </div>
            </div>
            <div className="mb-6 flex flex-wrap gap-3">
              <button onClick={() => setActiveTab('original')} className={`rounded-lg border px-5 py-2 ${activeTab === 'original' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-stone-200 hover:bg-stone-50'}`}>原文</button>
              {bookData.annotations.length > 0 && <button onClick={() => setActiveTab('annotated')} className={`rounded-lg border px-5 py-2 ${activeTab === 'annotated' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-stone-200 hover:bg-stone-50'}`}>原文 + 注释</button>}
              <button onClick={showTranslation} className={`rounded-lg border px-5 py-2 ${activeTab === 'translation' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-stone-200 hover:bg-stone-50'}`}>译文</button>
            </div>

            {activeTab === 'translation' ? (
              <div style={{ fontSize: `${preferences.fontSize}px` }} className="reading-paper min-h-[320px] break-words rounded-lg border p-4 font-serif leading-8 sm:min-h-[420px] sm:p-6 sm:leading-9">
                {translationLoading ? '正在生成译文…' : translation ? (editingField === 'translation' ? <textarea value={draftContent} onChange={event => setDraftContent(event.target.value)} className="min-h-[360px] w-full resize-y rounded border border-amber-300 bg-transparent p-3 font-serif leading-8 outline-none" /> : <div className="whitespace-pre-wrap">{indentLines(translation)}</div>) : (
                  <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 text-stone-400">
                    <i className="fa-regular fa-file-lines text-3xl" />
                    <p>{user ? '点击“译文”加载内容' : '登录后可查看译文'}</p>
                    <button onClick={showTranslation} className="rounded-lg bg-amber-700 px-5 py-2 text-sm text-white hover:bg-amber-800">{user ? '加载译文' : '立即登录'}</button>
                  </div>
                )}
                {isAdmin && translation && !translationLoading && <div className="mt-4 flex gap-3"><button type="button" onClick={() => editingField === 'translation' ? void saveEdit() : beginEdit('translation')} disabled={savingContent} className="rounded-lg bg-amber-700 px-4 py-2 text-sm text-white">{editingField === 'translation' ? (savingContent ? '保存中…' : '保存') : '编辑'}</button>{editingField === 'translation' && <button type="button" onClick={() => setEditingField(null)} className="rounded-lg border border-stone-300 px-4 py-2 text-sm">取消</button>}</div>}
              </div>
            ) : (
              <>
                <article style={{ fontSize: `${preferences.fontSize}px` }} className="reading-paper min-h-[320px] whitespace-pre-wrap break-words rounded-lg border p-4 font-serif leading-8 sm:min-h-[420px] sm:p-8 sm:leading-9">
                  {editingField === 'original' ? <textarea value={draftContent} onChange={event => setDraftContent(event.target.value)} className="min-h-[360px] w-full resize-y rounded border border-amber-300 bg-transparent p-3 font-serif leading-8 outline-none" /> : renderText(bookData.content, activeTab === 'annotated')}
                </article>
                {isAdmin && activeTab !== 'annotated' && <div className="mt-4 flex gap-3"><button type="button" onClick={() => editingField === 'original' ? void saveEdit() : beginEdit('original')} disabled={savingContent} className="rounded-lg bg-amber-700 px-4 py-2 text-sm text-white">{editingField === 'original' ? (savingContent ? '保存中…' : '保存') : '编辑'}</button>{editingField === 'original' && <button type="button" onClick={() => setEditingField(null)} className="rounded-lg border border-stone-300 px-4 py-2 text-sm">取消</button>}</div>}
                {activeTab === 'annotated' && (
                  <aside className="mt-6 rounded-lg border border-amber-100 bg-amber-50/50 p-5">
                    <h3 className="mb-4 font-serif text-lg font-semibold text-amber-900">注释</h3>
                    {bookData.annotations.length ? (
                      <ol className="max-h-80 space-y-3 overflow-y-auto pr-3 text-sm leading-6 text-stone-700">
                        {bookData.annotations.map(annotation => (
                          <li key={annotation.index} className="grid grid-cols-[auto_1fr] gap-2">
                            <span className="font-semibold text-amber-800">[{annotation.index}]</span>
                            <span>{annotation.content}</span>
                          </li>
                        ))}
                      </ol>
                    ) : <p className="text-sm text-stone-500">本篇暂未收录注释。</p>}
                  </aside>
                )}
                <p className="mt-4 text-sm text-stone-400"><span className="sm:hidden">提示：手机端可在正文下方的注释列表集中查看释义。</span><span className="hidden sm:inline">提示：悬停或聚焦注释序号即可查看释义。</span></p>
              </>
            )}
            {hasNextChapter && (
              <div className="mt-8 flex justify-end border-t border-current/10 pt-6">
                <button type="button" onClick={() => changeChapter(bookData.chapters[activeChapterIndex + 1].id)} className="reading-button rounded-lg border px-5 py-2.5 text-sm font-medium transition">
                  下一回：{bookData.chapters[activeChapterIndex + 1].title}<i className="fa-solid fa-chevron-right ml-2" />
                </button>
              </div>
            )}
          </section>
        ) : activeTab === 'knowledge' ? (
          <KnowledgeGraphView bookId={bookId} />
        ) : (
          <AdaptWorkspace key={bookData.chapter?.id || 'single'} bookId={bookId}
            chapterId={bookData.chapter?.id || null}
            title={bookData.chapter ? `${bookData.title} · ${bookData.chapter.title}` : bookData.title} author={bookData.author}
            sourceTitle={bookData.title}
            sourceChapterTitle={bookData.chapter?.title || null}
            originalText={bookData.content}
            translation={translation}
            translationLoading={translationLoading}
            onRequestTranslation={loadTranslation}
            characters={bookData.characters}
            initialMode={new URLSearchParams(location.search).get('mode') === 'script' ? 'script' : 'style'}
            initialScriptSection={initialScriptSection} />
        )}
      </main>

      <footer className="reading-header reading-muted border-t py-6 text-center text-sm">© 2025 文心新述 · 古典小说智能改编平台</footer>
    </div>
  );
}
