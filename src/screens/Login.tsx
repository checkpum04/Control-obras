import { useState } from 'react';
import { supabase } from '../data/cloud';
import { Icon } from '../components/ui';

/** Entrada con correo y contraseña. La primera vez se crea la cuenta desde aquí. */
export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    if (password.length < 6) return setMsg({ type: 'error', text: 'La contraseña debe tener al menos 6 caracteres.' });
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: location.href.split('#')[0] } });
        if (error) throw error;
        if (!data.session) setMsg({ type: 'info', text: 'Te hemos enviado un correo. Pulsa el enlace para confirmar la cuenta y después entra aquí.' });
      }
    } catch (err) {
      const m = (err as Error).message || '';
      setMsg({
        type: 'error',
        text: /Invalid login/i.test(m) ? 'Correo o contraseña incorrectos.'
          : /not confirmed/i.test(m) ? 'Falta confirmar la cuenta: revisa tu correo.'
            : /already registered/i.test(m) ? 'Ya existe una cuenta con ese correo. Entra con tu contraseña.'
              : /fetch|network/i.test(m) ? 'No hay conexión. La primera vez necesitas internet para entrar.'
                : m,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-brand">
        <span className="login-logo"><Icon name="home" size={30} stroke={2.2} /></span>
        <p className="eyebrow">Control de obras</p>
        <h1>{mode === 'login' ? 'Entrar' : 'Crear cuenta'}</h1>
        <p className="muted">Tus partes se guardan en el móvil y se copian a la nube con esta cuenta.</p>
      </div>
      <form className="form" onSubmit={submit}>
        <label className="field"><span>Correo</span>
          <input id="login-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field"><span>Contraseña</span>
          <input id="login-password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {msg && <p className={msg.type === 'error' ? 'error' : 'notice'} role="alert">{msg.text}</p>}
        <button className="btn btn-primary btn-block" disabled={busy} type="submit">{busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
        <button type="button" className="link center-link" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg(null); }}>
          {mode === 'login' ? 'Es mi primera vez: crear cuenta' : 'Ya tengo cuenta: entrar'}
        </button>
      </form>
    </div>
  );
}
