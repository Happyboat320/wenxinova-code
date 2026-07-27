import { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import * as api from '@/api';
import AdaptWorkspace from '@/components/AdaptWorkspace';
import KnowledgeGraphView from '@/components/KnowledgeGraphView';
import { AuthContext } from '@/contexts/authContext';
import { useTheme } from '@/hooks/useTheme';

type ReadingTab = 'original' | 'annotated' | 'translation';
type PageTab = ReadingTab | 'adapt' | 'knowledge';

interface BookData {
  id: number;
  title: string;
  author: string;
  content: string;
  annotations: { index: number; content: string }[];
  characters: { id: number; name: string; description: string | null }[];
}

const MARKER_PATTERN = /(\[\d+\]|【\d+】|〔\d+〕)/g;
const ESCAPED_MARKER_PATTERN = /\\(?=\[\d+\])/g;

export default function BookViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark } = useTheme();
  const { user, openLogin } = useContext(AuthContext);
  const bookId = Number.parseInt(id || '', 10);

  const [bookData, setBookData] = useState<BookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PageTab>('original');
  const [translation, setTranslation] = useState('');
  const [translationLoading, setTranslationLoading] = useState(false);

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab');
    if (tab && ['original', 'annotated', 'translation', 'adapt', 'knowledge'].includes(tab)) {
      setActiveTab(tab as PageTab);
    }
  }, [location.search]);

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
        const data = await api.getBookContent(bookId);
        setBookData({ id: bookId, ...data });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '加载书籍数据失败');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [bookId]);

  const annotationsByIndex = useMemo(
    () => new Map(bookData?.annotations.map(annotation => [annotation.index, annotation.content]) || []),
    [bookData?.annotations],
  );

  const showTranslation = async () => {
    setActiveTab('translation');
    if (translation) return;
    if (!user) {
      toast.error('请先登录后查看译文');
      openLogin();
      return;
    }
    try {
      setTranslationLoading(true);
      setTranslation(await api.getBookTranslation(bookId));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '加载译文失败');
    } finally {
      setTranslationLoading(false);
    }
  };

  const renderText = (text: string, annotated: boolean) => {
    const normalized = text.replace(ESCAPED_MARKER_PATTERN, '');
    if (!annotated) return normalized.replace(MARKER_PATTERN, '');

    return normalized.split(MARKER_PATTERN).map((part, index) => {
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
            <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-64 -translate-x-1/2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-sm font-normal leading-6 text-stone-700 shadow-xl group-hover:block group-focus-within:block">
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

  return (
    <div className={`min-h-screen ${isDark ? 'bg-stone-950 text-stone-100' : 'bg-[#f8f5ef] text-stone-800'}`}>
      <header className={`flex flex-wrap items-center justify-between gap-5 px-6 py-5 lg:px-12 ${isDark ? 'border-stone-800' : 'border-amber-100/80'} border-b`}>
        <Link to="/" className="flex items-center gap-2 text-amber-900">
          <i className="fa-solid fa-book-open text-2xl" />
          <span className="font-serif text-2xl font-bold tracking-wide">文心新述</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-6 text-sm sm:text-base">
          <button onClick={() => navigate('/classical-library')} className="text-stone-500 transition hover:text-amber-800">← 返回文库</button>
          <Link to="/" className="transition hover:text-amber-800">首页</Link>
          <Link to="/classical-library" className="border-b-2 border-amber-700 pb-1 text-amber-800">古典文库</Link>
          <Link to="/ugc-community" className="transition hover:text-amber-800">UGC社区</Link>
          <Link to="/my-collection" className="transition hover:text-amber-800">我的创作</Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <div className="mb-7 text-center">
          <h1 className="font-serif text-3xl font-bold text-amber-900">{bookData.title}</h1>
          {bookData.author.trim() && <p className="mt-2 text-stone-500">作者：{bookData.author}</p>}
        </div>

        <div className="mb-8 flex justify-center border-b border-amber-200/70">
          <button onClick={() => { if (!readingActive) setActiveTab('original'); }}
            className={`px-8 py-3 transition ${readingActive ? 'border-b-2 border-amber-600 bg-amber-50 text-amber-800' : 'text-stone-600 hover:text-amber-800'}`}>
            阅读文本
          </button>
          <button onClick={() => setActiveTab('adapt')}
            className={`px-8 py-3 transition ${activeTab === 'adapt' ? 'border-b-2 border-amber-600 bg-amber-50 text-amber-800' : 'text-stone-600 hover:text-amber-800'}`}>
            创意工坊
          </button>
          <button onClick={() => setActiveTab('knowledge')} className={`px-8 py-3 transition ${activeTab === 'knowledge' ? 'border-b-2 border-amber-600 bg-amber-50 text-amber-800' : 'text-stone-600 hover:text-amber-800'}`}>知识图谱</button>
        </div>

        {readingActive ? (
          <section className={`rounded-xl border p-5 shadow-lg sm:p-8 ${isDark ? 'border-stone-800 bg-stone-900' : 'border-stone-100 bg-white'}`}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-serif text-xl font-semibold text-amber-900">文本阅读</h2>
              <span className="text-sm text-stone-400">共 {bookData.annotations.length} 条注释</span>
            </div>
            <div className="mb-6 flex flex-wrap gap-3">
              <button onClick={() => setActiveTab('original')} className={`rounded-lg border px-5 py-2 ${activeTab === 'original' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-stone-200 hover:bg-stone-50'}`}>原文</button>
              <button onClick={() => setActiveTab('annotated')} className={`rounded-lg border px-5 py-2 ${activeTab === 'annotated' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-stone-200 hover:bg-stone-50'}`}>原文 + 注释</button>
              <button onClick={showTranslation} className={`rounded-lg border px-5 py-2 ${activeTab === 'translation' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-stone-200 hover:bg-stone-50'}`}>译文</button>
            </div>

            {activeTab === 'translation' ? (
              <div className="min-h-[420px] rounded-lg border border-stone-100 bg-[#fffefa] p-6 font-serif text-lg leading-9">
                {translationLoading ? '正在生成译文…' : translation ? <div className="whitespace-pre-wrap">{translation}</div> : (
                  <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 text-stone-400">
                    <i className="fa-regular fa-file-lines text-3xl" />
                    <p>{user ? '点击“译文”加载内容' : '登录后可查看译文'}</p>
                    <button onClick={showTranslation} className="rounded-lg bg-amber-700 px-5 py-2 text-sm text-white hover:bg-amber-800">{user ? '加载译文' : '立即登录'}</button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <article className="min-h-[420px] whitespace-pre-wrap rounded-lg border border-stone-100 bg-[#fffefa] p-6 font-serif text-lg leading-9 sm:p-8">
                  {renderText(bookData.content, activeTab === 'annotated')}
                </article>
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
                <p className="mt-4 text-sm text-stone-400">提示：切换到“原文 + 注释”，悬停或聚焦注释序号即可查看释义。</p>
              </>
            )}
          </section>
        ) : activeTab === 'knowledge' ? (
          <KnowledgeGraphView bookId={bookId} />
        ) : (
          <AdaptWorkspace bookId={bookId} title={bookData.title} author={bookData.author}
            originalText={bookData.content} characters={bookData.characters}
            initialMode={new URLSearchParams(location.search).get('mode') === 'script' ? 'script' : 'style'}
            initialScriptSection={initialScriptSection} />
        )}
      </main>

      <footer className="border-t border-amber-100 py-6 text-center text-sm text-stone-400">© 2025 文心新述 · 古典小说智能改编平台</footer>
    </div>
  );
}
