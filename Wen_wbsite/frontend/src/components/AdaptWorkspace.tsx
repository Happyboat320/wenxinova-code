import { useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AuthContext } from '@/contexts/authContext';
import * as api from '@/api';

interface Character {
  id: number;
  name: string;
  description: string | null;
}

interface Props {
  bookId: number;
  title: string;
  author: string;
  originalText: string;
  characters: Character[];
  initialMode?: WorkspaceMode;
}

type WorkspaceMode = 'style' | 'script';
type ScriptSection = 'props' | 'role' | 'dm';

const styles = [
  '浪漫言情', '恐怖悬疑', '武侠江湖', '侦探推理', '科幻幻想',
  '幽默诙谐', '讽刺批判', '奇幻冒险', '温馨治愈', '官场职场', '仙侠修真',
];

const scriptSectionCopy: Record<Exclude<ScriptSection, 'role'>, { title: string; prompt: string }> = {
  props: {
    title: '关键道具',
    prompt: '请将原文设计成剧本杀，整理关键道具清单。逐项说明道具外观、持有人、出现时机、公开信息、隐藏线索以及与真相的关系。',
  },
  dm: {
    title: 'DM 主持手册',
    prompt: '请将原文设计成可主持的剧本杀，并生成 DM 主持手册。包含背景导入、流程阶段、线索投放、关键时间点、控场提示、谜底与复盘话术。',
  },
};

