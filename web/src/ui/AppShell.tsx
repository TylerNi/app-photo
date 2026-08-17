import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../session';
import { PushButton } from './PushButton';

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, profiles, logout } = useSession();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
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
            onClick={() => setMenu(true)}
          >
            {profile?.slice(0, 1).toUpperCase()}
          </button>
        </div>
      </header>
      <main className="shell-content">{children}</main>

      {menu && (
        <div className="sheet-backdrop" onClick={() => setMenu(false)}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                navigate('/reglages');
              }}
            >
              Réglages
            </button>
            <button type="button" onClick={() => void logout()}>
              Déconnexion
            </button>
            <button type="button" onClick={() => setMenu(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
