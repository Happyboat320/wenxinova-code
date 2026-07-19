import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTheme } from '@/hooks/useTheme';
import * as api from '@/api';

const UGCCommunityPage = () => {
  const { isDark } = useTheme();
  const [creations, setCreations] = useState<api.CommunityCreation[]>([]);
  const [detail, setDetail] = useState<api.CreationDetail | null>(null);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCreations = async () => {
      try {
        setLoading(true);
        setError(null);
        setCreations(await api.getCommunityCreations(limit));
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : '获取社区列表失败');
      } finally {
        setLoading(false);
      }
    };
    loadCreations();
  }, [limit]);

  const openDetail = async (id: number) => {
    try {
      setDetailLoading(true);
      setDetail(await api.getCreationDetail(id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '获取作品详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className={`min-h-screen p-8 ${isDark ? 'bg-gray-900 text-gray-100' : 'bg-[#F9F6F0] text-gray-800'}`}>
      <header className="mb-12 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-book-open text-amber-800 text-2xl" />
          <h1 className="text-2xl title-serif">文心新述</h1>
        </div>
        <nav className="flex gap-6">
          <Link to="/" className="hover:text-amber-700">首页</Link>
          <Link to="/classical-library" className="hover:text-amber-700">古典文库</Link>
          <Link to="/ugc-community" className="font-medium text-amber-800 border-b-2 border-amber-800 pb-1">UGC社区</Link>
          <Link to="/my-collection" className="hover:text-amber-700">我的创作</Link>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto">
        <div className="mb-10 text-center">
          <h2 className="text-4xl title-serif mb-4">灵盛广场</h2>
          <p className="text-lg opacity-80">浏览用户最新保存的 AI 创作作品</p>
        </div>

        {loading && <div className="text-center py-16">加载中...</div>}
        {error && <div className="text-center py-8 text-red-600">{error}</div>}
        {!loading && !error && creations.length === 0 && (
          <div className="bg-white rounded-xl p-10 text-center shadow">社区暂时没有作品，完成改编后保存即可发布。</div>
        )}

        <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {creations.map(creation => (
            <button
              key={creation.id}
              onClick={() => openDetail(creation.id)}
              className={`text-left rounded-xl p-6 border border-amber-100 shadow-md hover:shadow-lg transition ${isDark ? 'bg-gray-800' : 'bg-white'}`}
            >
              <div className="flex justify-between gap-4 mb-3">
                <h3 className="text-xl font-bold">{creation.book?.title || '自由创作'}</h3>
                <span className="text-xs opacity-60">{new Date(creation.createdAt).toLocaleDateString('zh-CN')}</span>
              </div>
              <p className="line-clamp-3 mb-5">{creation.prompt}</p>
              <div className="flex justify-between text-sm opacity-70">
                <span>用户 {creation.user.phone}</span>
                <span>查看全文 →</span>
              </div>
            </button>
          ))}
        </motion.div>

        {creations.length >= limit && (
          <div className="mt-10 text-center">
            <button onClick={() => setLimit(value => value + 20)} disabled={loading} className="btn-secondary">加载更多作品</button>
          </div>
        )}
      </main>

      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 bg-black/60 p-6 flex items-center justify-center" onClick={() => setDetail(null)}>
          <div className="bg-white text-gray-800 rounded-2xl p-8 w-full max-w-3xl max-h-[85vh] overflow-y-auto shadow-2xl" onClick={event => event.stopPropagation()}>
            {detailLoading && !detail ? <div className="text-center py-16">加载中...</div> : detail && (
              <>
                <div className="flex justify-between gap-4 mb-5">
                  <div>
                    <h3 className="text-2xl font-bold">{detail.book?.title || '自由创作'}</h3>
                    <p className="text-sm opacity-60 mt-1">{detail.book?.author || '匿名原作'} · {new Date(detail.createdAt).toLocaleString('zh-CN')}</p>
                  </div>
                  <button onClick={() => setDetail(null)} className="text-2xl opacity-60 hover:opacity-100">×</button>
                </div>
                <div className="bg-amber-50 rounded-lg p-4 mb-5 text-amber-900">创作要求：{detail.prompt}</div>
                <div className="whitespace-pre-wrap leading-8">{detail.content}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UGCCommunityPage;
