import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import * as api from '@/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (session: api.AuthSession) => void;
}

type Mode = 'login' | 'register';

export default function AuthModal({ open, onClose, onAuthenticated }: Props) {
  const [mode, setMode] = useState<Mode>('login');
  const [phone, setPhone] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setPassword('');
      setConfirmation('');
      setCode('');
      setNickname('');
      setCountdown(0);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  if (!open) return null;

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setPassword('');
    setConfirmation('');
    setCode('');
    setNickname('');
  };

  const sendCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast.error('请输入正确的中国大陆手机号');
      return;
    }
    try {
      setSending(true);
      const result = await api.sendRegistrationCode(phone);
      setCountdown(result.retryAfter || 60);
      toast.success('验证码已发送');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '验证码发送失败');
    } finally {
      setSending(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast.error('请输入正确的中国大陆手机号');
      return;
    }
    if (password.length < 8) {
      toast.error('密码至少需要 8 位');
      return;
    }
    if (mode === 'register' && password !== confirmation) {
      toast.error('两次输入的密码不一致');
      return;
    }
    if (mode === 'register' && (Array.from(nickname.trim()).length < 2 || Array.from(nickname.trim()).length > 20)) {
      toast.error('用户名需为 2-20 个字符');
      return;
    }
    if (mode === 'register' && !/^\d{4,8}$/.test(code)) {
      toast.error('请输入正确的短信验证码');
      return;
    }

    try {
      setSubmitting(true);
      const session = mode === 'login'
        ? await api.login(phone, password)
        : await api.register(phone, password, code, nickname.trim());
      onAuthenticated(session);
      onClose();
      toast.success(mode === 'login' ? '登录成功' : '注册成功');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : mode === 'login' ? '登录失败' : '注册失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div className="max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[#fffdf9] text-stone-800 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between px-5 pt-6 sm:px-8 sm:pt-7">
          <div>
            <h3 id="auth-title" className="font-serif text-2xl font-semibold text-amber-900">欢迎来到文心新述</h3>
            <p className="mt-1 text-sm text-stone-500">登录只需手机号和密码，注册时请设置账号昵称</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="关闭">
            <i className="fa-solid fa-times" />
          </button>
        </div>

        <div className="mx-5 mt-6 grid grid-cols-2 rounded-lg bg-amber-50 p-1 sm:mx-8">
          {(['login', 'register'] as const).map(item => (
            <button key={item} type="button" onClick={() => switchMode(item)}
              className={`rounded-md py-2 text-sm font-medium transition ${mode === item ? 'bg-white text-amber-800 shadow-sm' : 'text-stone-500 hover:text-amber-800'}`}>
              {item === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4 px-5 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-6">
          {mode === 'register' && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">用户名</span>
              <input value={nickname} onChange={event => setNickname(event.target.value)}
                className="w-full rounded-lg border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                placeholder="请输入 2-20 个字符，作为账号昵称" maxLength={20} autoComplete="nickname" autoFocus />
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">手机号</span>
            <input type="tel" value={phone} onChange={event => setPhone(event.target.value.replace(/\D/g, ''))}
              className="w-full rounded-lg border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              placeholder="请输入 11 位手机号" maxLength={11} autoComplete="tel" autoFocus={mode === 'login'} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">密码</span>
            <input type="password" value={password} onChange={event => setPassword(event.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
              placeholder={mode === 'register' ? '请设置至少 8 位密码' : '请输入密码'} maxLength={72}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
          {mode === 'register' && (
            <>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">确认密码</span>
                <input type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)}
                  className="w-full rounded-lg border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                  placeholder="请再次输入密码" maxLength={72} autoComplete="new-password" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">短信验证码</span>
                <span className="flex gap-3">
                  <input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))}
                    className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-4 py-3 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                    placeholder="请输入验证码" maxLength={8} inputMode="numeric" autoComplete="one-time-code" />
                  <button type="button" onClick={sendCode} disabled={sending || countdown > 0}
                    className="rounded-lg border border-amber-300 px-4 text-sm text-amber-800 transition hover:bg-amber-50 disabled:opacity-50">
                    {sending ? '发送中…' : countdown > 0 ? `${countdown} 秒` : '获取验证码'}
                  </button>
                </span>
              </label>
            </>
          )}
          <button type="submit" disabled={submitting}
            className="w-full rounded-lg bg-amber-700 py-3 font-medium text-white shadow-sm transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? '提交中…' : mode === 'login' ? '登录' : '创建账号'}
          </button>
          <p className="text-center text-xs text-stone-400">继续即表示您同意用户协议和隐私政策</p>
        </form>
      </div>
    </div>
  );
}
