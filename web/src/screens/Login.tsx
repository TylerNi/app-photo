import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../api/client';
import { useSession } from '../session';
import { Button } from '../ui/Button';

export function Login() {
  const { login } = useSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inattendue.');
      setBusy(false);
    }
  }

  return (
    <div className="fullscreen">
      <form className="login" onSubmit={submit}>
        <input
          className="login-input"
          type="password"
          autoComplete="current-password"
          placeholder="Mot de passe"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <p className="login-error">{error}</p>}
        <Button type="submit" disabled={busy}>
          Entrer
        </Button>
      </form>
    </div>
  );
}
