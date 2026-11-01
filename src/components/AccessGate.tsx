import { useState, type FormEvent } from 'react';
import { AlertCircle, ArrowRight, KeyRound, LoaderCircle } from 'lucide-react';
import { gateEnabled, unlock, verifyPassword } from '../lib/accessGate';
import { BrandMark } from './BrandMark';

export function AccessGate() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password.trim()) {
      setError('请输入密码');
      return;
    }
    setChecking(true);
    setError('');
    const ok = await verifyPassword(password);
    setChecking(false);
    if (!ok) {
      setError('密码不对，再试一次');
      setPassword('');
      return;
    }
    unlock();
    window.location.reload();
  };

  return (
    <div className="access-gate">
      <form className="access-card" onSubmit={submit}>
        <span className="access-mark" aria-hidden="true">
          <BrandMark size={46} />
        </span>
        <span className="eyebrow">ATOMIC COURSEWARE</span>
        <h1>AtomPDF</h1>
        <p className="access-lead">
          {gateEnabled ? '这是一个私人课件库，请输入密码继续。' : '访问门尚未设置密码。'}
        </p>
        <label className="access-field">
          <span>访问密码</span>
          <span className="access-input">
            <KeyRound size={15} />
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError('');
              }}
              placeholder="••••••••"
              autoFocus
              disabled={!gateEnabled}
            />
          </span>
        </label>
        {error && (
          <p className="access-error">
            <AlertCircle size={14} />
            {error}
          </p>
        )}
        <button className="access-submit" type="submit" disabled={checking || !gateEnabled}>
          {checking ? <LoaderCircle size={15} className="spin" /> : null}
          进入书架
          {!checking && <ArrowRight size={15} />}
        </button>
        <p className="access-note">资料只保存在这台设备的浏览器里</p>
      </form>
    </div>
  );
}
