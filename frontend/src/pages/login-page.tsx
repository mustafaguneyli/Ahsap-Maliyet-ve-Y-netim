import { FormEvent, useState } from 'react';
import { signInWithEmail } from '../lib/auth';
import './login-page.css';

export function LoginPage(props: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signInWithEmail(email, password);
      props.onSuccess();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Giriş yapılamadı. Bilgilerinizi kontrol edin.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={onSubmit}>
        <h1 className="login-title">Zirve Ahşap</h1>
        <p className="login-lead">Maliyet ve Fiyatlandırma Sistemi</p>
        <label className="login-field">
          <span>E-posta</span>
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="login-field">
          <span>Şifre</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? (
          <p className="login-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="login-submit" type="submit" disabled={busy}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş Yap'}
        </button>
      </form>
    </div>
  );
}
