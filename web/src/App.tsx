import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Album } from './screens/Album';
import { Login } from './screens/Login';
import { ProfilePick } from './screens/ProfilePick';
import { Settings } from './screens/Settings';
import { Snap } from './screens/Snap';
import { useSession } from './session';
import { AppShell } from './ui/AppShell';
import { Spinner } from './ui/Spinner';

export function App() {
  const { ready, authenticated, profile } = useSession();

  if (!ready) {
    return (
      <div className="fullscreen">
        <Spinner />
      </div>
    );
  }

  if (!authenticated) return <Login />;

  return (
    <BrowserRouter>
      {!profile ? (
        <ProfilePick />
      ) : (
        <AppShell>
          <Routes>
            <Route path="/" element={<Snap />} />
            <Route path="/album" element={<Album />} />
            <Route path="/profil" element={<ProfilePick />} />
            <Route path="/reglages" element={<Settings />} />
          </Routes>
        </AppShell>
      )}
    </BrowserRouter>
  );
}
