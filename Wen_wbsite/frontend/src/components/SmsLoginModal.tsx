import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import * as api from '@/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (session: api.AuthSession) => void;
}

export default function SmsLoginModal({ open, onClose, onAuthenticated }: Props) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  if (!open) return null;
  const validPhone = /^1[3-9]\d{9}$/.test(phone);

  const sendCode = async () => {
    if (!validPhone) {
      toast.error('请输入正确的中国大陆手机号');
      return;
    }
    try {
      setSending(true);
      const result = await api.sendSmsCode(phone);
      setCountdown(result.retryAfter || 60);
      toast.success('验证码已发送');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '验证码发送失败');
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    if (!validPhone || !/^\d{4,8}$/.test(code)) {
      toast.error('请填写正确的手机号和验证码');
      return;
    }
    try {
      setVerifying(true);
      const session = await api.verifySmsCode(phone, code);
      onAuthenticated(session);
      setCode('');
      onClose();
      toast.success('登录成功');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : '验证码错误或已过期');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <div className="bg-white text-gray-800 rounded-xl p-8 shadow-2xl w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-medium">短信登录</h3>
            <p className="text-sm text-gray-500 mt-1">未注册手机号验证后将自动创建账号</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800" aria-label="关闭">
            <i className="fa-solid fa-times text-lg" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">手机号</label>
            <input type="tel" value={phone} onChange={event => setPhone(event.target.value.replace(/\D/g, ''))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="请输入 11 位手机号" maxLength={11} autoComplete="tel" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">验证码</label>
            <div className="flex gap-3">
              <input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))}
                className="min-w-0 flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="短信验证码" maxLength={8} inputMode="numeric" autoComplete="one-time-code" />
              <button onClick={sendCode} disabled={sending || countdown > 0}
                className="px-4 rounded-lg border border-amber-500 text-amber-700 disabled:opacity-50 whitespace-nowrap">
                {sending ? '发送中...' : countdown > 0 ? `${countdown} 秒` : '获取验证码'}
              </button>
            </div>
          </div>
          <button onClick={verify} disabled={verifying}
            className="w-full py-3 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50">
            {verifying ? '验证中...' : '登录 / 注册'}
          </button>
          <p className="text-center text-sm text-gray-500">登录即表示您同意用户协议和隐私政策</p>
        </div>
      </div>
    </div>
  );
}
