import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import * as api from '@/api';

export type JinlingDialogueLine = {
  id: number;
  speaker: string;
  content: string;
};

export type PlotSpeakerTone = { avatar: string; role: string; ring: string; glow: string; portrait: string };
export type PlotPortrait = { speaker: string; align: 'left' | 'right'; className?: string };

export type JinlingLetterDialogueHandle = {
  init: (options?: { startIndex?: number }) => void;
  startPlot: () => void;
  nextLine: () => void;
  skip: () => void;
  reset: () => void;
  close: () => void;
};

type JinlingLetterDialogueProps = {
  className?: string;
  typewriterSpeed?: number;
  favorites?: api.FavoriteCharacter[];
  onComplete?: () => void;
  title?: string;
  ariaLabel?: string;
  lines?: JinlingDialogueLine[];
  tones?: Record<string, PlotSpeakerTone>;
  portraits?: PlotPortrait[];
  participationScene?: 'jinling' | 'sangu' | 'water-margin';
};

type DialogueDisplayLine = {
  speaker: string;
  content: string;
  participant?: boolean;
};

export const jinlingLetterDialogueLines: JinlingDialogueLine[] = [
  { id: 1, speaker: '黛玉', content: '风过落红成阵，任人践踏泥污，何其薄命。' },
  { id: 2, speaker: '宝玉', content: '我正收拾落花撂入沁芳溪，妹妹来得正好。' },
  { id: 3, speaker: '黛玉', content: '撂水里不好，此溪干净，流出去便混污秽，花反倒遭塌。' },
  { id: 4, speaker: '宝玉', content: '那依妹妹该如何安置？' },
  { id: 5, speaker: '黛玉', content: '畸角上我筑花冢，绢袋盛残瓣，覆土掩埋，随土化去方洁净。' },
  { id: 6, speaker: '宝玉', content: '我来刨土，妹妹莫沾尘土伤手。' },
  { id: 7, speaker: '黛玉', content: '不必劳烦，葬花本是我一人心事，旁人不解其中悲。' },
  { id: 8, speaker: '宝玉', content: '我怎会不解，方才隔林听你吟句，字字戳心。' },
  { id: 9, speaker: '黛玉', content: '花谢花飞花满天，红消香断有谁怜？' },
  { id: 10, speaker: '宝玉', content: '这一句，道尽世间薄命芳华。' },
  { id: 11, speaker: '黛玉', content: '游丝软系飘春榭，落絮轻沾扑绣帘。父母早逝，寄人篱下，便是这般无根飞絮。' },
  { id: 12, speaker: '宝玉', content: '老太太、外祖母、我，全都疼惜妹妹，何来无根一说？' },
  { id: 13, speaker: '黛玉', content: '疼惜是情面，终究不是自家骨肉，一言一行皆要步步谨慎。' },
  { id: 14, speaker: '宝玉', content: '若妹妹愿，怡红院、我的心意，尽可做你的归处。' },
  { id: 15, speaker: '黛玉', content: '哥哥这话昨日对宝姐姐也说过，转头便忘。' },
  { id: 16, speaker: '宝玉', content: '我若有半分虚言，日后任凭妹妹如何责罚！' },
  { id: 17, speaker: '黛玉', content: '世间誓言最易消磨，桃李明年能再发，明年闺中知有谁？' },
  { id: 18, speaker: '宝玉', content: '妹妹莫说这般丧气话，你我岁岁相伴。' },
  { id: 19, speaker: '黛玉', content: '一年三百六十日，风刀霜剑严相逼。府里人多口杂，处处皆是冷眼。' },
  { id: 20, speaker: '宝玉', content: '往后再有闲言碎语，我替妹妹一一辩驳。' },
  { id: 21, speaker: '黛玉', content: '哥哥自有一众知己，湘云、宝钗，哪里缺人相伴。' },
  { id: 22, speaker: '宝玉', content: '旁人只是玩伴，妹妹才是我唯一知己，二者云泥之别！' },
  { id: 23, speaker: '黛玉', content: '口舌伶俐，最会哄人宽心，转头便抛诸脑后。' },
  { id: 24, speaker: '宝玉', content: '我说句句真心，妹妹为何总不肯信我分毫？' },
  { id: 25, speaker: '黛玉', content: '自幼敏感多思，并非刻意刁难，只是难寻心安之处。' },
  { id: 26, speaker: '宝玉', content: '往后凡事坦诚相告，再不叫妹妹独自垂泪。' },
  { id: 27, speaker: '黛玉', content: '花开易见落难寻，阶前愁杀葬花人。' },
  { id: 28, speaker: '宝玉', content: '这般深埋，便无人再践踏半分。' },
  { id: 29, speaker: '黛玉', content: '侬今葬花人笑痴，他年葬侬知是谁？' },
  { id: 30, speaker: '宝玉', content: '妹妹切莫作此念想！' },
  { id: 31, speaker: '黛玉', content: '不过随口感怀，哥哥何必这般失态。' },
  { id: 32, speaker: '宝玉', content: '若真到那日，必是我亲手葬你，绝不叫旁人插手。' },
  { id: 33, speaker: '黛玉', content: '你我皆是尘世过客，聚散自有定数。' },
  { id: 34, speaker: '宝玉', content: '定数亦可改，只要你我心意相守，管什么天道轮回。' },
  { id: 35, speaker: '黛玉', content: '大观园此刻繁花似锦，终有一日满园萧瑟。' },
  { id: 36, speaker: '宝玉', content: '只要你我同在，园子便永远热闹鲜活。' },
  { id: 37, speaker: '黛玉', content: '前晚我去怡红院，晴雯闭门不纳，哥哥可曾知晓？' },
  { id: 38, speaker: '宝玉', content: '竟有此事？我全然不知，回头定责罚晴雯！' },
  { id: 39, speaker: '黛玉', content: '我原以为是哥哥授意，院内又传来你与宝钗说笑之声，一时心冷。' },
  { id: 40, speaker: '宝玉', content: '那日宝钗临时到访，我片刻便送她离去，绝无半分怠慢妹妹之意。' },
  { id: 41, speaker: '黛玉', content: '事已过去，多说无益。' },
  { id: 42, speaker: '宝玉', content: '芒种饯花神，别人皆是宴饮嬉游，唯有妹妹独自葬花。' },
  { id: 43, speaker: '黛玉', content: '世人惜花只爱盛放之时，无人怜惜凋零残瓣，唯有我懂落花孤苦。' },
  { id: 44, speaker: '宝玉', content: '世间唯有你，能与落花共情，旁人皆是俗眼。' },
  { id: 45, speaker: '黛玉', content: '天色黄昏，竹馆风寒，我该回去服药了。' },
  { id: 46, speaker: '宝玉', content: '物件沉重，我送妹妹回潇湘馆。' },
  { id: 47, speaker: '黛玉', content: '不必，我一人惯了，不必劳烦哥哥往返。' },
  { id: 48, speaker: '宝玉', content: '我顺路，正好陪妹妹走一程，免得路上孤寂。' },
  { id: 49, speaker: '黛玉', content: '这竹子竿竿带泪，恰似我半生心境。' },
  { id: 50, speaker: '宝玉', content: '竹性清高，正合妹妹风骨，旁人配不上这片竹林。' },
  { id: 51, speaker: '黛玉', content: '来年春日，此处应生出新花。' },
  { id: 52, speaker: '宝玉', content: '待到花开，我陪妹妹再来祭扫，同赋新诗。' },
  { id: 53, speaker: '黛玉', content: '只怕来年花开，人事早已变迁。' },
  { id: 54, speaker: '宝玉', content: '无论世事如何变，我定然守在大观园，等妹妹同来。' },
  { id: 55, speaker: '黛玉', content: '哥哥的承诺，听听便好，不可当真。' },
  { id: 56, speaker: '宝玉', content: '此生对黛玉之心，永不更改，若违此誓，天地共弃。' },
  { id: 57, speaker: '黛玉', content: '何苦立这般重誓，我信你便是。' },
  { id: 58, speaker: '宝玉', content: '妹妹终于肯信我了？' },
  { id: 59, speaker: '黛玉', content: '并非全然相信，只是不愿见你这般焦灼模样。' },
  { id: 60, speaker: '宝玉', content: '往后日日伴妹妹读书、赏景、葬花，事事皆依你心意。' },
  { id: 61, speaker: '黛玉', content: '繁华转瞬即逝，唯有文字、心事能够长存。' },
  { id: 62, speaker: '宝玉', content: '我记下今日葬花所有诗句，日日诵读，永不遗忘。' },
  { id: 63, speaker: '黛玉', content: '我再誊一遍《葬花吟》，赠予哥哥留存。' },
  { id: 64, speaker: '宝玉', content: '我立在此处等候，绝不惊扰你落笔。' },
  { id: 65, speaker: '黛玉', content: '一朝春尽红颜老，花落人亡两不知。' },
  { id: 66, speaker: '宝玉', content: '我不敢想那日光景。' },
  { id: 67, speaker: '黛玉', content: '此诗藏我半生愁思，哥哥阅后，不必时时挂怀伤神。' },
  { id: 68, speaker: '宝玉', content: '我日夜带在身上，片刻不离。' },
  { id: 69, speaker: '黛玉', content: '春日伤怀伤身，喝盏暖茶平复心绪。' },
  { id: 70, speaker: '宝玉', content: '每一字，皆刻在我心上。' },
  { id: 71, speaker: '黛玉', content: '方才埋花，倒觉心头愁绪疏解几分。' },
  { id: 72, speaker: '宝玉', content: '往后妹妹心中烦闷，只管唤我同去花冢散心。' },
  { id: 73, speaker: '黛玉', content: '平日哥哥多在怡红院玩乐，哪有空闲陪我葬花。' },
  { id: 74, speaker: '宝玉', content: '但凡妹妹相唤，无论何事，我即刻赶来，绝不拖延。' },
  { id: 75, speaker: '黛玉', content: '罢了，信你一回便是。' },
  { id: 76, speaker: '宝玉', content: '方才见妹妹落泪，我只觉世间万物皆无趣味。' },
  { id: 77, speaker: '黛玉', content: '男儿怎可轻易落泪，失了风骨。' },
  { id: 78, speaker: '宝玉', content: '旁人之事我毫不在意，唯有妹妹悲喜，牵动我心神。' },
  { id: 79, speaker: '黛玉', content: '你听竹声，如同落花低声悲叹。' },
  { id: 80, speaker: '宝玉', content: '明日我再折新竹，为妹妹编花囊，盛放来年落花。' },
  { id: 81, speaker: '黛玉', content: '不必费心，有旧绢袋便足够。' },
  { id: 82, speaker: '宝玉', content: '新竹洁净，配得上妹妹怜惜的落花。' },
  { id: 83, speaker: '黛玉', content: '夜深了，哥哥早些回怡红院歇息。' },
  { id: 84, speaker: '宝玉', content: '我再坐片刻，陪妹妹看一会儿月色。' },
  { id: 85, speaker: '黛玉', content: '竹馆阴冷，久留恐受寒，快些回去。' },
  { id: 86, speaker: '宝玉', content: '明日一早，我便来寻妹妹。' },
];

