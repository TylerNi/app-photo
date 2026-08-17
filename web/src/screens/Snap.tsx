import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { getToday, sendSnap } from '../api/snap';
import type { Media, TodayState } from '../api/types';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import './Snap.css';

function remaining(deadline: string): string {
  const ms = Math.max(0, new Date(deadline).getTime() - Date.now());
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return hours > 0 ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${minutes} min`;
}

function frameStyle(media: Media): CSSProperties | undefined {
  if (media.width === null || media.height === null) return undefined;
  return { aspectRatio: `${media.width} / ${media.height}` };
}

export function Snap() {
  const [state, setState] = useState<TodayState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const sending = useRef(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setState(await getToday());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Impossible de charger la journée.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible' && !sending.current) void load();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [load]);

  async function send(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    sending.current = true;
    setSendError(null);
    setProgress(0);
    try {
      setState(await sendSnap(file, setProgress));
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "L'envoi a échoué.");
    } finally {
      sending.current = false;
      setProgress(null);
    }
  }

  if (!state) {
    return loadError ? (
      <div className="snap-blank">
        <p className="snap-load-error">{loadError}</p>
        <Button variant="secondary" onClick={() => void load()}>
          Réessayer
        </Button>
      </div>
    ) : (
      <div className="snap-blank">
        <Spinner />
      </div>
    );
  }

  const { streak, me, other } = state;
  const busy = progress !== null;

  return (
    <div className="snap">
      <section className="snap-streak">
        <p className="snap-current">
          🔥 {streak.current}
          {streak.current > 0 && <span> {streak.current > 1 ? 'jours' : 'jour'}</span>}
        </p>
        {streak.current === 0 && <p className="snap-none">Aucun streak en cours</p>}
        <p className="snap-total">{streak.total} journées complètes au total</p>
        {streak.todayComplete && <p className="snap-done">Journée complète ✅</p>}
        {streak.atRisk && streak.deadline && (
          <p className="snap-risk">
            Il te reste {remaining(streak.deadline)} pour sauver le streak
          </p>
        )}
      </section>

      {other.revealed && other.media ? (
        <div className="snap-frame" style={frameStyle(other.media)}>
          {other.media.kind === 'video' ? (
            <video className="snap-media" src={other.media.originalUrl} controls playsInline />
          ) : (
            <img className="snap-media" src={other.media.originalUrl} alt="" />
          )}
        </div>
      ) : other.sent && other.teaserUrl ? (
        <div className="snap-frame">
          <img className="snap-teaser" src={other.teaserUrl} alt="" />
          <p className="snap-veil">Envoie ta photo pour voir celle de {other.profile} 👀</p>
        </div>
      ) : (
        <div className="snap-frame snap-frame-empty">
          <p>{other.profile} n'a pas encore envoyé sa photo</p>
        </div>
      )}

      <section className="snap-send">
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={send}
        />
        <input ref={galleryInput} type="file" accept="image/*,video/*" hidden onChange={send} />
        <Button disabled={busy} onClick={() => cameraInput.current?.click()}>
          {me.sent ? 'Remplacer ma photo' : 'Prendre une photo'}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => galleryInput.current?.click()}>
          Choisir une photo
        </Button>
        {busy && (
          <div className="snap-progress">
            <div className="snap-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}
        {sendError && <p className="snap-send-error">{sendError}</p>}
      </section>

      {me.sent && me.media && (
        <section className="snap-mine">
          <img className="snap-mine-thumb" src={me.media.thumbUrl} alt="" />
          <span>Envoyé ✅</span>
        </section>
      )}

      <Link className="snap-album" to="/album">
        Voir l'album
      </Link>
    </div>
  );
}
