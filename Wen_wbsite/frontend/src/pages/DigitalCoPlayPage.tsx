import { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthContext } from '@/contexts/authContext';
import { useTheme } from '@/hooks/useTheme';
import * as api from '@/api';

const MAX_CHARACTERS = 10;

const scenePresets = [
  {
    name: '兰亭夜话',
    text: '暮春之夜，曲水流觞后的兰亭仍有余香。诸位来自不同作品的人物围坐灯下，谈命运、情义与各自未竟之事。',
  },
  {
    name: '金陵旧梦',
    text: '金陵城雨声不断，酒楼临窗一席静候故人。角色们被同一封无名书信召来，需要互相试探来判断来信人的真实用意。',
  },
  {
    name: '长安风雪',
    text: '长安大雪封街，驿馆中灯火未灭。众人因道路阻隔暂聚一处，外有急报传来，内有旧怨浮现。',
  },
  {
    name: '公堂对质',
    text: '县衙明镜高悬，一桩旧案被重新翻出。角色们依次陈述所见所闻，也借机为自己的选择辩护。',
  },
];

export default function DigitalCoPlayPage() {
  const { isDark } = useTheme();
  const { user, isInitializing, openLogin } = useContext(AuthContext);
  const [favorites, setFavorites] = useState<api.FavoriteCharacter[]>([]);
  const [sessions, setSessions] = useState<api.CoPlaySession[]>([]);
  const [activeSession, setActiveSession] = useState<api.CoPlaySession | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [scene, setScene] = useState(scenePresets[0].text);
  const [title, setTitle] = useState('');
  const [userMessage, setUserMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [creationSaving, setCreationSaving] = useState<'draft' | 'publish' | null>(null);

  const selectedFavorites = useMemo(() => {
    const byId = new Map(favorites.map(character => [character.id, character]));
    return selectedIds.map(id => byId.get(id)).filter(Boolean) as api.FavoriteCharacter[];
  }, [favorites, selectedIds]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        setSessionLoading(true);
        const [favoriteRows, sessionRows] = await Promise.all([
          api.getFavoriteCharacters(),
          api.getCoPlaySessions(),
        ]);
        setFavorites(favoriteRows);
        setSessions(sessionRows);
        if (sessionRows[0]) {
          setActiveSession(await api.getCoPlaySession(sessionRows[0].id));
        }
      } catch (caught) {
        toast.error(caught instanceof Error ? caught.message : '数字共演数据加载失败');
      } finally {
        setSessionLoading(false);
      }
    };
    void load();
  }, [user]);

  const toggleSelected = (id: number) => {
    setSelectedIds(current => {
      if (current.includes(id)) return current.filter(item => item !== id);
      if (current.length >= MAX_CHARACTERS) {
        toast.error(`最多选择 ${MAX_CHARACTERS} 个角色`);
        return current;
      }
      return [...current, id];
    });
  };

  const moveSelected = (index: number, direction: -1 | 1) => {
    setSelectedIds(current => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeFavorite = async (id: number) => {
    try {
      await api.removeFavoriteCharacter(id);
      setFavorites(current => current.filter(character => character.id !== id));
      setSelectedIds(current => current.filter(item => item !== id));
      toast.success('已取消收藏');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '取消收藏失败');
    }
  };

  const startSession = async () => {
    if (selectedIds.length < 2) {
      toast.error('请至少选择 2 个角色');
      return;
    }
    if (!scene.trim()) {
      toast.error('请填写场景背景');
      return;
    }
    try {
      setLoading(true);
      const created = await api.createCoPlaySession({
        title: title.trim() || undefined,
        scene: scene.trim(),
        favoriteCharacterIds: selectedIds,
      });
      const messages = await api.advanceCoPlayTurn(created.id);
      const detail = { ...created, messages };
      setActiveSession(detail);
      setSessions(current => [detail, ...current.filter(session => session.id !== detail.id)]);
      setTitle('');
      toast.success('数字共演已开始');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '开始对话失败');
    } finally {
      setLoading(false);
    }
  };

  const continueTurn = async () => {
    if (!activeSession) return;
    try {
      setLoading(true);
      const messages = await api.advanceCoPlayTurn(activeSession.id, userMessage.trim() || undefined);
      setActiveSession(current => current ? { ...current, messages: [...current.messages, ...messages] } : current);
      setSessions(current => current.map(session => session.id === activeSession.id ? { ...session, updatedAt: new Date().toISOString(), messages: messages.slice(-1) } : session));
      setUserMessage('');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '生成本轮发言失败');
    } finally {
      setLoading(false);
    }
  };

  const openSession = async (id: number) => {
    try {
      setSessionLoading(true);
      setActiveSession(await api.getCoPlaySession(id));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '打开会话失败');
    } finally {
      setSessionLoading(false);
    }
  };

  const deleteSession = async (id: number) => {
    try {
      await api.deleteCoPlaySession(id);
      setSessions(current => current.filter(session => session.id !== id));
      if (activeSession?.id === id) setActiveSession(null);
      toast.success('会话已删除');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '删除会话失败');
    }
  };

  const saveSessionCreation = async (action: 'draft' | 'publish') => {
    if (!activeSession) return;
    if (activeSession.messages.length === 0) {
      toast.error('至少生成一轮发言后才能保存为作品');
      return;
    }
    try {
      setCreationSaving(action);
      const creation = await api.saveCoPlayCreation(activeSession.id, action);
      if (action === 'publish') {
        toast.success(creation.status === 'published' ? '已发布到社区' : '已提交社区审核');
      } else {
        toast.success('已保存到我的创作草稿');
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '保存数字共演作品失败');
    } finally {
      setCreationSaving(null);
    }
  };

  return (
    <div className={`min-h-screen min-w-[1440px] p-8 ${isDark ? 'bg-gray-900 text-gray-100' : 'bg-[#F9F6F0] text-gray-800'}`}>
      <header className="mb-10 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <i className="fa-solid fa-book-open text-2xl text-amber-800" />
          <h1 className="title-serif text-2xl">文心新述</h1>
        </Link>
        <nav className="flex gap-6">
          <Link to="/" className="hover:text-amber-700">首页</Link>
          <Link to="/classical-library" className="hover:text-amber-700">古典文库</Link>
          <Link to="/digital-coplay" className="border-b-2 border-amber-800 pb-1 font-medium text-amber-800">数字共演</Link>
          <Link to="/ugc-community" className="hover:text-amber-700">UGC社区</Link>
          <Link to="/my-collection" className="hover:text-amber-700">我的创作</Link>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl">
        <div className="mb-8 text-center">
          <h2 className="title-serif text-4xl">数字共演</h2>
          <p className="mt-3 text-stone-500">从收藏夹选择角色，编排顺序，让他们在同一场景中轮流发言</p>
        </div>

        {!isInitializing && !user ? (
          <section className="mx-auto max-w-xl rounded-xl border border-amber-100 bg-white p-10 text-center shadow-lg">
            <h3 className="mb-3 text-2xl font-medium">请先登录</h3>
            <p className="mb-6 text-stone-500">登录后可收藏角色并创建数字共演会话。</p>
            <button onClick={openLogin} className="btn-primary">账号登录</button>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[330px_minmax(0,1fr)_300px]">
            <section className="rounded-xl border border-amber-100 bg-white p-5 shadow-lg">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-medium text-amber-900"><i className="fa-solid fa-star mr-2" />角色收藏夹</h3>
                <span className="text-sm text-stone-400">{selectedIds.length}/{MAX_CHARACTERS}</span>
              </div>
              <div className="max-h-[680px] space-y-3 overflow-y-auto pr-2">
                {favorites.length === 0 && <p className="rounded-lg bg-amber-50 p-4 text-sm text-stone-500">暂无收藏角色。可在“创意工坊 · 分角色剧本”中分析并收藏角色。</p>}
                {favorites.map(character => (
                  <article key={character.id} className={`rounded-lg border p-4 ${selectedIds.includes(character.id) ? 'border-amber-400 bg-amber-50' : 'border-stone-200'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => toggleSelected(character.id)} className="min-w-0 flex-1 text-left">
                        <strong className="block truncate text-lg">{character.name}</strong>
                        <span className="mt-1 block text-xs text-stone-400">{character.sourceChapterTitle ? `${character.sourceTitle} · ${character.sourceChapterTitle}` : character.sourceTitle || '未知来源'}</span>
                      </button>
                      <button type="button" onClick={() => void removeFavorite(character.id)} aria-label="取消收藏" className="rounded-md px-2 py-1 text-stone-400 hover:bg-white hover:text-red-600">
                        <i className="fa-solid fa-trash-can" />
                      </button>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-stone-500">{character.description || '暂无简介'}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-amber-100 bg-white p-6 shadow-lg">
              <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
                <div>
                  <label className="mb-2 block text-sm font-medium text-amber-900">会话名称</label>
                  <input value={title} onChange={event => setTitle(event.target.value)} maxLength={80} className="w-full rounded-lg border border-amber-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="留空则用角色名自动命名" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-amber-900">预设场景</label>
                  <div className="grid grid-cols-4 gap-2">
                    {scenePresets.map(preset => (
                      <button key={preset.name} type="button" onClick={() => setScene(preset.text)} className="rounded-lg border border-amber-200 px-3 py-2 text-sm text-amber-800 hover:bg-amber-50">{preset.name}</button>
                    ))}
                  </div>
                </div>
              </div>
              <label className="mb-2 block text-sm font-medium text-amber-900">场景背景</label>
              <textarea value={scene} onChange={event => setScene(event.target.value)} maxLength={2000} rows={5} className="mb-5 w-full resize-none rounded-lg border border-amber-200 p-4 leading-7 focus:outline-none focus:ring-2 focus:ring-amber-400" />

              <div className="mb-5 rounded-lg border border-amber-100 bg-amber-50/60 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-medium text-amber-900">发言顺序</h4>
                  <button type="button" onClick={() => setSelectedIds([])} className="text-sm text-amber-700 hover:underline">清空</button>
                </div>
                {selectedFavorites.length === 0 ? <p className="text-sm text-stone-500">从左侧收藏夹选择角色后，可在这里调整顺序。</p> : (
                  <ol className="space-y-2">
                    {selectedFavorites.map((character, index) => (
                      <li key={character.id} className="flex items-center gap-3 rounded-lg bg-white p-3">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-700 text-sm text-white">{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate">{character.name}</span>
                        <button type="button" onClick={() => moveSelected(index, -1)} disabled={index === 0} aria-label="上移" className="rounded px-2 py-1 text-stone-500 hover:bg-amber-50 disabled:opacity-30"><i className="fa-solid fa-arrow-up" /></button>
                        <button type="button" onClick={() => moveSelected(index, 1)} disabled={index === selectedFavorites.length - 1} aria-label="下移" className="rounded px-2 py-1 text-stone-500 hover:bg-amber-50 disabled:opacity-30"><i className="fa-solid fa-arrow-down" /></button>
                      </li>
                    ))}
                  </ol>
                )}
                <button type="button" onClick={() => void startSession()} disabled={loading || selectedIds.length < 2} className="btn-primary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-50">
                  <i className="fa-solid fa-play mr-2" />{loading ? '生成中...' : '开始对话'}
                </button>
              </div>

              <div className="min-h-[420px] rounded-lg border border-stone-200 bg-[#fffefa] p-5">
                {sessionLoading ? <p className="text-center text-stone-400">加载中...</p> : activeSession ? (
                  <>
                    <div className="mb-4 border-b border-amber-100 pb-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-2xl font-semibold text-amber-900">{activeSession.title}</h3>
                          <p className="mt-2 line-clamp-2 text-sm text-stone-500">{activeSession.scene}</p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => void saveSessionCreation('draft')}
                            disabled={creationSaving !== null || activeSession.messages.length === 0}
                            className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <i className="fa-regular fa-floppy-disk mr-2" />{creationSaving === 'draft' ? '保存中...' : '保存为作品'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveSessionCreation('publish')}
                            disabled={creationSaving !== null || activeSession.messages.length === 0}
                            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <i className="fa-solid fa-paper-plane mr-2" />{creationSaving === 'publish' ? '提交中...' : '发布到社区'}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="max-h-[520px] space-y-4 overflow-y-auto pr-2">
                      {activeSession.messages.length === 0 && <p className="text-stone-400">暂无发言。</p>}
                      {activeSession.messages.map(message => (
                        <article key={message.id} className={`rounded-lg p-4 ${message.role === 'user' ? 'ml-12 bg-amber-100 text-stone-800' : 'mr-12 border border-amber-100 bg-white'}`}>
                          <div className="mb-1 text-sm font-medium text-amber-900">{message.role === 'user' ? '用户引导' : message.characterName}</div>
                          <p className="whitespace-pre-wrap leading-7">{message.content}</p>
                        </article>
                      ))}
                    </div>
                    <div className="mt-5 border-t border-amber-100 pt-4">
                      <textarea value={userMessage} onChange={event => setUserMessage(event.target.value)} maxLength={1000} rows={3} className="w-full resize-none rounded-lg border border-amber-200 p-3 focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder="可写一句引导语；留空则直接进入下一轮角色发言" />
                      <button type="button" onClick={() => void continueTurn()} disabled={loading} className="btn-primary mt-3 disabled:cursor-not-allowed disabled:opacity-50">
                        <i className="fa-solid fa-rotate mr-2" />{loading ? '生成中...' : '继续一轮'}
                      </button>
                    </div>
                  </>
                ) : <p className="text-center text-stone-400">创建或打开一个会话后，角色发言会显示在这里。</p>}
              </div>
            </section>

            <section className="rounded-xl border border-amber-100 bg-white p-5 shadow-lg">
              <h3 className="mb-4 text-xl font-medium text-amber-900"><i className="fa-regular fa-comments mr-2" />会话历史</h3>
              <div className="space-y-3">
                {sessions.length === 0 && <p className="rounded-lg bg-amber-50 p-4 text-sm text-stone-500">暂无会话。</p>}
                {sessions.map(session => (
                  <article key={session.id} className={`rounded-lg border p-4 ${activeSession?.id === session.id ? 'border-amber-400 bg-amber-50' : 'border-stone-200'}`}>
                    <button type="button" onClick={() => void openSession(session.id)} className="block w-full text-left">
                      <strong className="block truncate">{session.title}</strong>
                      <span className="mt-1 block text-xs text-stone-400">{new Date(session.updatedAt).toLocaleString('zh-CN')}</span>
                      <span className="mt-2 block line-clamp-2 text-sm text-stone-500">{session.messages[0]?.content || session.scene}</span>
                    </button>
                    <button type="button" onClick={() => void deleteSession(session.id)} className="mt-3 text-sm text-red-600 hover:underline">删除会话</button>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