export default function AdaptWorkspace({ bookId, title, author, originalText, characters, initialMode = 'style' }: Props) {
  const { user, openLogin } = useContext(AuthContext);
  const [mode, setMode] = useState<WorkspaceMode>(initialMode);
  const [style, setStyle] = useState(styles[0]);
  const [styleRequirement, setStyleRequirement] = useState('');
  const [scriptSection, setScriptSection] = useState<ScriptSection>('role');
  const [selectedCharacter, setSelectedCharacter] = useState(characters[0]?.name || '主角');
  const [generatedCharacters, setGeneratedCharacters] = useState<Character[]>([]);
  const [analyzingCharacters, setAnalyzingCharacters] = useState(false);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const roleOptions = generatedCharacters.length > 0 ? generatedCharacters : characters;

  useEffect(() => {
    if (roleOptions.length > 0 && !roleOptions.some(character => character.name === selectedCharacter)) {
      setSelectedCharacter(roleOptions[0].name);
    }
  }, [roleOptions, selectedCharacter]);

  const request = useMemo(() => {
    if (mode === 'style') {
      const extra = styleRequirement.trim() ? `\n补充要求：${styleRequirement.trim()}` : '';
      return { type: 'adapt' as const, prompt: `请将作品改编为“${style}”风格。保留核心人物关系与主要情节，使语言、节奏和氛围符合该类型。${extra}` };
    }
    if (scriptSection === 'role') {
      return { type: 'script' as const, prompt: selectedCharacter };
    }
    return { type: 'custom' as const, prompt: scriptSectionCopy[scriptSection].prompt };
  }, [mode, scriptSection, selectedCharacter, style, styleRequirement]);

  const generate = async () => {
    if (!user) {
      toast.error('请先登录后使用 AI 创作');
      openLogin();
      return;
    }
    if (!originalText.trim()) {
      toast.error('当前作品没有可用于改编的原文');
      return;
    }
    try {
      setLoading(true);
      setResult(await api.adaptBook(originalText, request.type, request.prompt));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '内容生成失败');
    } finally {
      setLoading(false);
    }
  };

  const analyzeCharacters = async () => {
    if (!user) {
      toast.error('请先登录后分析角色');
      openLogin();
      return;
    }
    try {
      setAnalyzingCharacters(true);
      const response = await api.adaptBook(
        originalText,
        'custom',
        '提取最适合剧本杀的 3-6 个主要角色。每行严格使用“角色名|不超过30字的身份、性格及人物关系简介”格式，不要编号，不要输出其他内容。',
      );
      const parsed = response.split('\n').map((line, index) => {
        const normalized = line.replace(/^[-*\d.、\s]+/, '').trim();
        const [name, ...description] = normalized.split(/[|｜]/);
        return { id: -(index + 100), name: name?.trim(), description: description.join('|').trim() || null };
      }).filter(character => character.name && character.name.length <= 20).slice(0, 6) as Character[];
      if (parsed.length === 0) throw new Error('未能识别角色，请稍后重试');
      setGeneratedCharacters(parsed);
      setSelectedCharacter(parsed[0].name);
      toast.success('角色方案已生成');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '角色分析失败');
    } finally {
      setAnalyzingCharacters(false);
    }
  };

  const save = async () => {
    if (!user) {
      openLogin();
      return;
    }
    if (!result.trim()) return;
    try {
      setSaving(true);
      await api.saveCreation({ bookId, prompt: `[${request.type}] ${request.prompt}`, content: result });
      toast.success('已保存到“我的创作”，并展示在社区');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const exportResult = () => {
    if (!result.trim()) return;
    const blob = new Blob([result], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${title}-${mode === 'style' ? style : scriptSectionCopy[scriptSection as Exclude<ScriptSection, 'role'>]?.title || selectedCharacter}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const panel = 'rounded-xl border border-amber-100 bg-white text-gray-800 shadow-lg';
  const outputTitle = mode === 'style'
    ? `${style}风格改编`
    : scriptSection === 'role' ? `${selectedCharacter} · 角色剧本` : scriptSectionCopy[scriptSection].title;

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-7 text-center">
        <h2 className="title-serif text-3xl">{title} - {mode === 'style' ? '风格化改编' : '剧本杀创作'}</h2>
        <p className="mt-1 text-gray-500">{mode === 'style' ? `作者：${author}` : '将经典名著改编为互动剧本杀体验'}</p>
        <div className="mt-5 inline-flex rounded-lg border border-amber-200 bg-white p-1">
          <button className={`rounded-md px-5 py-2 ${mode === 'style' ? 'bg-amber-700 text-white' : 'text-amber-800'}`} onClick={() => { setMode('style'); setResult(''); }}>风格化改编</button>
          <button className={`rounded-md px-5 py-2 ${mode === 'script' ? 'bg-amber-700 text-white' : 'text-amber-800'}`} onClick={() => { setMode('script'); setResult(''); }}>剧本杀创作</button>
        </div>
      </div>

      {mode === 'style' ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(260px,0.85fr)_minmax(380px,1.2fr)_minmax(220px,0.65fr)]">
          <OriginalPanel className={panel} text={originalText} />
          <OutputPanel className={panel} title={outputTitle} result={result} onChange={setResult} loading={loading} onGenerate={generate} />
          <section className={`${panel} p-6`}>
            <h3 className="mb-4 text-xl font-medium"><i className="fa-solid fa-palette mr-2 text-amber-700" />风格选项</h3>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {styles.map(item => <button key={item} onClick={() => setStyle(item)} className={`rounded-lg border px-4 py-2.5 text-left transition ${style === item ? 'border-amber-500 bg-amber-50 text-amber-800' : 'border-transparent hover:bg-amber-50'}`}>{item}</button>)}
            </div>
            <label className="mt-5 block text-sm text-gray-600">补充要求（可选）</label>
            <textarea value={styleRequirement} onChange={event => setStyleRequirement(event.target.value)} className="mt-2 w-full resize-none rounded-lg border border-amber-200 p-3 focus:outline-none focus:ring-2 focus:ring-amber-400" rows={4} placeholder="例如：使用第一人称，控制在 1500 字内" />
          </section>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(280px,0.75fr)_minmax(560px,1.75fr)]">
          <OriginalPanel className={panel} text={originalText} />
          <div>
            <div className="mb-6 grid grid-cols-3 border-b border-amber-200">
              {([['props', '道具'], ['role', '分角色剧本'], ['dm', 'DM(主持人)']] as const).map(([key, label]) => (
                <button key={key} onClick={() => { setScriptSection(key); setResult(''); }} className={`border-b-2 px-4 py-3 text-lg ${scriptSection === key ? 'border-amber-600 text-amber-800' : 'border-transparent text-gray-600'}`}>{label}</button>
              ))}
            </div>
            {scriptSection === 'role' && (
              <div className="mb-6">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <p className="text-sm text-gray-500">选择角色后生成其背景、秘密、目标、关系和行动时间线</p>
                  <button onClick={analyzeCharacters} disabled={analyzingCharacters} className="btn-secondary shrink-0 disabled:opacity-50"><i className="fa-solid fa-users-viewfinder mr-2" />{analyzingCharacters ? '分析中...' : roleOptions.length ? '重新分析角色' : 'AI 分析角色'}</button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {(roleOptions.length ? roleOptions : [{ id: -1, name: '主角', description: '点击“AI 分析角色”生成作品专属角色方案' }]).map(character => (
                  <button key={character.id} onClick={() => { setSelectedCharacter(character.name); setResult(''); }} className={`rounded-lg border bg-white p-5 text-left shadow transition hover:-translate-y-0.5 ${selectedCharacter === character.name ? 'border-amber-400 ring-1 ring-amber-300' : 'border-gray-200'}`}>
                    <strong className="block text-center text-lg font-medium">{character.name}</strong>
                    <span className="mt-2 block text-center text-sm text-gray-500">{character.description || '从原文人物关系中提取角色动机与秘密'}</span>
                  </button>
                ))}
                </div>
              </div>
            )}
            <OutputPanel className={panel} title={outputTitle} result={result} onChange={setResult} loading={loading} onGenerate={generate} />
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-center gap-4">
        <button onClick={save} disabled={!result.trim() || saving} className="btn-secondary min-w-40 disabled:cursor-not-allowed disabled:opacity-40"><i className="fa-solid fa-floppy-disk mr-2" />{saving ? '保存中...' : '保存并发布'}</button>
        <button onClick={exportResult} disabled={!result.trim()} className="btn-secondary min-w-40 disabled:cursor-not-allowed disabled:opacity-40"><i className="fa-solid fa-download mr-2" />导出</button>
      </div>
    </div>
  );
}

function OriginalPanel({ className, text }: { className: string; text: string }) {
  return <section className={`${className} p-6`}><h3 className="mb-4 text-xl font-medium"><i className="fa-solid fa-bookmark mr-2 text-amber-700" />原文</h3><div className="h-[620px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-amber-200 p-5 font-serif text-lg leading-8">{text || '暂无原文'}</div></section>;
}

function OutputPanel({ className, title, result, onChange, loading, onGenerate }: { className: string; title: string; result: string; onChange: (value: string) => void; loading: boolean; onGenerate: () => void }) {
  return <section className={`${className} p-6`}><div className="mb-4 flex items-center justify-between gap-4"><h3 className="text-xl font-medium"><i className="fa-solid fa-pen-to-square mr-2 text-amber-700" />{title}</h3><button onClick={onGenerate} disabled={loading} className="btn-secondary disabled:opacity-50"><i className="fa-solid fa-wand-magic-sparkles mr-2" />{loading ? '生成中...' : '生成内容'}</button></div><textarea value={result} onChange={event => onChange(event.target.value)} className="h-[620px] w-full resize-none rounded-lg border border-gray-200 p-5 leading-8 focus:outline-none focus:ring-2 focus:ring-amber-400" placeholder={loading ? 'AI 正在创作，请稍候…' : '生成的内容将显示在这里，生成后可以继续编辑…'} /></section>;
}
