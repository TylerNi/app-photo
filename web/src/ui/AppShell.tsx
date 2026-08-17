import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../session';
import { PushButton } from './PushButton';

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, profiles } = useSession();
  const navigate = useNavigate();
  const index = profile ? profiles.indexOf(profile) : -1;

  return (
    <div className="shell">
      <header className="shell-header">
        <span className="shell-title">Album</span>
        <div className="shell-actions">
          <PushButton />
          <button
            className={`avatar profile-${index}`}
            type="button"
            onClick={() => navigate('/profil')}
          >
            {profile?.slice(0, 1).toUpperCase()}
          </button>
        </div>
      </header>
      <main className="shell-content">{children}</main>
    </div>
  );
}
