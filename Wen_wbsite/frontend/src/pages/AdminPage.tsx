import { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthContext } from '@/contexts/authContext';
import MarkdownContent from '@/components/MarkdownContent';
import * as api from '@/api';

export default function AdminPage() {
  const { user, isInitializing } = useContext(AuthContext);
  const [data, setData] = useState<api.AdminDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  const load = async () => {
    if (user?.role !== 'admin') return;
    try {
      setLoading(true);
      setData(await api.getAdminDashboard());
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '审核台加载失败');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, [user?.role]);

  const review = async (kind: 'creation' | 'application', id: number, decision: 'approve' | 'reject') => {
    const reviewNote = decision === 'reject'
      ? (window.prompt('请填写驳回原因（作者/申请人可见）') || '').trim()
      : (window.prompt('审核备注（可选）') || '').trim();
    if (decision === 'reject' && !reviewNote) return;
    try {
      setProcessing(`${kind}-${id}`);
      if (kind === 'creation') await api.reviewCreation(id, decision, reviewNote);
      else await api.reviewAdminApplication(id, decision, reviewNote);
      toast.success(decision === 'approve' ? '审核已通过' : '已驳回');
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '审核失败');
    } finally {
      setProcessing(null);
    }
  };

  if (!isInitializing && user?.role !== 'admin') return <div className="min-h-screen bg-[#f9f6f0] py-32 text-center"><h1 className="title-serif text-3xl">无权访问管理审核台</h1><Link to="/" className="btn-primary mt-7 inline-block">返回首页</Link></div>;

  return <div className="min-h-screen bg-[#f9f6f0] px-6 py-8 text-stone-800">
    <header className="mx-auto mb-10 flex max-w-6xl items-center justify-between"><Link to="/" className="title-serif text-2xl text-amber-900"><i className="fa-solid fa-book-open mr-2" />文心新述</Link><nav className="flex gap-5"><Link to="/ugc-community">UGC 社区</Link><Link to="/profile">个人资料</Link></nav></header>
    <main className="mx-auto max-w-6xl">
      <div className="mb-9"><h1 className="title-serif text-4xl">管理审核台</h1><p className="mt-2 text-stone-500">审核社区作品和管理员权限申请</p></div>
      {loading && !data ? <div className="py-20 text-center">加载中…</div> : <>
        <section className="mb-12"><h2 className="mb-5 text-2xl font-semibold">待审核作品 <span className="text-base font-normal text-stone-400">{data?.creations.length || 0}</span></h2>
          {!data?.creations.length ? <Empty text="暂无待审核作品" /> : <div className="space-y-5">{data.creations.map(item => <article key={item.id} className="rounded-2xl border border-amber-100 bg-white p-6 shadow">
            <div className="mb-4 flex flex-wrap justify-between gap-3"><div><strong className="text-lg">{item.book?.title || '自由创作'}</strong><p className="mt-1 text-sm text-stone-500">作者：{item.user.nickname || '未设置昵称'}（{item.user.phone}） · {item.category}</p></div><time className="text-xs text-stone-400">提交于 {new Date(item.submittedAt || item.updatedAt).toLocaleString('zh-CN')}</time></div>
            <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{item.prompt}</p><div className="max-h-80 overflow-y-auto rounded-lg border border-stone-100 p-4"><MarkdownContent content={item.content} /></div>
            <ReviewButtons busy={processing === `creation-${item.id}`} onApprove={() => void review('creation', item.id, 'approve')} onReject={() => void review('creation', item.id, 'reject')} />
          </article>)}</div>}
        </section>
        <section><h2 className="mb-5 text-2xl font-semibold">管理员申请 <span className="text-base font-normal text-stone-400">{data?.applications.length || 0}</span></h2>
          {!data?.applications.length ? <Empty text="暂无管理员申请" /> : <div className="grid gap-5 md:grid-cols-2">{data.applications.map(item => <article key={item.id} className="rounded-2xl border border-amber-100 bg-white p-6 shadow"><h3 className="text-xl font-semibold">{item.user.nickname || '未设置昵称'}</h3><p className="mt-1 text-sm text-stone-500">{item.user.phone} · 申请于 {new Date(item.createdAt).toLocaleString('zh-CN')}</p><p className="mt-5 min-h-24 whitespace-pre-wrap rounded-lg bg-stone-50 p-4 leading-7">{item.remark}</p><ReviewButtons busy={processing === `application-${item.id}`} onApprove={() => void review('application', item.id, 'approve')} onReject={() => void review('application', item.id, 'reject')} /></article>)}</div>}
        </section>
      </>}
    </main>
  </div>;
}

function ReviewButtons({ busy, onApprove, onReject }: { busy: boolean; onApprove: () => void; onReject: () => void }) {
  return <div className="mt-5 flex justify-end gap-3"><button disabled={busy} onClick={onReject} className="rounded-lg border border-red-200 px-5 py-2 text-red-700 hover:bg-red-50 disabled:opacity-50">驳回</button><button disabled={busy} onClick={onApprove} className="btn-primary disabled:opacity-50">{busy ? '处理中…' : '通过'}</button></div>;
}
function Empty({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-amber-200 bg-white py-12 text-center text-stone-400">{text}</div>; }
