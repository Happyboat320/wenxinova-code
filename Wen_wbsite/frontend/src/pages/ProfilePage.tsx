import { type ChangeEvent, type FormEvent, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthContext } from '@/contexts/authContext';
import { useTheme } from '@/hooks/useTheme';
import * as api from '@/api';

async function compressAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  if (file.size > 10 * 1024 * 1024) throw new Error('原始图片不能超过 10MB');

  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('图片无法解析'));
    element.src = source;
  });

  const size = Math.min(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器不支持图片处理');
  context.fillStyle = '#f9f6f0';
  context.fillRect(0, 0, 256, 256);
  context.drawImage(
    image,
    (image.naturalWidth - size) / 2,
    (image.naturalHeight - size) / 2,
    size,
    size,
    0,
    0,
    256,
    256,
  );
  return canvas.toDataURL('image/jpeg', 0.86);
}

export default function ProfilePage() {
  const { isDark } = useTheme();
  const { user, isInitializing, openLogin, updateUser } = useContext(AuthContext);
  const [nickname, setNickname] = useState('');
  const [signature, setSignature] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [processingImage, setProcessingImage] = useState(false);

  useEffect(() => {
    if (!user) return;
    setNickname(user.nickname || '');
    setSignature(user.signature || '');
    setAvatar(user.avatar || null);
  }, [user]);

  const selectAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setProcessingImage(true);
      setAvatar(await compressAvatar(file));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '头像处理失败');
    } finally {
      setProcessingImage(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const cleanNickname = nickname.trim();
    if (Array.from(cleanNickname).length < 2 || Array.from(cleanNickname).length > 20) {
      toast.error('用户名需为 2-20 个字符');
      return;
    }
    try {
      setSaving(true);
      const updated = await api.updateProfile({ nickname: cleanNickname, signature: signature.trim(), avatar });
      updateUser(updated);
      toast.success('个人资料已保存');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '保存个人资料失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`min-h-screen p-8 ${isDark ? 'bg-gray-900 text-gray-100' : 'bg-[#F9F6F0] text-gray-800'}`}>
      <header className="mb-12 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <i className="fa-solid fa-book-open text-2xl text-amber-800" />
          <h1 className="title-serif text-2xl">文心新述</h1>
        </Link>
        <nav className="flex gap-6">
          <Link to="/" className="hover:text-amber-700">首页</Link>
          <Link to="/classical-library" className="hover:text-amber-700">古典文库</Link>
          <Link to="/ugc-community" className="hover:text-amber-700">UGC社区</Link>
          <Link to="/my-collection" className="hover:text-amber-700">我的创作</Link>
        </nav>
      </header>

      <main className="mx-auto max-w-2xl">
        <div className="mb-8 text-center">
          <h2 className="title-serif text-4xl">个人资料</h2>
          <p className="mt-3 opacity-65">设置你在平台和 UGC 社区中展示的身份</p>
        </div>

        {!isInitializing && !user ? (
          <div className="rounded-2xl bg-white p-10 text-center text-gray-800 shadow-lg">
            <h3 className="mb-3 text-2xl font-medium">请先登录</h3>
            <p className="mb-6 opacity-65">登录后可编辑昵称、签名和头像。</p>
            <button onClick={openLogin} className="btn-primary">账号登录</button>
          </div>
        ) : user ? (
          <form onSubmit={save} className={`rounded-2xl border border-amber-100 p-8 shadow-xl ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="mb-8 flex flex-col items-center">
              <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-amber-100 bg-amber-50 text-4xl font-semibold text-amber-800 shadow-md">
                {avatar ? <img src={avatar} alt="个人头像" className="h-full w-full object-cover" /> : (nickname.trim().charAt(0) || <i className="fa-solid fa-user" />)}
              </div>
              <div className="mt-5 flex gap-3">
                <label className="btn-secondary cursor-pointer">
                  <i className="fa-solid fa-camera mr-2" />{processingImage ? '处理中…' : '更换头像'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" disabled={processingImage} onChange={selectAvatar} className="hidden" />
                </label>
                {avatar && <button type="button" onClick={() => setAvatar(null)} className="rounded-lg px-4 py-2 text-sm text-red-600 hover:bg-red-50">移除头像</button>}
              </div>
              <p className="mt-2 text-xs opacity-50">图片会自动居中裁剪并压缩</p>
            </div>

            <label className="mb-6 block">
              <span className="mb-2 block font-medium">用户名（昵称）</span>
              <input value={nickname} maxLength={20} onChange={event => setNickname(event.target.value)} className="w-full rounded-xl border border-amber-200 bg-transparent px-4 py-3 outline-none focus:ring-2 focus:ring-amber-400" placeholder="请输入 2-20 个字符" />
            </label>
            <label className="mb-2 block">
              <span className="mb-2 block font-medium">个人签名</span>
              <textarea value={signature} maxLength={100} onChange={event => setSignature(event.target.value)} rows={4} className="w-full resize-none rounded-xl border border-amber-200 bg-transparent px-4 py-3 outline-none focus:ring-2 focus:ring-amber-400" placeholder="写下一句介绍自己的话……" />
              <span className="mt-1 block text-right text-xs opacity-50">{Array.from(signature).length}/100</span>
            </label>
            <button type="submit" disabled={saving || processingImage} className="btn-primary mt-5 w-full py-3 disabled:opacity-50">{saving ? '保存中…' : '保存个人资料'}</button>
          </form>
        ) : <div className="py-20 text-center">正在加载…</div>}
      </main>
    </div>
  );
}