const speakerTone: Record<string, PlotSpeakerTone> = {
  黛玉: {
    avatar: '黛',
    role: '林黛玉',
    portrait: '/林黛玉.png',
    ring: 'border-rose-200 bg-rose-50 text-rose-900',
    glow: 'border-rose-200 bg-rose-50/90 text-rose-950 shadow-rose-900/10',
  },
  宝玉: {
    avatar: '宝',
    role: '贾宝玉',
    portrait: '/贾宝玉.png',
    ring: 'border-amber-200 bg-amber-50 text-amber-900',
    glow: 'border-amber-200 bg-amber-50/90 text-amber-950 shadow-amber-900/10',
  },
};

const JinlingLetterDialogue = forwardRef<JinlingLetterDialogueHandle, JinlingLetterDialogueProps>(
  ({ className = '', typewriterSpeed = 36, favorites = [], onComplete, title = '潇湘馆・黛玉葬花', ariaLabel = '潇湘馆黛玉葬花剧情对话系统', lines = jinlingLetterDialogueLines, tones = speakerTone, portraits = [{ speaker: '宝玉', align: 'left' }, { speaker: '黛玉', align: 'right' }], participationScene = 'jinling' }, ref) => {
    const [visible, setVisible] = useState(false);
    const [lineIndex, setLineIndex] = useState(0);
    const [typedLength, setTypedLength] = useState(0);
    const [ended, setEnded] = useState(false);
    const [portraitFailed, setPortraitFailed] = useState<Record<string, boolean>>({});
    const [participationOpen, setParticipationOpen] = useState(false);
    const [selectedFavoriteId, setSelectedFavoriteId] = useState<number | null>(null);
    const [participationLoading, setParticipationLoading] = useState(false);
    const [participationOptions, setParticipationOptions] = useState<api.JinlingParticipationOption[]>([]);
    const [participatingFavorite, setParticipatingFavorite] = useState<{ id: number; name: string } | null>(null);
    const [insertedLines, setInsertedLines] = useState<DialogueDisplayLine[]>([]);
    const [insertedLineIndex, setInsertedLineIndex] = useState(0);
    const completeCalledRef = useRef(false);
    const originalLine = lines[lineIndex];
    const insertedLine = insertedLines[insertedLineIndex] || null;
    const currentLine: DialogueDisplayLine = insertedLine || originalLine;
    const currentTone = tones[currentLine.speaker]
      ? tones[currentLine.speaker]
      : {
          avatar: Array.from(currentLine.speaker)[0] || '客',
          role: currentLine.speaker,
          ring: 'border-emerald-200 bg-emerald-50 text-emerald-900',
          glow: 'border-emerald-200 bg-emerald-50/90 text-emerald-950 shadow-emerald-900/10',
          portrait: '',
        };
    const shownContent = useMemo(
      () => currentLine.content.slice(0, typedLength),
      [currentLine.content, typedLength],
    );

    const callComplete = () => {
      if (completeCalledRef.current) return;
      completeCalledRef.current = true;
      onComplete?.();
    };

    const openAt = (startIndex = 0) => {
      completeCalledRef.current = false;
      setLineIndex(Math.min(Math.max(startIndex, 0), lines.length - 1));
      setTypedLength(0);
      setEnded(false);
      setPortraitFailed({});
      setParticipationOpen(false);
      setSelectedFavoriteId(null);
      setParticipationLoading(false);
      setParticipationOptions([]);
      setParticipatingFavorite(null);
      setInsertedLines([]);
      setInsertedLineIndex(0);
      setVisible(true);
    };

    const advance = () => {
      if (!visible) {
        openAt(0);
        return;
      }
      if (ended) return;
      if (typedLength < currentLine.content.length) {
        setTypedLength(currentLine.content.length);
        return;
      }
      if (insertedLines.length > 0) {
        if (insertedLineIndex < insertedLines.length - 1) {
          setInsertedLineIndex(current => current + 1);
          setTypedLength(0);
          return;
        }
        setInsertedLines([]);
        setInsertedLineIndex(0);
        setTypedLength(0);
        return;
      }
      if (lineIndex < lines.length - 1) {
        setLineIndex(current => current + 1);
        setTypedLength(0);
        return;
      }
      setEnded(true);
      callComplete();
    };

    const skip = () => {
      setLineIndex(lines.length - 1);
      setTypedLength(lines[lines.length - 1].content.length);
      setEnded(true);
      setInsertedLines([]);
      setInsertedLineIndex(0);
      setVisible(true);
      callComplete();
    };

    const openParticipation = () => {
      if (favorites.length === 0) {
        toast.error('请先在角色收藏夹中收藏一个角色');
        return;
      }
      setParticipationOpen(true);
      setSelectedFavoriteId(current => current || favorites[0]?.id || null);
      setParticipationOptions([]);
    };

    const buildParticipationContext = () => {
      const start = Math.max(0, lineIndex - 5);
      return lines.slice(start, lineIndex + 1).map(line => ({
        role: 'character' as const,
        characterName: tones[line.speaker]?.role || line.speaker,
        content: line.content,
      }));
    };

    const generateParticipationOptions = async () => {
      if (!selectedFavoriteId) {
        toast.error('请选择一个参与角色');
        return;
      }
      try {
        setParticipationLoading(true);
        const result = await api.generateJinlingParticipationOptions({
          favoriteCharacterId: selectedFavoriteId,
          scene: participationScene,
          context: buildParticipationContext(),
        });
        setParticipatingFavorite(result.character);
        setParticipationOptions(result.options);
      } catch (caught) {
        toast.error(caught instanceof Error ? caught.message : '生成参与发言失败');
      } finally {
        setParticipationLoading(false);
      }
    };

    const chooseParticipationOption = (option: api.JinlingParticipationOption) => {
      const favorite = participatingFavorite || favorites.find(item => item.id === selectedFavoriteId);
      if (!favorite) return;
      setInsertedLines([
        { speaker: favorite.name, content: option.playerLine, participant: true },
        ...option.replies.map(reply => ({
          speaker: Object.keys(tones).find(key => tones[key].role === reply.characterName) || reply.characterName,
          content: reply.content,
        })),
      ]);
      setInsertedLineIndex(0);
      setTypedLength(0);
      setParticipationOpen(false);
      setParticipationOptions([]);
    };

    const exitParticipation = () => {
      setParticipationOpen(false);
      setParticipationOptions([]);
      setParticipatingFavorite(null);
      setSelectedFavoriteId(null);
      setInsertedLines([]);
      setInsertedLineIndex(0);
      setTypedLength(0);
    };

    useImperativeHandle(ref, () => ({
      init: options => openAt(options?.startIndex),
      startPlot: () => openAt(0),
      nextLine: advance,
      skip,
      reset: () => openAt(0),
      close: () => setVisible(false),
    }));

    useEffect(() => {
      if (!visible || ended || typedLength >= currentLine.content.length) return;
      const timer = window.setTimeout(() => {
        setTypedLength(length => Math.min(length + 1, currentLine.content.length));
      }, typewriterSpeed);
      return () => window.clearTimeout(timer);
    }, [currentLine.content.length, ended, typedLength, typewriterSpeed, visible]);

    if (!visible) return null;

    const renderPortrait = (speaker: string, align: 'left' | 'right', extraClass = '') => {
      const tone = tones[speaker];
      const active = currentLine.speaker === speaker;
      return (
        <div
          className={`absolute bottom-56 top-28 z-10 flex min-w-0 items-end transition duration-300 sm:bottom-7 sm:top-24 ${
            align === 'left'
              ? 'left-0 w-[48%] justify-start sm:left-[4%] sm:w-[31%] sm:min-w-[330px] sm:max-w-[460px]'
              : 'right-0 w-[48%] justify-end sm:right-[4%] sm:w-[31%] sm:min-w-[330px] sm:max-w-[460px]'
          } ${extraClass} ${
            active || currentLine.participant
              ? 'opacity-100 saturate-100'
              : participationScene === 'sangu'
                ? 'opacity-55 saturate-75'
                : 'opacity-55 saturate-75'
          }`}
        >
          {!portraitFailed[speaker] && (
            <img
              src={tone.portrait}
              alt={tone.role}
              draggable={false}
              onError={() => setPortraitFailed(current => ({ ...current, [speaker]: true }))}
              className={`max-h-full max-w-full select-none object-contain drop-shadow-2xl ${
                align === 'left' ? 'origin-bottom-left' : 'origin-bottom-right'
              }`}
            />
          )}
          {portraitFailed[speaker] && (
            <div className={`flex h-full w-full flex-col items-center justify-center rounded-xl border shadow-2xl ${tone.glow}`}>
              <div className={`grid h-28 w-28 place-items-center rounded-full border bg-white/70 text-6xl font-semibold ${tone.ring}`}>
                {tone.avatar}
              </div>
              <p className="mt-5 text-2xl font-semibold">{tone.role}</p>
              <p className="mt-2 text-sm text-stone-500">数字人物形象位</p>
            </div>
          )}
        </div>
      );
    };

    return (
      <aside
        className={`pointer-events-auto absolute inset-x-2 bottom-3 top-4 z-30 mx-auto max-w-[1760px] ${participationScene === 'sangu' ? 'sangu-dialogue' : ''} ${className}`}
        aria-label={ariaLabel}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={advance}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              advance();
            }
          }}
          className="relative h-full min-h-[540px] overflow-hidden rounded-xl border border-stone-900/15 bg-[#f7efe0]/82 text-stone-900 shadow-2xl shadow-stone-950/35 outline-none backdrop-blur-md transition focus-visible:ring-2 focus-visible:ring-amber-200 sm:min-h-[700px] sm:rounded-2xl"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              backgroundImage: 'radial-gradient(circle at 18% 18%, rgba(77,88,54,.22), transparent 24%), radial-gradient(circle at 83% 20%, rgba(142,72,56,.15), transparent 25%), linear-gradient(90deg, rgba(120,82,45,.06) 1px, transparent 1px), linear-gradient(rgba(120,82,45,.05) 1px, transparent 1px)',
              backgroundSize: '100% 100%, 100% 100%, 30px 30px, 30px 30px',
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(20,18,15,.18)_100%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-stone-950/25 via-stone-900/5 to-transparent" />

          <div className="relative h-full">
            <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-stone-900/10 bg-[#fffaf0]/75 px-3 py-2 text-center shadow-sm backdrop-blur sm:top-5 sm:px-6">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-stone-500">Plot Dialogue</p>
              <h3 className="mt-0.5 whitespace-nowrap text-base font-semibold text-stone-950 sm:text-2xl">{title}</h3>
            </div>

            {portraits.map(portrait => <div key={portrait.speaker}>{renderPortrait(portrait.speaker, portrait.align, portrait.className)}</div>)}

            <div className="absolute left-1/2 top-28 z-10 h-40 w-40 -translate-x-1/2 rounded-full border border-emerald-900/10 bg-white/15 blur-[1px]" />
            <div className="absolute left-1/2 top-32 z-10 h-28 w-28 -translate-x-1/2 rounded-full border border-stone-900/10 bg-[#fffaf0]/30" />

            <section className="absolute inset-x-3 bottom-3 z-30 mx-auto max-w-[840px] rounded-xl border border-stone-900/15 bg-[#fffaf0]/94 p-3 shadow-2xl shadow-stone-950/30 backdrop-blur-md sm:inset-x-[25%] sm:bottom-8 sm:rounded-2xl sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border text-lg font-semibold sm:h-14 sm:w-14 sm:text-2xl ${currentTone.ring}`}>
                    {currentTone.avatar}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-stone-950 sm:text-2xl">{currentTone.role}</p>
                    <p className="text-xs text-stone-500">{ended ? '剧情结束' : '正在发言'}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-stone-200 bg-white/70 px-3 py-1 text-xs text-stone-500">
                  第{lineIndex + 1}/{lines.length}句
                </span>
              </div>

              <p className="min-h-[104px] whitespace-pre-wrap break-words rounded-xl border border-stone-900/10 bg-white/60 px-4 py-3 text-base leading-8 text-stone-800 shadow-inner sm:min-h-[144px] sm:px-7 sm:py-6 sm:text-2xl sm:leading-[2.05]">
                {shownContent}
                {!ended && typedLength < currentLine.content.length && <span className="ml-0.5 animate-pulse text-amber-800">|</span>}
              </p>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-stone-900/10 pt-4">
                <span className="text-sm font-semibold text-[#7f1d1d]">
                  {ended ? '剧情结束' : insertedLines.length > 0 ? '参与角色正在影响这段对话' : '点击界面任意位置继续'}
                </span>
                <div className="flex items-center gap-2">
                  {participatingFavorite && (
                    <button
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        exitParticipation();
                      }}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 transition hover:bg-white"
                    >
                      退出参与
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      openParticipation();
                    }}
                    disabled={ended || participationLoading}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    我要参与
                  </button>
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      skip();
                    }}
                    className="rounded-lg border border-stone-200 bg-white/70 px-4 py-2 text-sm text-stone-600 transition hover:bg-white hover:text-stone-900"
                  >
                    跳过
                  </button>
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      advance();
                    }}
                    className="rounded-lg bg-stone-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
                  >
                    {ended ? '剧情结束' : '继续'}
                  </button>
                  <button
                    type="button"
                    aria-label="关闭信件"
                    onClick={event => {
                      event.stopPropagation();
                      setVisible(false);
                    }}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-stone-200 bg-white/60 text-stone-500 transition hover:bg-white hover:text-stone-900"
                  >
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
              </div>

              {participationOpen && (
                <div
                  className="mt-4 rounded-xl border border-amber-100 bg-white/78 p-4 shadow-inner"
                  onClick={event => event.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-400">Join Dialogue</p>
                      <h4 className="mt-1 text-xl font-semibold text-stone-950">选择一个收藏角色参与</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setParticipationOpen(false)}
                      aria-label="收起参与面板"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-800"
                    >
                      <i className="fa-solid fa-chevron-down" />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {favorites.map(character => (
                      <button
                        key={character.id}
                        type="button"
                        onClick={() => {
                          setSelectedFavoriteId(character.id);
                          setParticipatingFavorite(null);
                          setParticipationOptions([]);
                        }}
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${
                          selectedFavoriteId === character.id
                            ? 'border-stone-900 bg-stone-900 text-white'
                            : 'border-stone-200 bg-white text-stone-600 hover:border-amber-300'
                        }`}
                      >
                        {character.name}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-sm text-stone-500">每次只能选择一个角色，AI 会生成两句可选发言。</p>
                    <button
                      type="button"
                      onClick={() => void generateParticipationOptions()}
                      disabled={!selectedFavoriteId || participationLoading}
                      className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300"
                    >
                      {participationLoading ? <><i className="fa-solid fa-spinner fa-spin mr-2" />生成中</> : '生成发言'}
                    </button>
                  </div>

                  {participationOptions.length > 0 && (
                    <div className="mt-4 grid gap-3">
                      {participationOptions.map((option, index) => (
                        <button
                          key={`${option.playerLine}-${index}`}
                          type="button"
                          onClick={() => chooseParticipationOption(option)}
                          className="rounded-xl border border-stone-200 bg-[#fffaf0] px-4 py-3 text-left text-stone-800 transition hover:border-amber-300 hover:bg-white"
                        >
                          <span className="mb-1 block text-xs font-medium text-amber-800">发言 {index + 1}</span>
                          <span className="block leading-7">{option.playerLine}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </aside>
    );
  },
);

JinlingLetterDialogue.displayName = 'JinlingLetterDialogue';

export default JinlingLetterDialogue;
