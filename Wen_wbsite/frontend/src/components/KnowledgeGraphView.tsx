import { useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AuthContext } from '@/contexts/authContext';
import * as api from '@/api';

export default function KnowledgeGraphView({ bookId }: { bookId: number }) {
  const { user, openLogin } = useContext(AuthContext);
  const [graph, setGraph] = useState<api.KnowledgeGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState<'timeline' | 'relationships'>('timeline');
  const [joiningName, setJoiningName] = useState<string | null>(null);
  const [joinedNames, setJoinedNames] = useState<Set<string>>(() => new Set());
  const [pendingJoin, setPendingJoin] = useState<api.KnowledgeGraph['relationships']['nodes'][number] | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.getKnowledgeGraph(bookId)
      .then(value => { if (active) setGraph(value); })
      .catch(caught => { if (active) toast.error(caught instanceof Error ? caught.message : '知识图谱加载失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bookId]);

  const generate = async (force = false) => {
    if (!user) {
      toast.error('首次生成知识图谱需要登录');
      openLogin();
      return;
    }
    try {
      setGenerating(true);
      setGraph(force ? await api.regenerateKnowledgeGraph(bookId) : await api.generateKnowledgeGraph(bookId));
      toast.success(force ? '知识图谱已重新生成' : '知识图谱已生成并缓存');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '知识图谱生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const joinCoPlay = async (node: api.KnowledgeGraph['relationships']['nodes'][number]) => {
    if (!user) {
      setPendingJoin(node);
      toast.error('登录后即可将该人物加入数字共演');
      openLogin();
      return;
    }
    if (joiningName) return;
    try {
      setJoiningName(node.name);
      await api.addFavoriteCharacter({
        bookId,
        name: node.name,
        description: node.description || null,
        deeds: null,
        sourceType: 'ai',
      });
      setJoinedNames(current => new Set(current).add(node.name));
      toast.success('已加入数字共演');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '加入数字共演失败');
    } finally {
      setJoiningName(null);
    }
  };

  useEffect(() => {
    if (!user || !pendingJoin || joiningName) return;
    const node = pendingJoin;
    setPendingJoin(null);
    void joinCoPlay(node);
  }, [user, pendingJoin]);

  if (loading) return <div className="rounded-xl bg-white py-24 text-center shadow">正在加载知识图谱…</div>;
  if (!graph) return (
    <section className="rounded-xl border border-amber-100 bg-white px-6 py-24 text-center shadow-lg">
      <i className="fa-solid fa-diagram-project mb-5 text-5xl text-amber-700" />
      <h2 className="title-serif text-2xl">尚未生成知识图谱</h2>
      <p className="mx-auto mt-3 max-w-xl text-stone-500">AI 将从原文提取关键事件、人物和关系，并将结果缓存供后续访问复用。</p>
      <button onClick={() => void generate()} disabled={generating} className="btn-primary mt-7 disabled:opacity-50">{generating ? '分析原文中…' : '生成知识图谱'}</button>
    </section>
  );

  return (
    <section className="rounded-xl border border-amber-100 bg-white p-5 shadow-lg sm:p-8">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="title-serif text-2xl text-amber-900">作品知识图谱</h2>
          <p className="mt-1 text-xs text-stone-400">生成于 {new Date(graph.generatedAt).toLocaleString('zh-CN')}</p>
        </div>
        <div className="flex gap-2">
          {user?.role === 'admin' && <button onClick={() => void generate(true)} disabled={generating} className="btn-secondary disabled:opacity-50">{generating ? '重新分析中…' : '重新生成'}</button>}
          <div className="inline-flex rounded-lg border border-amber-200 p-1">
            <button onClick={() => setTab('timeline')} className={`rounded-md px-4 py-2 ${tab === 'timeline' ? 'bg-amber-700 text-white' : 'text-amber-800'}`}>时间线</button>
            <button onClick={() => setTab('relationships')} className={`rounded-md px-4 py-2 ${tab === 'relationships' ? 'bg-amber-700 text-white' : 'text-amber-800'}`}>人物关系</button>
          </div>
        </div>
      </div>
      {tab === 'timeline' ? <Timeline events={graph.timeline} /> : <RelationshipGraph data={graph.relationships} joiningName={joiningName} joinedNames={joinedNames} onJoin={joinCoPlay} />}
    </section>
  );
}

function Timeline({ events }: { events: api.KnowledgeGraph['timeline'] }) {
  return <ol className="relative ml-3 border-l-2 border-amber-200 pl-8">
    {events.map(event => <li key={event.id} className="relative mb-8 last:mb-0">
      <span className="absolute -left-[42px] top-1 flex h-6 w-6 items-center justify-center rounded-full border-4 border-white bg-amber-700" />
      <time className="text-sm font-medium text-amber-700">{event.time}</time>
      <h3 className="mt-1 text-xl font-semibold text-stone-800">{event.title}</h3>
      <p className="mt-2 leading-7 text-stone-600">{event.description}</p>
      {event.characters.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{event.characters.map(name => <span key={name} className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-800">{name}</span>)}</div>}
    </li>)}
  </ol>;
}

function RelationshipGraph({ data, joiningName, joinedNames, onJoin }: {
  data: api.KnowledgeGraph['relationships'];
  joiningName: string | null;
  joinedNames: Set<string>;
  onJoin: (node: api.KnowledgeGraph['relationships']['nodes'][number]) => void;
}) {
  const width = 900;
  const height = 560;
  // 使用确定性的环形布局，避免引入重量较大的图可视化依赖。
  const positions = useMemo(() => new Map(data.nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index / Math.max(data.nodes.length, 1)) - Math.PI / 2;
    const radius = Math.min(210, 75 + data.nodes.length * 13);
    return [node.id, { x: width / 2 + Math.cos(angle) * radius, y: height / 2 + Math.sin(angle) * radius }];
  })), [data.nodes]);
  return <div>
    {/* 图形在手机端会因缩小而难以辨认，因此窄屏直接使用下方的语义化关系列表。 */}
    <div className="hidden rounded-xl border border-amber-100 bg-[#fffdf8] sm:block">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="人物关系图">
        <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#a16207" /></marker></defs>
        {data.edges.map((edge, index) => {
          const source = positions.get(edge.source); const target = positions.get(edge.target);
          if (!source || !target) return null;
          const mx = (source.x + target.x) / 2; const my = (source.y + target.y) / 2;
          return <g key={`${edge.source}-${edge.target}-${index}`}>
            <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="#d6b46c" strokeWidth="2" markerEnd="url(#arrow)" />
            <rect x={mx - 38} y={my - 13} width="76" height="24" rx="12" fill="#fff7df" />
            <text x={mx} y={my + 4} textAnchor="middle" fontSize="12" fill="#854d0e">{edge.relation.slice(0, 8)}</text>
          </g>;
        })}
        {data.nodes.map((node, index) => {
          const point = positions.get(node.id)!;
          const buttonAbove = point.y > height / 2;
          return <g key={node.id} className="kg-person-node" tabIndex={0} aria-label={`${node.name}，可加入数字共演`}>
            <circle className="kg-person-orbit" style={{ animationDuration: `${24 + (index % 5) * 4}s` }} cx={point.x} cy={point.y} r="53" fill="none" stroke="#d6b46c" strokeWidth="1.2" strokeDasharray={index % 2 ? '3 10 14 7' : '12 7 3 11'} data-direction={index % 2 ? 'reverse' : 'normal'} />
            <circle className="kg-person-circle" cx={point.x} cy={point.y} r="48" fill="#fffbeb" stroke="#b45309" strokeWidth="2" />
            <text x={point.x} y={point.y + 5} textAnchor="middle" fontSize="17" fontWeight="600" fill="#78350f">{node.name.slice(0, 7)}</text>
            <foreignObject x={point.x - 53} y={buttonAbove ? point.y - 77 : point.y + 49} width="106" height="28" className="kg-person-action-wrap">
              <button
                type="button"
                className="kg-person-action"
                disabled={joiningName !== null || joinedNames.has(node.name)}
                onClick={() => onJoin(node)}
                aria-label={`将${node.name}加入数字共演`}
              >
                <i className={`fa-solid ${joiningName === node.name ? 'fa-spinner fa-spin' : joinedNames.has(node.name) ? 'fa-check' : 'fa-plus'}`} aria-hidden="true" />
                {joiningName === node.name ? '加入中' : joinedNames.has(node.name) ? '已加入数字共演' : '加入数字共演'}
              </button>
            </foreignObject>
          </g>;
        })}
      </svg>
    </div>
    <div className="mt-6 grid gap-3 sm:grid-cols-2">{data.edges.map((edge, index) => {
      const source = data.nodes.find(node => node.id === edge.source)?.name;
      const target = data.nodes.find(node => node.id === edge.target)?.name;
      return <div key={index} className="rounded-lg bg-amber-50 p-4"><strong>{source} → {target}：{edge.relation}</strong>{edge.description && <p className="mt-1 text-sm leading-6 text-stone-600">{edge.description}</p>}</div>;
    })}</div>
  </div>;
}
