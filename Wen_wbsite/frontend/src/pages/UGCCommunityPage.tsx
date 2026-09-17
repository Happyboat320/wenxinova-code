import { useContext, useEffect, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/hooks/useTheme';
import MarkdownContent from '@/components/MarkdownContent';
import * as api from '@/api';
import SiteHeader from '@/components/SiteHeader';
import { AuthContext } from '@/contexts/authContext';

const UGCCommunityPage = () => {
  const { isDark } = useTheme();
  const { isAuthenticated, openLogin } = useContext(AuthContext);
  const [creations, setCreations] = useState<api.CommunityCreation[]>([]);
  const [categories, setCategories] = useState<Array<api.CategoryOption & { value: api.CreationCategory }>>([]);
  const [selectedCategory, setSelectedCategory] = useState<api.CreationCategory | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [detail, setDetail] = useState<api.CreationDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [interactionLoading, setInteractionLoading] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [interactionError, setInteractionError] = useState<string | null>(null);
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
        const data = await api.getCommunityCreations(currentPage, selectedCategory || undefined, searchQuery || undefined);
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
  }, [currentPage, selectedCategory, searchQuery]);

  const changeCategory = (category: api.CreationCategory | '') => {
    setSelectedCategory(category);
    setCurrentPage(1);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchQuery(searchInput.trim());
    setCurrentPage(1);
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const openDetail = async (id: number) => {
    try {
      setDetail(null);
      setDetailError(null);
      setCommentText('');
      setInteractionError(null);
      setDetailLoading(true);
      setDetail(await api.getCreationDetail(id));
    } catch (requestError) {
      setDetailError(requestError instanceof Error ? requestError.message : '获取作品详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const categoryLabel = (value: api.CreationCategory) => categories.find(category => category.value === value)?.label || '其他';
  const authorName = (user: api.CommunityCreation['user']) => user.nickname?.trim() || user.phone || '未设置昵称';

  const closeDetail = () => {
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
    setInteractionError(null);
  };

  const updateCreationCounts = (id: number, counts: Partial<Pick<api.CommunityCreation, 'likeCount' | 'commentCount'>>) => {
    setCreations(current => current
      .map(creation => creation.id === id ? { ...creation, ...counts } : creation)
      .sort((left, right) => (right.likeCount || 0) - (left.likeCount || 0) || new Date(right.publishedAt || right.createdAt).getTime() - new Date(left.publishedAt || left.createdAt).getTime()));
  };

  const toggleLike = async () => {
    if (!detail || interactionLoading) return;
    if (!isAuthenticated) {
      openLogin();
      return;
    }
    try {
      setInteractionLoading(true);
      setInteractionError(null);
      const result = await api.toggleCreationLike(detail.id);
      setDetail(current => current?.id === detail.id ? {
        ...current,
        likedByCurrentUser: result.liked,
        likeCount: result.likeCount,
      } : current);
      updateCreationCounts(detail.id, { likeCount: result.likeCount });
    } catch (requestError) {
      setInteractionError(requestError instanceof Error ? requestError.message : '更新点赞失败');
    } finally {
      setInteractionLoading(false);
    }
  };

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!detail || commentSubmitting || !commentText.trim()) return;
    if (!isAuthenticated) {
      openLogin();
      return;
    }
    try {
      setCommentSubmitting(true);
      setInteractionError(null);
      const comment = await api.addCreationComment(detail.id, commentText.trim());
      setDetail(current => current?.id === detail.id ? {
        ...current,
        comments: [comment, ...(current.comments || [])],
        commentCount: (current.commentCount || 0) + 1,
      } : current);
      updateCreationCounts(detail.id, { commentCount: (detail.commentCount || 0) + 1 });
      setCommentText('');
    } catch (requestError) {
      setInteractionError(requestError instanceof Error ? requestError.message : '发布评论失败');
    } finally {
      setCommentSubmitting(false);
    }
  };

  return (
    <div className={`min-h-screen px-4 py-5 sm:p-8 ${isDark ? 'bg-gray-900 text-gray-100' : 'bg-[#F9F6F0] text-gray-800'}`}>
      <SiteHeader className="mb-8 sm:mb-12" />

      <main className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <h2 className="title-serif mb-4 text-3xl sm:text-4xl">灵盛广场</h2>
          <p className="text-lg opacity-80">按创作类型浏览用户发布的 AI 作品</p>
          <p className="mt-2 text-sm opacity-60">当前分类共 {totalCount.toLocaleString()} 篇</p>
        </div>

        <form onSubmit={submitSearch} className={`mx-auto mb-6 flex max-w-3xl flex-col gap-3 rounded-xl border border-amber-200 p-4 shadow-sm sm:flex-row ${isDark ? 'bg-gray-800' : 'bg-white'}`} role="search">
          <label htmlFor="community-search" className="sr-only">检索用户名、源篇目名或改编全文</label>
          <div className="relative min-w-0 flex-1">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-amber-700" />
            <input
              id="community-search"
              value={searchInput}
              onChange={event => setSearchInput(event.target.value)}
              maxLength={100}
              placeholder="检索用户名、源篇目名或改编全文"
              className={`w-full rounded-lg border border-amber-200 py-2.5 pl-11 pr-4 outline-none focus:ring-2 focus:ring-amber-400 ${isDark ? 'bg-gray-700 text-gray-100' : 'bg-amber-50/50'}`}
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">检索</button>
          {searchQuery && <button type="button" onClick={clearSearch} className="btn-secondary">清空</button>}
        </form>

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

        {searchQuery && !loading && !error && (
          <p className="mb-6 text-center text-sm opacity-70">“{searchQuery}”找到 {totalCount.toLocaleString()} 篇已发布作品</p>
        )}

        {loading && <div className="py-16 text-center">加载中...</div>}
        {error && <div className="py-8 text-center text-red-600">{error}</div>}
        {!loading && !error && creations.length === 0 && (
          <div className="rounded-xl bg-white p-10 text-center text-gray-800 shadow">
            {searchQuery ? '没有找到匹配的已发布作品，请尝试其他关键词' : '当前分类暂时没有作品，完成创作后点击“发布”即可展示。'}
          </div>
        )}

        {!loading && !error && (
          <motion.div className="grid grid-cols-1 gap-6 md:grid-cols-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {creations.map(creation => {
              const displayName = authorName(creation.user);
              return (
                <button
                  key={creation.id}
                  onClick={() => openDetail(creation.id)}
                  className={`rounded-xl border border-amber-100 p-4 text-left shadow-md transition hover:shadow-lg sm:p-6 ${isDark ? 'bg-gray-800' : 'bg-white'}`}
                >
                  <div className="mb-3 flex justify-between gap-4">
                    <div>
                      <span className="mb-2 inline-block rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800">{categoryLabel(creation.category)}</span>
                      <h3 className="text-xl font-bold">{creation.book?.title || '自由创作'}</h3>
                    </div>
                    <span className="text-xs opacity-60">{new Date(creation.publishedAt || creation.createdAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                  <p className="mb-5 line-clamp-3">{creation.prompt}</p>
                  <div className="flex flex-col gap-3 text-sm opacity-70 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 text-xs text-amber-800">
                        {creation.user.avatar ? <img src={creation.user.avatar} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : (displayName.charAt(0) || <i className="fa-solid fa-user" />)}
                      </span>
                      <span className="truncate">{displayName}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-4">
                      <span><i className="fa-regular fa-heart mr-1.5" />{creation.likeCount || 0}</span>
                      <span><i className="fa-regular fa-comment mr-1.5" />{creation.commentCount || 0}</span>
                      <span>查看全文 →</span>
                    </span>
                  </div>
                </button>
              );
            })}
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

      {(detail || detailLoading || detailError) && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" onClick={closeDetail}>
          <div className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-4 text-gray-800 shadow-2xl sm:max-h-[85vh] sm:rounded-2xl sm:p-8" onClick={event => event.stopPropagation()}>
            {detailLoading ? <div className="py-16 text-center">加载中...</div> : detailError ? (
              <div className="py-12 text-center">
                <i className="fa-solid fa-circle-exclamation text-3xl text-red-500" />
                <p className="mt-4 text-red-600">{detailError}</p>
                <button type="button" onClick={closeDetail} className="btn-secondary mt-6">关闭</button>
              </div>
            ) : detail && (
              <>
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <span className="mb-2 inline-block rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800">{categoryLabel(detail.category)}</span>
                    <h3 className="text-2xl font-bold">{detail.book?.title || '自由创作'}</h3>
                    <p className="mt-1 text-sm opacity-60">{detail.book?.author || '匿名原作'} · {new Date(detail.publishedAt || detail.createdAt).toLocaleString('zh-CN')}</p>
                    <div className="mt-3 flex items-center gap-2 text-sm text-amber-800">
                      <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-amber-100 text-xs">
                        {detail.user.avatar ? <img src={detail.user.avatar} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : authorName(detail.user).charAt(0)}
                      </span>
                      <span>发布者：{authorName(detail.user)}</span>
                    </div>
                  </div>
                  <button onClick={closeDetail} className="text-2xl opacity-60 hover:opacity-100" aria-label="关闭">×</button>
                </div>
                <div className="mb-5 rounded-lg bg-amber-50 p-4 text-amber-900">创作要求：{detail.prompt}</div>
                <MarkdownContent content={detail.content} />

                <div className="mt-8 border-t border-amber-100 pt-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={toggleLike}
                      disabled={interactionLoading}
                      aria-pressed={detail.likedByCurrentUser}
                      className={`flex items-center gap-2 rounded-full border px-5 py-2.5 transition disabled:opacity-50 ${detail.likedByCurrentUser ? 'border-red-200 bg-red-50 text-red-600' : 'border-amber-200 text-amber-800 hover:bg-amber-50'}`}
                    >
                      <i className={`${detail.likedByCurrentUser ? 'fa-solid' : 'fa-regular'} fa-heart`} />
                      <span>{detail.likedByCurrentUser ? '已点赞' : '点赞'}</span>
                      <span>{detail.likeCount}</span>
                    </button>
                    <span className="flex items-center gap-2 rounded-full border border-amber-200 px-5 py-2.5 text-amber-800">
                      <i className="fa-regular fa-comment" />
                      <span>评论 {detail.commentCount}</span>
                    </span>
                  </div>

                  <form onSubmit={submitComment} className="mt-6">
                    <label htmlFor="community-comment" className="mb-2 block font-medium">发表评论</label>
                    <textarea
                      id="community-comment"
                      value={commentText}
                      onChange={event => setCommentText(event.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder={isAuthenticated ? '分享你对这篇作品的看法……' : '登录后参与评论……'}
                      className="w-full resize-none rounded-xl border border-amber-200 bg-amber-50/40 p-4 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                    />
                    <div className="mt-2 flex items-center justify-between gap-4">
                      <span className="text-sm opacity-50">{Array.from(commentText).length} / 500</span>
                      <button type="submit" disabled={commentSubmitting || !commentText.trim()} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">
                        {commentSubmitting ? '发布中…' : isAuthenticated ? '发布评论' : '登录后评论'}
                      </button>
                    </div>
                  </form>

                  {interactionError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{interactionError}</p>}

                  <div className="mt-7">
                    <h4 className="mb-4 text-lg font-semibold">全部评论</h4>
                    {(detail.comments || []).length === 0 ? (
                      <div className="rounded-xl bg-stone-50 py-8 text-center text-sm opacity-60">还没有评论，来发表第一条评论吧。</div>
                    ) : (
                      <ul className="divide-y divide-amber-100">
                        {(detail.comments || []).map(comment => {
                          const commentAuthor = authorName(comment.user);
                          return <li key={comment.id} className="flex gap-3 py-5">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 text-sm text-amber-800">
                              {comment.user.avatar ? <img src={comment.user.avatar} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : commentAuthor.charAt(0)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-medium">{commentAuthor}</span>
                                <time className="shrink-0 text-xs opacity-50">{new Date(comment.createdAt).toLocaleString('zh-CN')}</time>
                              </div>
                              <p className="mt-2 whitespace-pre-wrap break-words leading-7">{comment.content}</p>
                            </div>
                          </li>;
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UGCCommunityPage;
