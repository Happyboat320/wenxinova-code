import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTheme } from '@/hooks/useTheme';
import { AuthContext } from '@/contexts/authContext';
import * as api from '@/api';

const MyCollectionPage = () => {
  const { isDark } = useTheme();
  const { user, isInitializing, openLogin } = useContext(AuthContext);
  const [creations, setCreations] = useState<api.Creation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const loadCreations = async () => {
      try {
        setLoading(true);
        setError(null);
        setCreations(await api.getUserCreations());
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : '获取创作历史失败');
      } finally {
        setLoading(false);
      }
    };
    loadCreations();
  }, [user]);

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
          <Link to="/ugc-community" className="hover:text-amber-700">UGC社区</Link>
          <Link to="/my-collection" className="font-medium text-amber-800 border-b-2 border-amber-800 pb-1">我的创作</Link>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto">
        <div className="mb-10 text-center">
          <h2 className="text-4xl title-serif mb-4">我的创作</h2>
          <p className="text-lg opacity-80">查看通过 AI 改编、续写和创作的历史作品</p>
        </div>

        {!isInitializing && !user && (
          <div className="bg-white rounded-2xl p-10 shadow-lg text-center">
            <h3 className="text-2xl font-medium mb-3">请先登录</h3>
            <p className="opacity-70 mb-6">登录后可保存和查看您的创作记录。</p>
            <button onClick={openLogin} className="btn-primary inline-block">短信登录</button>
          </div>
        )}

        {user && loading && <div className="text-center py-16">加载中...</div>}
        {user && error && <div className="text-center py-16 text-red-600">{error}</div>}
        {user && !loading && !error && creations.length === 0 && (
          <div className="bg-white rounded-2xl p-10 shadow-lg text-center">
            <h3 className="text-2xl font-medium mb-3">您还没有保存的创作</h3>
            <Link to="/classical-library" className="btn-primary inline-block mt-4">浏览古典文库</Link>
          </div>
        )}

        <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {creations.map(creation => (
            <article key={creation.id} className={`rounded-xl p-6 shadow-md border border-amber-100 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="flex justify-between gap-4 mb-3">
                <h3 className="text-xl font-semibold">{creation.book?.title || '自由创作'}</h3>
                <time className="text-xs opacity-60 whitespace-nowrap">{new Date(creation.createdAt).toLocaleString('zh-CN')}</time>
              </div>
              <p className="text-sm text-amber-700 mb-3 break-words">{creation.prompt}</p>
              <p className="whitespace-pre-wrap line-clamp-6 leading-relaxed">{creation.content}</p>
              {creation.bookId && (
                <Link to={`/book/${creation.bookId}`} className="inline-block mt-4 text-amber-700 hover:underline">查看原书 →</Link>
              )}
            </article>
          ))}
        </motion.div>
      </main>
    </div>
  );
};

export default MyCollectionPage;
