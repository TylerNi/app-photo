import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { apiGet, apiPost, setUnauthorizedHandler } from './api/client';
import type { Profile } from './api/types';

interface Me {
  authenticated: boolean;
  profile: Profile | null;
  profiles: Profile[];
}

interface Session extends Me {
  ready: boolean;
  other: Profile | null;
  login: (password: string) => Promise<void>;
  chooseProfile: (name: Profile) => Promise<void>;
}

const ANONYMOUS: Me = { authenticated: false, profile: null, profiles: [] };

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me>(ANONYMOUS);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    setMe(await apiGet<Me>('/api/auth/me'));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setMe(ANONYMOUS));
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => setMe(ANONYMOUS))
      .finally(() => setReady(true));
  }, [refresh]);

  const login = useCallback(
    async (password: string) => {
      await apiPost<void>('/api/auth/login', { password });
      await refresh();
    },
    [refresh],
  );

  const chooseProfile = useCallback(
    async (name: Profile) => {
      await apiPost<void>('/api/auth/profile', { profile: name });
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<Session>(
    () => ({
      ...me,
      ready,
      other: me.profiles.find((name) => name !== me.profile) ?? null,
      login,
      chooseProfile,
    }),
    [me, ready, login, chooseProfile],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession hors de SessionProvider');
  return value;
}
