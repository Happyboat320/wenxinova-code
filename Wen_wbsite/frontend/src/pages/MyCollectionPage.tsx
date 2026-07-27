import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTheme } from '@/hooks/useTheme';
import { AuthContext } from '@/contexts/authContext';
import MarkdownContent from '@/components/MarkdownContent';
import * as api from '@/api';

const categoryLabels: Record<api.CreationCategory, string> = {
  adaptation: '改编',
  script: '剧本杀',
  props: '道具',
  dm: 'DM 手册',
  other: '其他',
};

const MyCollectionPage = () => {
  const { isDark } = useTheme();
  const { user, isInitializing, openLogin } = useContext(AuthContext);
  const [creations, setCreations] = useState<api.Creation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<'draft' | 'published'>('draft');

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

  const visibleCreations = creations.filter(creation => creation.status === selectedStatus);
  const draftCount = creations.filter(creation => creation.status === 'draft').length;
  const publishedCount = creations.filter(creation => creation.status === 'published').length;

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

        {user && (
          <section className={`mx-auto mb-9 flex max-w-3xl items-center gap-5 rounded-2xl border border-amber-100 p-6 shadow-md ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <Link to="/profile" className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 text-2xl font-semibold text-amber-800 ring-4 ring-amber-50">
              {user.avatar ? <img src={user.avatar} alt="个人头像" className="h-full w-full object-cover" /> : (user.nickname?.charAt(0) || <i className="fa-solid fa-user" />)}
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <h3 className="truncate text-2xl font-semibold">{user.nickname || '未设置昵称'}</h3>
                <Link to="/profile" className="shrink-0 text-sm text-amber-700 hover:underline">编辑资料</Link>
              </div>
              <p className="mt-2 break-words opacity-65">{user.signature || '这位创作者还没有填写个人签名。'}</p>
            </div>
          </section>
        )}

        {user && (
          <div className="mb-8 flex justify-center">
            <div className={`inline-flex rounded-xl border border-amber-200 p-1.5 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
              <button onClick={() => setSelectedStatus('draft')} className={`rounded-lg px-7 py-2.5 transition ${selectedStatus === 'draft' ? 'bg-amber-700 text-white shadow' : 'text-amber-800 hover:bg-amber-50'}`}>
                <i className="fa-regular fa-file-lines mr-2" />草稿 <span className="ml-1 opacity-70">{draftCount}</span>
              </button>
              <button onClick={() => setSelectedStatus('published')} className={`rounded-lg px-7 py-2.5 transition ${selectedStatus === 'published' ? 'bg-amber-700 text-white shadow' : 'text-amber-800 hover:bg-amber-50'}`}>
                <i className="fa-solid fa-globe mr-2" />已发布 <span className="ml-1 opacity-70">{publishedCount}</span>
              </button>
            </div>
          </div>
        )}

        {!isInitializing && !user && (
          <div className="bg-white rounded-2xl p-10 shadow-lg text-center">
            <h3 className="text-2xl font-medium mb-3">请先登录</h3>
            <p className="opacity-70 mb-6">登录后可保存和查看您的创作记录。</p>
            <button onClick={openLogin} className="btn-primary inline-block">账号登录</button>
          </div>
        )}

        {user && loading && <div className="text-center py-16">加载中...</div>}
        {user && error && <div className="text-center py-16 text-red-600">{error}</div>}
        {user && !loading && !error && visibleCreations.length === 0 && (
          <div className="bg-white rounded-2xl p-10 shadow-lg text-center">
            <h3 className="text-2xl font-medium mb-3">{selectedStatus === 'draft' ? '暂无草稿' : '您还没有发布的创作'}</h3>
            <p className="opacity-65">{selectedStatus === 'draft' ? '在创意工坊点击“保存”后，未发布的文本会出现在这里。' : '在创意工坊点击“发布”后，作品会同时展示在 UGC 社区。'}</p>
            <Link to="/classical-library" className="btn-primary inline-block mt-4">浏览古典文库</Link>
          </div>
        )}

        <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {visibleCreations.map(creation => (
            <article key={creation.id} className={`rounded-xl p-6 shadow-md border border-amber-100 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="flex justify-between gap-4 mb-3">
                <div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <span className="inline-block rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800">{categoryLabels[creation.category] || '其他'}</span>
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs ${creation.status === 'draft' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>{creation.status === 'draft' ? '草稿' : '已发布'}</span>
                  </div>
                  <h3 className="text-xl font-semibold">{creation.book?.title || '自由创作'}</h3>
                </div>
                <time className="text-xs opacity-60 whitespace-nowrap">{new Date(creation.status === 'draft' ? creation.updatedAt : creation.publishedAt || creation.createdAt).toLocaleString('zh-CN')}</time>
              </div>
              <p className="text-sm text-amber-700 mb-3 break-words">{creation.prompt}</p>
              <div className="max-h-64 overflow-hidden">
                <MarkdownContent content={creation.content} className={isDark ? '!text-gray-100' : ''} />
              </div>
              {creation.bookId && (
                creation.status === 'draft' ? (
                  <Link to={`/book/${creation.bookId}?tab=adapt${creation.category === 'adaptation' ? '' : `&mode=script&section=${creation.category === 'script' ? 'role' : creation.category}`}`} className="btn-secondary mt-4 inline-block">继续编辑 →</Link>
                ) : (
                  <Link to={`/book/${creation.bookId}`} className="inline-block mt-4 text-amber-700 hover:underline">查看原书 →</Link>
                )
              )}
            </article>
          ))}
        </motion.div>
      </main>
    </div>
  );
};

export default MyCollectionPage;
