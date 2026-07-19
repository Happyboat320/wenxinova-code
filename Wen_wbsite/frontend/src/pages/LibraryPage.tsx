import { useEffect, useState } from "react";
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTheme } from "@/hooks/useTheme";
import * as api from "@/api";

type Book = {
  id: number;
  title: string;
  author: string;
  description: string | null;
  summary: string | null;
};

const LibraryPage = () => {
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const [books, setBooks] = useState<Book[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        console.log('开始获取书籍列表...');
        const data = await api.getBookList(currentPage);
        console.log('获取到的书籍数据:', data);
        setBooks(data.list);
        setTotalPages(data.totalPages);
        setTotalCount(data.totalCount);
      } catch (err) {
        console.error('获取书籍列表失败:', err);
        setError(`获取书籍列表失败: ${err instanceof Error ? err.message : '未知错误'}`);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentPage]);

  // 页面容器动画变体
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  // 书籍卡片动画变体
  const bookVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.5 }
    }
  };

  return (
    <div className={`min-h-screen min-w-[1440px] p-8 ${isDark ? 'bg-gray-900 text-gray-100' : 'bg-[#F9F6F0] text-gray-800'}`}>
      {/* 顶部导航 */}
      <header className="mb-12 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-book-open text-amber-800 text-2xl"></i>
          <h1 className="text-2xl title-serif">文心新述</h1>
        </div>
        <nav className="flex gap-6">
          <Link to="/" className="hover:text-amber-700 transition-colors">首页</Link>
          <Link to="/classical-library" className="font-medium text-amber-800 border-b-2 border-amber-800 pb-1">古典文库</Link>
          <Link to="/ugc-community" className="hover:text-amber-700 transition-colors">UGC社区</Link>
          <Link to="/my-collection" className="hover:text-amber-700 transition-colors">我的创作</Link>
        </nav>
      </header>

      {/* 主内容区域 */}
      <main>
        <div className="mb-10 text-center">
          <h2 className="text-4xl title-serif mb-4">古典文库</h2>
          <p className="text-lg opacity-80 max-w-3xl mx-auto">
            探索中国古典文学的瑰宝，每一部经典都蕴含着深厚的文化底蕴和独特的艺术魅力
          </p>
          <p className="mt-2 text-sm opacity-60">共 {totalCount.toLocaleString()} 部作品</p>
        </div>

        {loading && <div className="text-center">加载中...</div>}
        {error && <div className="text-center text-red-500">{error}</div>}

        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {books.map((book) => (
            <motion.div
              key={book.id}
              className={`rounded-xl overflow-hidden shadow-lg ${isDark ? 'bg-gray-800' : 'bg-white'} hover:shadow-xl transition-all duration-300 border border-amber-100`}
              variants={bookVariants}
              whileHover={{ y: -5 }}
            >
              <div className="h-60 overflow-hidden relative">
                <img
                  src="https://via.placeholder.com/400x240?text=古典文学"
                  alt={book.title}
                  className="w-full h-full object-cover transition-transform duration-700 hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                <div className="absolute bottom-0 left-0 p-6 text-white">
                  <h3 className="text-2xl font-bold mb-1">{book.title}</h3>
                  <p className="text-sm opacity-90">作者：{book.author}</p>
                </div>
              </div>

              <div className="p-6">
                <p className="mb-6 line-clamp-3 opacity-80">
                  {book.description?.trim() || book.summary?.trim() || '探索中国古典文学的瑰宝，感受深厚的文化底蕴。'}
                </p>
                <button
                  className="w-full btn-primary"
                  onClick={() => navigate(`/book/${book.id}`)}
                >
                  查看详情
                </button>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {totalPages > 1 && (
          <div className="mt-10 flex flex-wrap justify-center items-center gap-2">
            <button
              className="btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={currentPage === 1 || loading}
              onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
            >
              上一页
            </button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, index) => {
              const start = Math.min(Math.max(currentPage - 3, 1), Math.max(totalPages - 6, 1));
              const page = start + index;
              return (
                <button
                  key={page}
                  disabled={loading}
                  onClick={() => setCurrentPage(page)}
                  className={`min-w-10 px-3 py-2 rounded-lg border transition-colors ${
                    page === currentPage
                      ? 'bg-amber-700 text-white border-amber-700'
                      : 'bg-white border-amber-200 hover:bg-amber-50'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              className="btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={currentPage === totalPages || loading}
              onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
            >
              下一页
            </button>
            <span className="ml-2 text-sm opacity-70">第 {currentPage} / {totalPages} 页</span>
          </div>
        )}
      </main>

      {/* 页脚 */}
      <footer className="mt-20 text-center text-sm opacity-70">
        <p>© 2025 文心新述 - 古典小说智能改编平台</p>
      </footer>
    </div>
  );
};

export default LibraryPage;
