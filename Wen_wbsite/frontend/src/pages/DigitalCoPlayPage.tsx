import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AuthContext } from '@/contexts/authContext';
import { useTheme } from '@/hooks/useTheme';
import JinlingLetterDialogue, { type JinlingLetterDialogueHandle } from '@/components/JinlingLetterDialogue';
import SanguPlotDialogue from '@/components/SanguPlotDialogue';
import WaterMarginPlotDialogue from '@/components/WaterMarginPlotDialogue';
import JourneyPlotDialogue from '@/components/JourneyPlotDialogue';
import SiteHeader from '@/components/SiteHeader';
import * as api from '@/api';

type CoPlayPanel = 'dialogue' | 'theater' | 'characters';

const characterSourceLabel = (character: api.FavoriteCharacter) => (
  character.sourceChapterTitle
    ? `${character.sourceTitle || '未知文本'} · ${character.sourceChapterTitle}`
    : character.sourceTitle || '未知文本'
);

const compactText = (text: string | null | undefined, fallback = '暂无记录') => {
  const value = (text || '').replace(/\s+/g, ' ').trim();
  return value || fallback;
};

const briefMemory = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 160);

const characterTags = (character: api.FavoriteCharacter) => {
  const text = `${character.description || ''} ${character.deeds || ''}`;
  const tags = [
    [/忠|义|信|诺|守/g, '重义'],
    [/智|谋|机敏|聪慧|洞察/g, '机敏'],
    [/勇|胆|战|护|救/g, '果决'],
    [/情|爱|怜|思|念/g, '深情'],
    [/孤|冷|傲|清/g, '孤高'],
    [/狐|妖|仙|鬼|神|怪/g, '异质'],
  ]
    .filter(([pattern]) => (pattern as RegExp).test(text))
    .map(([, label]) => label as string);
  if (tags.length > 0) return Array.from(new Set(tags)).slice(0, 4);
  return compactText(character.description, '待完善').split(/[，,、；;\s]+/).filter(Boolean).slice(0, 3);
};

const buildMemoryDraft = (character: api.FavoriteCharacter) => [
  character.description ? `属性简述：${character.description}` : null,
  character.deeds ? `灵魂与记忆：${character.deeds}` : null,
].filter(Boolean).join('\n\n');

const scenePresets = [
  {
    name: '三国演义',
    summary: '群雄逐鹿',
    imageSrc: '/digital-coplay-presets/三国演义.png',
    text: '群雄逐鹿：汉末风云四起，谋臣武将会于军帐之间。众人以天下大势、联盟背叛与个人抉择为题，权衡忠义、智谋与兴亡。',
  },
  {
    name: '水浒传',
    summary: '义聚梁山',
    imageSrc: '/digital-coplay-presets/水浒传.png',
    text: '义聚梁山：水泊烟波之上，群豪因义气、冤屈与生路相聚。角色们在聚义厅中议事，谈江湖规矩、兄弟情分与反抗的代价。',
  },
  {
    name: '红楼梦',
    summary: '梦断金陵',
    imageSrc: '/红楼梦.png',
    text: '梦断金陵：大观园花影摇落，繁华深处已有离散之声。角色们围坐灯前，谈情、诗、家族命运与无法挽回的盛衰。',
  },
  {
    name: '西游记',
    summary: '灵山问道',
    imageSrc: '/digital-coplay-presets/西游记.png',
    text: '灵山问道：取经路上云山万重，妖魔、神佛与凡心交错。角色们在行旅暂歇处对话，追问修行、欲念、师徒情义与成道之难。',
  },
];

const journeyPortraitSources = ['孙悟空', '铁扇公主', '猪八戒', '牛魔王']
  .map(name => `/digital-coplay-characters/${name}.webp`);

