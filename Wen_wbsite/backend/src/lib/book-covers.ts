export const DEFAULT_BOOK_COVER = '/library-covers/警世恒言通用.png';

const coverPath = (fileName: string) => `/library-covers/${fileName}`;

export const GENERAL_LIBRARY_COVERS = [
  coverPath('通用插图 (1).png'),
  coverPath('通用插图 (2).png'),
  coverPath('通用插图 (3).png'),
  coverPath('通用插图 (4).png'),
  coverPath('通用插图 (5).png'),
  coverPath('通用插图 (6).png'),
  coverPath('通用插图 (7).png'),
  coverPath('通用插图 (8).png'),
  coverPath('通用插图（9）.png'),
] as const;

export const EXACT_COVER_TITLE_ORDER = [
  '大宋中兴通俗演义',
  '隋唐演义',
  '大唐狄公案',
  '官场现形记',
  '金瓶梅',
  '玉娇梨',
  '桃花扇',
  '长生殿',
  '牡丹亭',
  '紫钗记',
  '邯郸记',
  '南柯记',
  '任氏传',
  '梅妃传',
  '李师师外传',
  '猿母哀子',
  '虞荡猎麈',
  '邛都老姥',
  '不可少',
  '廿一经',
  '席宗玉',
  '福禄寿三星度世',
  '福禄寿三星渡世',
] as const;

const TITLE_COVERS: Record<string, string> = {
  不可少: coverPath('不可少.png'),
  廿一经: coverPath('廿一经.png'),
  席宗玉: coverPath('席宗玉.png'),
  任氏传: coverPath('任氏传.png'),
  李师师外传: coverPath('《李师师外传》插图.png'),
  梅妃传: coverPath('《梅妃传》插图.png'),
  福禄寿三星度世: coverPath('《福禄寿三星渡世》插图.png'),
  福禄寿三星渡世: coverPath('《福禄寿三星渡世》插图.png'),
  猿母哀子: coverPath('神怪《猿母哀子》插图.png'),
  虞荡猎麈: coverPath('神怪《虞荡猎麈》插图.png'),
  邛都老姥: coverPath('神怪《邛都老姥》插图.png'),
  南柯记: coverPath('《南柯记》插图.png'),
  大唐狄公案: coverPath('《大唐狄公案》插图.png'),
  大宋中兴通俗演义: coverPath('《大宋中兴通俗演义》封面.png'),
  桃花扇: coverPath('《桃花扇》插图.png'),
  牡丹亭: coverPath('《牡丹亭》插图.png'),
  紫钗记: coverPath('《紫钗记》插图.png'),
  邯郸记: coverPath('《邯郸记》插图.png'),
  长生殿: coverPath('《长生殿》插图.png'),
  隋唐演义: coverPath('《隋唐演义》插图.png'),
  官场现形记: coverPath('世情《官场现形记》插图.png'),
  玉娇梨: coverPath('世情《玉娇梨》水彩插图设计.png'),
  金瓶梅: coverPath('世情《金瓶梅》插图.png'),
};

export function getTitleCover(title: string): string | null {
  return TITLE_COVERS[title] || null;
}

export function getGeneralLibraryCover(index: number): string {
  return GENERAL_LIBRARY_COVERS[Math.abs(index) % GENERAL_LIBRARY_COVERS.length];
}

const CHILD_STORY_COVER = coverPath('一般可用（有小孩子、上学、玩耍的小说可用）.png');
const SUPERNATURAL_COVER = coverPath('神怪小说通用.png');
const HUABEN_COVER = coverPath('警世恒言通用.png');
const HUABEN_ALT_COVER = coverPath('警世恒言通用 (2).png');

interface CoverSource {
  title: string;
  category?: string | null;
  theme?: string | null;
  description?: string | null;
  summary?: string | null;
  keywords?: string | null;
}

export function resolveBookCover(source: CoverSource): string {
  const exact = TITLE_COVERS[source.title];
  if (exact) return exact;

  const searchable = [
    source.title,
    source.category,
    source.theme,
    source.description,
    source.summary,
    source.keywords,
  ].filter(Boolean).join(' ');

  if (/(小孩|孩子|儿童|孩儿|幼童|上学|入学|玩耍|书院|学童|童子)/.test(searchable)) {
    return CHILD_STORY_COVER;
  }
  if (/(神怪|妖|仙|鬼|怪|狐|龙|蛇|精|异闻|灵异)/.test(searchable)) {
    return SUPERNATURAL_COVER;
  }
  if (source.category === '话本' || source.theme?.includes('清平山堂话本')) {
    return HUABEN_ALT_COVER;
  }
  if (source.category === '拟话本' || source.theme?.includes('警世通言')) {
    return HUABEN_COVER;
  }

  return DEFAULT_BOOK_COVER;
}
