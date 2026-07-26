import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTheme } from '@/hooks/useTheme';
import MarkdownContent from '@/components/MarkdownContent';
import * as api from '@/api';

const UGCCommunityPage = () => {
  const { isDark } = useTheme();
  const [creations, setCreations] = useState<api.CommunityCreation[]>([]);
  const [categories, setCategories] = useState<Array<api.CategoryOption & { value: api.CreationCategory }>>([]);
  const [selectedCategory, setSelectedCategory] = useState<api.CreationCategory | ''>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [detail, setDetail] = useState<api.CreationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getCommunityCategories()
      .then(setCategories)
      .catch(requestError => setError(requestError instanceof Error ? requestError.message : '获取社区分类失败'));
  }, []);

  useEffect(() => {
    const loadCreations = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getCommunityCreations(currentPage, selectedCategory || undefined);
        setCreations(data.list);
        setTotalPages(data.totalPages);
        setTotalCount(data.totalCount);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : '获取社区列表失败');
      } finally {
        setLoading(false);
      }
    };
    loadCreations();
  }, [currentPage, selectedCategory]);

  const changeCategory = (category: api.CreationCategory | '') => {
    setSelectedCategory(category);
    setCurrentPage(1);
  };

  const openDetail = async (id: number) => {
    try {
      setDetail(null);
      setDetailLoading(true);
      setDetail(await api.getCreationDetail(id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '获取作品详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const categoryLabel = (value: api.CreationCategory) => categories.find(category => category.value === value)?.label || '其他';

  return (
    <div className={`min-h-screen p-8 ${isDark ? 'bg-gray-900 text-gray-100' : 'bg-[#F9F6F0] text-gray-800'}`}>
      <header className="mb-12 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-book-open text-2xl text-amber-800" />
          <h1 className="title-serif text-2xl">文心新述</h1>
        </div>
        <nav className="flex gap-6">
          <Link to="/" className="hover:text-amber-700">首页</Link>
          <Link to="/classical-library" className="hover:text-amber-700">古典文库</Link>
          <Link to="/ugc-community" className="border-b-2 border-amber-800 pb-1 font-medium text-amber-800">UGC社区</Link>
          <Link to="/my-collection" className="hover:text-amber-700">我的创作</Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <h2 className="title-serif mb-4 text-4xl">灵盛广场</h2>
          <p className="text-lg opacity-80">按创作类型浏览用户发布的 AI 作品</p>
          <p className="mt-2 text-sm opacity-60">当前分类共 {totalCount.toLocaleString()} 篇</p>
        </div>

        <div className="mb-9 flex flex-wrap justify-center gap-3" aria-label="社区作品分类">
          <button
            onClick={() => changeCategory('')}
            className={`rounded-full border px-5 py-2 transition ${selectedCategory === '' ? 'border-amber-700 bg-amber-700 text-white' : 'border-amber-200 bg-white text-amber-800 hover:bg-amber-50'}`}
          >
            全部
          </button>
          {categories.map(category => (
            <button
              key={category.value}
              onClick={() => changeCategory(category.value)}
              className={`rounded-full border px-5 py-2 transition ${selectedCategory === category.value ? 'border-amber-700 bg-amber-700 text-white' : 'border-amber-200 bg-white text-amber-800 hover:bg-amber-50'}`}
            >
              {category.label} <span className="ml-1 opacity-70">{category.count}</span>
            </button>
          ))}
        </div>

        {loading && <div className="py-16 text-center">加载中...</div>}
        {error && <div className="py-8 text-center text-red-600">{error}</div>}
        {!loading && !error && creations.length === 0 && (
          <div className="rounded-xl bg-white p-10 text-center text-gray-800 shadow">当前分类暂时没有作品，完成创作后保存即可发布。</div>
        )}

        {!loading && !error && (
          <motion.div className="grid grid-cols-1 gap-6 md:grid-cols-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {creations.map(creation => (
              <button
                key={creation.id}
                onClick={() => openDetail(creation.id)}
                className={`rounded-xl border border-amber-100 p-6 text-left shadow-md transition hover:shadow-lg ${isDark ? 'bg-gray-800' : 'bg-white'}`}
              >
                <div className="mb-3 flex justify-between gap-4">
                  <div>
                    <span className="mb-2 inline-block rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800">{categoryLabel(creation.category)}</span>
                    <h3 className="text-xl font-bold">{creation.book?.title || '自由创作'}</h3>
                  </div>
                  <span className="text-xs opacity-60">{new Date(creation.createdAt).toLocaleDateString('zh-CN')}</span>
                </div>
                <p className="mb-5 line-clamp-3">{creation.prompt}</p>
                <div className="flex justify-between text-sm opacity-70">
                  <span>用户 {creation.user.phone}</span>
                  <span>查看全文 →</span>
                </div>
              </button>
            ))}
          </motion.div>
        )}

        {totalPages > 1 && (
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            <button className="btn-secondary disabled:cursor-not-allowed disabled:opacity-40" disabled={currentPage === 1 || loading} onClick={() => setCurrentPage(page => page - 1)}>上一页</button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, index) => {
              const start = Math.min(Math.max(currentPage - 3, 1), Math.max(totalPages - 6, 1));
              const page = start + index;
              return <button key={page} disabled={loading} onClick={() => setCurrentPage(page)} className={`min-w-10 rounded-lg border px-3 py-2 ${page === currentPage ? 'border-amber-700 bg-amber-700 text-white' : 'border-amber-200 bg-white text-amber-800'}`}>{page}</button>;
            })}
            <button className="btn-secondary disabled:cursor-not-allowed disabled:opacity-40" disabled={currentPage === totalPages || loading} onClick={() => setCurrentPage(page => page + 1)}>下一页</button>
            <span className="ml-2 text-sm opacity-70">第 {currentPage} / {totalPages} 页</span>
          </div>
        )}
      </main>

      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={() => setDetail(null)}>
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-8 text-gray-800 shadow-2xl" onClick={event => event.stopPropagation()}>
            {detailLoading ? <div className="py-16 text-center">加载中...</div> : detail && (
              <>
                <div className="mb-5 flex justify-between gap-4">
                  <div>
                    <span className="mb-2 inline-block rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800">{categoryLabel(detail.category)}</span>
                    <h3 className="text-2xl font-bold">{detail.book?.title || '自由创作'}</h3>
                    <p className="mt-1 text-sm opacity-60">{detail.book?.author || '匿名原作'} · {new Date(detail.createdAt).toLocaleString('zh-CN')}</p>
                  </div>
                  <button onClick={() => setDetail(null)} className="text-2xl opacity-60 hover:opacity-100" aria-label="关闭">×</button>
                </div>
                <div className="mb-5 rounded-lg bg-amber-50 p-4 text-amber-900">创作要求：{detail.prompt}</div>
                <MarkdownContent content={detail.content} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UGCCommunityPage;