export default function DigitalCoPlayPage() {
  const { isDark } = useTheme();
  const { user, isInitializing, openLogin } = useContext(AuthContext);
  const jinlingLetterRef = useRef<JinlingLetterDialogueHandle>(null);
  const sanguPlotRef = useRef<JinlingLetterDialogueHandle>(null);
  const waterMarginPlotRef = useRef<JinlingLetterDialogueHandle>(null);
  const journeyPlotRef = useRef<JinlingLetterDialogueHandle>(null);
  const theaterScrollRef = useRef<HTMLDivElement>(null);
  const [activePanel, setActivePanel] = useState<CoPlayPanel>('dialogue');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [favorites, setFavorites] = useState<api.FavoriteCharacter[]>([]);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [activeScenePresetName, setActiveScenePresetName] = useState(scenePresets[0].name);
  const [activeFavoriteId, setActiveFavoriteId] = useState<number | null>(null);
  const [soulMemoryInput, setSoulMemoryInput] = useState('');
  const [attributeSaving, setAttributeSaving] = useState(false);
  const [activeChatFavoriteId, setActiveChatFavoriteId] = useState<number | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessagesByFavorite, setChatMessagesByFavorite] = useState<Record<number, api.CharacterChatMessage[]>>({});

  const activeScenePreset = useMemo(
    () => scenePresets.find(preset => preset.name === activeScenePresetName) || scenePresets[0],
    [activeScenePresetName],
  );

  const centerTheater = () => {
    const scrollArea = theaterScrollRef.current;
    if (scrollArea) scrollArea.scrollLeft = (scrollArea.scrollWidth - scrollArea.clientWidth) / 2;
  };

  useEffect(() => {
    // 切换场景后从画面中央开始浏览，用户仍可左右拖动查看完整舞台。
    const frame = window.requestAnimationFrame(centerTheater);
    return () => window.cancelAnimationFrame(frame);
  }, [activeScenePresetName, activePanel]);

  useEffect(() => {
    if (activeScenePresetName !== '西游记') return;
    // 进入灵山问道后即预取人物，避免点击火焰山标记时才同时请求四张图。
    journeyPortraitSources.forEach(src => {
      const portrait = new Image();
      portrait.decoding = 'async';
      portrait.src = src;
    });
  }, [activeScenePresetName]);

  const activeFavorite = useMemo(
    () => favorites.find(character => character.id === activeFavoriteId) || favorites[0] || null,
    [activeFavoriteId, favorites],
  );

  const activeChatFavorite = useMemo(
    () => favorites.find(character => character.id === activeChatFavoriteId) || favorites[0] || null,
    [activeChatFavoriteId, favorites],
  );
  const activeChatMessages = activeChatFavorite ? chatMessagesByFavorite[activeChatFavorite.id] || [] : [];
  const chatHistoryItems = favorites
    .map(character => {
      const messages = chatMessagesByFavorite[character.id] || [];
      const lastMessage = messages[messages.length - 1];
      return lastMessage ? { character, lastMessage, count: messages.length } : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => new Date(right.lastMessage.createdAt).getTime() - new Date(left.lastMessage.createdAt).getTime());

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const favoriteRows = await api.getFavoriteCharacters();
        setFavorites(favoriteRows);
        const nextFavorite = favoriteRows[0];
        if (nextFavorite) {
          setActiveFavoriteId(current => current || nextFavorite.id);
          setActiveChatFavoriteId(current => current || nextFavorite.id);
          setSoulMemoryInput(current => current || buildMemoryDraft(nextFavorite));
        }
      } catch (caught) {
        toast.error(caught instanceof Error ? caught.message : '数字共演数据加载失败');
      }
    };
    void load();
  }, [user]);

  const removeFavorite = async (id: number) => {
    try {
      await api.removeFavoriteCharacter(id);
      setFavorites(current => current.filter(character => character.id !== id));
      if (activeFavoriteId === id) {
        const nextFavorite = favorites.find(character => character.id !== id) || null;
        setActiveFavoriteId(nextFavorite?.id || null);
        setSoulMemoryInput(nextFavorite ? buildMemoryDraft(nextFavorite) : '');
      }
      if (activeChatFavoriteId === id) {
        const nextFavorite = favorites.find(character => character.id !== id) || null;
        setActiveChatFavoriteId(nextFavorite?.id || null);
      }
      setChatMessagesByFavorite(current => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      toast.success('已取消收藏');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '取消收藏失败');
    }
  };

  const editFavorite = (character: api.FavoriteCharacter) => {
    setActiveFavoriteId(character.id);
    setSoulMemoryInput(buildMemoryDraft(character));
  };

  const importMemoryFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error('文件不能超过 1MB');
      return;
    }
    try {
      const content = await file.text();
      setSoulMemoryInput(current => [current.trim(), content.trim()].filter(Boolean).join('\n\n'));
      toast.success('资源内容已导入');
    } catch {
      toast.error('读取文件失败，请使用文本格式文件');
    }
  };

  const saveFavoriteAttributes = async () => {
    if (!activeFavorite) return;
    const memory = soulMemoryInput.trim();
    try {
      setAttributeSaving(true);
      const updated = await api.updateFavoriteCharacter(activeFavorite.id, {
        description: briefMemory(memory) || activeFavorite.description || null,
        deeds: memory || null,
      });
      setFavorites(current => current.map(character => character.id === updated.id ? updated : character));
      if (activeChatFavoriteId === updated.id) setActiveChatFavoriteId(updated.id);
      toast.success('角色属性已保存');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '保存角色属性失败');
    } finally {
      setAttributeSaving(false);
    }
  };

  const switchChatFavorite = (id: number) => {
    setActiveChatFavoriteId(id);
    setActivePanel('dialogue');
  };

  const sendCharacterChat = async () => {
    const message = chatInput.trim();
    if (!activeChatFavorite || !message) return;
    const userEntry: api.CharacterChatMessage = {
      role: 'user',
      characterName: null,
      content: message,
      createdAt: new Date().toISOString(),
    };
    const previous = chatMessagesByFavorite[activeChatFavorite.id] || [];
    setChatMessagesByFavorite(current => ({
      ...current,
      [activeChatFavorite.id]: [...(current[activeChatFavorite.id] || []), userEntry],
    }));
    setChatInput('');

    try {
      setChatLoading(true);
      const reply = await api.chatWithFavoriteCharacter(activeChatFavorite.id, {
        message,
        history: previous.slice(-20).map(item => ({ role: item.role, content: item.content })),
      });
      setChatMessagesByFavorite(current => ({
        ...current,
        [activeChatFavorite.id]: [...(current[activeChatFavorite.id] || []), reply],
      }));
    } catch (caught) {
      setChatMessagesByFavorite(current => ({
        ...current,
        [activeChatFavorite.id]: (current[activeChatFavorite.id] || []).filter(item => item !== userEntry),
      }));
      setChatInput(message);
      toast.error(caught instanceof Error ? caught.message : '角色对话失败');
    } finally {
      setChatLoading(false);
    }
  };

  const sidebarItems: Array<{ key: CoPlayPanel; label: string; icon: string; summary: string }> = [
    { key: 'dialogue', label: '对话', icon: 'fa-comments', summary: activeChatFavorite ? activeChatFavorite.name : '角色聊天' },
    { key: 'theater', label: '数字共演剧场', icon: 'fa-masks-theater', summary: '4 个经典栏目' },
    { key: 'characters', label: '角色设定', icon: 'fa-user-gear', summary: `${favorites.length} 个收藏角色` },
  ];

  const renderDialoguePanel = () => (
    <section className="mx-auto flex h-full min-h-0 max-w-5xl flex-col rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-100 px-6 py-4">
        <div className="mb-4 flex flex-wrap items-center gap-2 pb-1">
          {favorites.length === 0 && <span className="rounded-full bg-stone-100 px-3 py-1.5 text-sm text-stone-500">暂无收藏角色</span>}
          {favorites.map(character => (
            <button
              key={character.id}
              type="button"
              onClick={() => switchChatFavorite(character.id)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition ${
                activeChatFavorite?.id === character.id
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-400 hover:bg-white'
              }`}
            >
              {character.name}
            </button>
          ))}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-400">Role Chat</p>
          <h2 className="mt-2 text-3xl font-semibold text-stone-900">
            {activeChatFavorite ? `你好，我是${activeChatFavorite.name}，我们聊些什么？` : '选择一个收藏角色开始对话'}
          </h2>
          {activeChatFavorite && (
            <p className="mt-2 line-clamp-2 text-sm text-stone-500">
              {characterSourceLabel(activeChatFavorite)} · {compactText(activeChatFavorite.description || activeChatFavorite.deeds, '角色属性待完善')}
            </p>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[#fbfbfa] px-4 py-5 sm:px-8 sm:py-6">
        {activeChatFavorite ? (
          <div className="space-y-5">
            {activeChatMessages.length === 0 && (
              <div className="grid min-h-[320px] place-items-center text-center text-stone-400">
                <div>
                  <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-stone-100 text-2xl text-stone-500">
                    <i className="fa-regular fa-message" />
                  </div>
                  <p>角色会依据“角色设定”里的最新属性回答。</p>
                </div>
              </div>
            )}
            {activeChatMessages.map((message, index) => (
              <article key={`${message.createdAt}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[72%] sm:px-5 ${
                  message.role === 'user'
                    ? 'rounded-br-md bg-stone-900 text-white'
                    : 'rounded-bl-md border border-stone-200 bg-white text-stone-800'
                }`}>
                  <div className={`mb-1 text-xs ${message.role === 'user' ? 'text-stone-300' : 'text-amber-800'}`}>
                    {message.role === 'user' ? '我' : message.characterName || activeChatFavorite.name}
                  </div>
                  <p className="whitespace-pre-wrap leading-7">{message.content}</p>
                </div>
              </article>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md border border-stone-200 bg-white px-5 py-3 text-stone-500 shadow-sm">
                  <i className="fa-solid fa-spinner fa-spin mr-2" />思考中
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid h-full place-items-center px-6 text-center text-stone-400">
            <div>
              <p>暂无可对话角色。</p>
              <p className="mt-2 text-sm">请从“古典文库 → 知识图谱 → 人物关系”中选择人物。</p>
            </div>
          </div>
        )}
      </div>

      <form
        className="border-t border-stone-100 p-5"
        onSubmit={event => {
          event.preventDefault();
          void sendCharacterChat();
        }}
      >
        <div className="flex items-end gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
          <textarea
            value={chatInput}
            onChange={event => setChatInput(event.target.value)}
            maxLength={1000}
            rows={3}
            disabled={!activeChatFavorite || chatLoading}
            className="min-h-[72px] flex-1 resize-none border-0 bg-transparent px-2 py-1 leading-7 text-stone-800 outline-none disabled:text-stone-400"
            placeholder={activeChatFavorite ? `给${activeChatFavorite.name}发送消息` : '请先收藏角色'}
          />
          <button
            type="submit"
            disabled={!activeChatFavorite || !chatInput.trim() || chatLoading}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-stone-900 text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300"
            aria-label="发送"
          >
            <i className="fa-solid fa-arrow-up" />
          </button>
        </div>
      </form>
    </section>
  );

  const renderTheaterPanel = () => (
    <section className="relative h-[calc(100dvh-9.5rem)] min-h-[560px] overflow-hidden bg-stone-100 md:h-full md:min-h-0">
      <div
        ref={theaterScrollRef}
        className="absolute inset-0 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:thin] md:overflow-hidden"
        aria-label="可左右滚动查看完整舞台"
      >
        <div className="relative h-full w-max md:w-full">
          <img
            src={activeScenePreset.imageSrc}
            alt={`${activeScenePreset.name}插图`}
            className="h-full w-auto max-w-none select-none md:w-full md:object-cover"
            draggable={false}
            onLoad={centerTheater}
          />

          {activeScenePreset.name === '红楼梦' && (
            <button
              type="button"
              onClick={() => jinlingLetterRef.current?.init()}
              className="absolute left-[38%] top-[56%] z-20 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-amber-100/90 bg-stone-950/55 text-lg font-semibold text-amber-50 shadow-lg shadow-stone-950/30 outline-none backdrop-blur transition hover:scale-105 hover:bg-amber-100 hover:text-amber-950 focus-visible:ring-2 focus-visible:ring-amber-100"
              aria-label="打开标号1潇湘馆黛玉葬花剧情"
              title="潇湘馆・黛玉葬花"
            >
              1
            </button>
          )}
          {activeScenePreset.name === '三国演义' && (
            <button
              type="button"
              onClick={() => sanguPlotRef.current?.init()}
              className="absolute left-1/2 top-1/3 z-20 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-amber-100/90 bg-stone-950/55 text-lg font-semibold text-amber-50 shadow-lg shadow-stone-950/30 outline-none backdrop-blur transition hover:scale-105 hover:bg-amber-100 hover:text-amber-950 focus-visible:ring-2 focus-visible:ring-amber-100"
              aria-label="打开标号1三顾茅庐剧情"
              title="三顾茅庐"
            >
              1
            </button>
          )}
          {activeScenePreset.name === '水浒传' && (
            <button
              type="button"
              onClick={() => waterMarginPlotRef.current?.init()}
              className="absolute left-[14%] top-[76%] z-20 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-amber-100/90 bg-stone-950/55 text-lg font-semibold text-amber-50 shadow-lg shadow-stone-950/30 outline-none backdrop-blur transition hover:scale-105 hover:bg-amber-100 hover:text-amber-950 focus-visible:ring-2 focus-visible:ring-amber-100"
              aria-label="打开标号1倒拔垂杨柳剧情"
              title="倒拔垂杨柳"
            >
              1
            </button>
          )}
          {activeScenePreset.name === '西游记' && (
            <button
              type="button"
              onClick={() => journeyPlotRef.current?.init()}
              className="absolute left-[58%] top-[35%] z-20 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-amber-100/90 bg-stone-950/55 text-lg font-semibold text-amber-50 shadow-lg shadow-stone-950/30 outline-none backdrop-blur transition hover:scale-105 hover:bg-amber-100 hover:text-amber-950 focus-visible:ring-2 focus-visible:ring-amber-100"
              aria-label="打开标号1火焰山三借芭蕉扇剧情"
              title="火焰山・三借芭蕉扇"
            >
              1
            </button>
          )}
          <button
            type="button"
            onClick={() => setComingSoonOpen(true)}
            className="absolute left-[72%] top-[62%] z-20 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-amber-100/90 bg-stone-950/55 text-lg font-semibold text-amber-50 shadow-lg shadow-stone-950/30 outline-none backdrop-blur transition hover:scale-105 hover:bg-amber-100 hover:text-amber-950 focus-visible:ring-2 focus-visible:ring-amber-100"
            aria-label={`打开标号2${activeScenePreset.name}后续剧情`}
            title="未完待续"
          >
            2
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/55 via-black/20 to-transparent p-3 sm:p-6">
        <div className="pointer-events-auto flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
          <div className="min-w-0 text-white drop-shadow">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-amber-100">Theater</p>
            <h2 className="mt-1 text-2xl font-semibold sm:text-3xl">数字共演剧场</h2>
          </div>
          <div className="flex items-center gap-3 sm:shrink-0">
            <div className="grid w-full grid-cols-2 gap-2 rounded-lg border border-white/20 bg-stone-950/35 p-2 backdrop-blur sm:w-auto sm:grid-cols-4">
              {scenePresets.map(preset => {
                const active = activeScenePreset.name === preset.name;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setActiveScenePresetName(preset.name);
                    }}
                    className={`h-11 rounded-md border px-2 text-sm font-medium transition sm:min-w-20 sm:px-3 ${
                      active
                        ? 'border-amber-200 bg-amber-100 text-amber-950'
                        : 'border-white/25 bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {preset.summary}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {activeScenePreset.name === '红楼梦' && (
        <JinlingLetterDialogue
          ref={jinlingLetterRef}
          favorites={favorites}
          onComplete={() => toast.success('剧情结束')}
        />
      )}
      {activeScenePreset.name === '三国演义' && (
        <SanguPlotDialogue
          ref={sanguPlotRef}
          favorites={favorites}
          onComplete={() => toast.success('剧情结束')}
        />
      )}
      {activeScenePreset.name === '水浒传' && (
        <WaterMarginPlotDialogue
          ref={waterMarginPlotRef}
          favorites={favorites}
          onComplete={() => toast.success('剧情结束')}
        />
      )}
      {activeScenePreset.name === '西游记' && (
        <JourneyPlotDialogue
          ref={journeyPlotRef}
          favorites={favorites}
          onComplete={() => toast.success('剧情结束')}
        />
      )}
      {comingSoonOpen && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-stone-950/45 p-5" onMouseDown={() => setComingSoonOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="后续剧情提示" className="w-full max-w-sm rounded-2xl border border-amber-100 bg-[#fffaf0] p-8 text-center shadow-2xl" onMouseDown={event => event.stopPropagation()}>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-xl text-amber-800"><i className="fa-solid fa-hourglass-half" /></div>
            <p className="mt-5 font-serif text-2xl font-semibold text-amber-950">未完待续</p>
            <button type="button" onClick={() => setComingSoonOpen(false)} className="btn-primary mt-6 min-w-28">知道了</button>
          </div>
        </div>
      )}
    </section>
  );

  const renderCharactersPanel = () => (
    <section className="flex min-h-0 flex-col gap-4 md:grid md:h-full md:grid-cols-[340px_minmax(0,1fr)] md:gap-5">
      <aside className="flex min-h-0 flex-col rounded-lg border border-amber-100 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-amber-700">Characters</p>
            <h2 className="mt-1 text-2xl font-semibold text-amber-950">角色设定</h2>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {favorites.length === 0 && <p className="rounded-lg bg-stone-50 p-4 text-sm text-stone-400">暂无收藏角色。请从“古典文库 → 知识图谱 → 人物关系”中选择人物。</p>}
          {favorites.map(character => {
            const tags = characterTags(character);
            const active = activeFavorite?.id === character.id;
            return (
              <article key={character.id} className={`rounded-lg border p-4 transition ${active ? 'border-amber-400 bg-amber-50' : 'border-stone-200 hover:border-amber-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-xl text-amber-950">{character.name}</strong>
                    <span className="mt-1 block line-clamp-2 text-xs text-stone-500">来源：{characterSourceLabel(character)}</span>
                  </div>
                  <button type="button" onClick={() => void removeFavorite(character.id)} aria-label="取消收藏" className="rounded-md px-2 py-1 text-stone-400 hover:bg-white hover:text-red-600">
                    <i className="fa-solid fa-trash-can" />
                  </button>
                </div>
                <div className="mt-3">
                  <p className="text-xs font-medium text-amber-900">相关事迹</p>
                  <p className="mt-1 line-clamp-3 text-sm text-stone-600">{compactText(character.deeds || character.description)}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {tags.map(tag => (
                    <span key={tag} className="rounded-full bg-white px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200">{tag}</span>
                  ))}
                </div>
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => editFavorite(character)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${active ? 'border-amber-700 bg-amber-700 text-white' : 'border-amber-200 text-amber-800 hover:bg-white'}`}
                  >
                    更改属性
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col rounded-lg border border-amber-100 bg-white shadow-sm">
        <div className="border-b border-amber-100 px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-amber-700">Soul & Memory</p>
          <div className="mt-1 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-3xl font-semibold text-amber-950">灵魂与记忆</h2>
              <p className="mt-2 text-sm text-stone-500">{activeFavorite ? `${activeFavorite.name} · ${characterSourceLabel(activeFavorite)}` : '选择一个收藏角色后编辑人物属性'}</p>
            </div>
            <label className="btn-secondary cursor-pointer">
              <i className="fa-solid fa-file-arrow-up mr-2" />上传资源
              <input
                type="file"
                accept=".txt,.md,.json,.csv,text/plain,text/markdown,application/json"
                className="hidden"
                onChange={event => {
                  void importMemoryFile(event.target.files?.[0]);
                  event.currentTarget.value = '';
                }}
                disabled={!activeFavorite || attributeSaving}
              />
            </label>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 p-4 md:grid-cols-[260px_minmax(0,1fr)] md:gap-5 md:p-6">
          <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-5">
            {activeFavorite ? (
              <>
                <h3 className="truncate text-2xl font-semibold text-amber-950">{activeFavorite.name}</h3>
                <p className="mt-2 text-sm text-stone-500">来源：{characterSourceLabel(activeFavorite)}</p>
                <div className="mt-5">
                  <p className="text-sm font-medium text-amber-900">相关事迹</p>
                  <p className="mt-2 line-clamp-6 text-sm leading-7 text-stone-600">{compactText(activeFavorite.deeds || activeFavorite.description)}</p>
                </div>
                <div className="mt-5">
                  <p className="text-sm font-medium text-amber-900">标签</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {characterTags(activeFavorite).map(tag => (
                      <span key={tag} className="rounded-full bg-white px-2.5 py-1 text-xs text-amber-800 ring-1 ring-amber-200">{tag}</span>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-stone-500">暂无可编辑角色。</p>
            )}
          </div>

          <div className="flex min-h-0 flex-col">
            <label htmlFor="soul-memory" className="mb-2 block text-sm font-medium text-amber-900">灵魂与记忆</label>
            <textarea
              id="soul-memory"
              value={soulMemoryInput}
              onChange={event => setSoulMemoryInput(event.target.value)}
              disabled={!activeFavorite || attributeSaving}
              maxLength={4000}
              className="min-h-0 flex-1 resize-none rounded-lg border border-amber-200 p-4 leading-7 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-stone-50 disabled:text-stone-400"
              placeholder="输入或上传人物经历、语言风格、性格底色、重要记忆、禁忌与目标。保存后会写入后台，并在左侧人物卡片中显示为简要属性。"
            />
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-stone-400">{soulMemoryInput.length}/4000</span>
              <button
                type="button"
                onClick={() => void saveFavoriteAttributes()}
                disabled={!activeFavorite || attributeSaving}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <i className="fa-regular fa-floppy-disk mr-2" />{attributeSaving ? '保存中...' : '保存属性'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </section>
  );

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gray-900 text-gray-100' : 'bg-[#F9F6F0] text-gray-800'}`}>
      <div className="h-16 border-b border-amber-100 bg-[#fbf7ef]/90 px-4 py-2.5 backdrop-blur sm:h-20 sm:px-8 sm:py-[18px]">
        <SiteHeader />
      </div>

      {!isInitializing && !user ? (
        <main className="grid min-h-[calc(100vh-5rem)] place-items-center p-8">
          <section className="mx-auto max-w-xl rounded-xl border border-amber-100 bg-white p-10 text-center shadow-lg">
            <h2 className="mb-3 text-2xl font-medium">请先登录</h2>
            <p className="mb-6 text-stone-500">登录后可收藏角色并创建数字共演会话。</p>
            <button onClick={openLogin} className="btn-primary">账号登录</button>
          </section>
        </main>
      ) : (
        <main
          className={`flex min-h-[calc(100dvh-4rem)] flex-col gap-0 md:grid md:h-[calc(100vh-5rem)] md:min-h-0 md:transition-[grid-template-columns] md:duration-300 ${
            sidebarCollapsed ? 'md:grid-cols-[72px_minmax(0,1fr)]' : 'md:grid-cols-[12.5%_minmax(0,1fr)]'
          }`}
        >
          <aside className="flex min-h-0 flex-col border-b border-amber-100 bg-[#fffaf1] md:border-b-0 md:border-r">
            <div className="hidden h-16 items-center justify-between border-b border-amber-100 px-4 md:flex">
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-amber-950">数字共演</h2>
                  <p className="truncate text-xs text-stone-500">工作台</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => setSidebarCollapsed(current => !current)}
                aria-label={sidebarCollapsed ? '展开边栏' : '收缩边栏'}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-amber-200 text-amber-800 hover:bg-amber-50"
              >
                <i className={`fa-solid ${sidebarCollapsed ? 'fa-angles-right' : 'fa-angles-left'}`} />
              </button>
            </div>

            <nav className="grid grid-cols-3 gap-2 p-2 md:block md:space-y-2 md:p-3">
              {sidebarItems.map(item => {
                const active = activePanel === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActivePanel(item.key)}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={`flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center transition md:flex-row md:gap-3 md:px-3 md:py-3 md:text-left ${
                      active ? 'border-amber-300 bg-white text-amber-900 shadow-sm' : 'border-transparent text-stone-600 hover:bg-white/70 hover:text-amber-900'
                    } ${sidebarCollapsed ? 'justify-center' : ''}`}
                  >
                    <i className={`fa-solid ${item.icon} w-5 text-center text-lg`} />
                    <span className="text-xs md:hidden">{item.label}</span>
                    {!sidebarCollapsed && (
                      <span className="hidden min-w-0 md:block">
                        <span className="block truncate font-medium">{item.label}</span>
                        <span className="block truncate text-xs text-stone-400">{item.summary}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {!sidebarCollapsed && (
              <div className="hidden min-h-0 flex-1 border-t border-amber-100 p-3 md:block">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-medium text-amber-900">聊天历史</span>
                  <span className="text-[11px] text-stone-400">{chatHistoryItems.length}</span>
                </div>
                <div className="max-h-full space-y-2 overflow-y-auto pr-1">
                  {chatHistoryItems.length === 0 && (
                    <p className="rounded-lg bg-white/70 px-3 py-2 text-xs text-stone-400">暂无聊天记录</p>
                  )}
                  {chatHistoryItems.map(item => (
                    <button
                      key={item.character.id}
                      type="button"
                      onClick={() => switchChatFavorite(item.character.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                        activePanel === 'dialogue' && activeChatFavorite?.id === item.character.id
                          ? 'border-amber-300 bg-white text-amber-900 shadow-sm'
                          : 'border-transparent bg-white/60 text-stone-600 hover:bg-white'
                      }`}
                    >
                      <span className="block truncate text-sm font-medium">{item.character.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-stone-400">{item.lastMessage.content}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!sidebarCollapsed && (
              <div className="hidden border-t border-amber-100 p-4 text-xs text-stone-500 md:block">
                <p className="truncate">{user?.nickname || user?.phone || '当前用户'}</p>
              </div>
            )}
          </aside>

          <section className={`min-h-0 flex-1 overflow-y-auto md:overflow-hidden ${activePanel === 'theater' ? 'p-0' : 'p-3 sm:p-6'}`}>
            {activePanel === 'dialogue' && renderDialoguePanel()}
            {activePanel === 'theater' && renderTheaterPanel()}
            {activePanel === 'characters' && renderCharactersPanel()}
          </section>
        </main>
      )}
    </div>
  );
}
