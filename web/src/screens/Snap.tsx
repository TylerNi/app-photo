import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, MouseEvent, TouchEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { getToday, sendSnap } from '../api/snap';
import type { Media, TodayState } from '../api/types';
import { useSession } from '../session';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';
import './Snap.css';

const SWIPE = 50;
const SLIDE = 220;

function seenKey(profile: string): string {
  return `snap-seen-${profile}`;
}

function loadSeen(profile: string): string[] {
  return localStorage.getItem(seenKey(profile))?.split(',') ?? [];
}

function onVideo(event: MouseEvent): boolean {
  return (event.target as HTMLElement).closest('video') !== null;
}

function remaining(deadline: string): string {
  const ms = Math.max(0, new Date(deadline).getTime() - Date.now());
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return hours > 0 ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${minutes} min`;
}

export function Snap() {
  const { profile } = useSession();
  const [state, setState] = useState<TodayState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [seen, setSeen] = useState<string[]>(() => loadSeen(profile!));
  const [reveal, setReveal] = useState<{ items: Media[]; index: number } | null>(null);
  const [drag, setDrag] = useState(0);
  const [held, setHeld] = useState(false);
  const [closing, setClosing] = useState(false);
  const sending = useRef(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

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

  function openReveal(items: Media[]) {
    if (items.length > 0) setReveal({ items, index: 0 });
  }

  function onTouchStart(event: TouchEvent) {
    swiped.current = false;
    if ((event.target as HTMLElement).closest('video')) {
      start.current = null;
      return;
    }
    const touch = event.touches[0];
    start.current = { x: touch.clientX, y: touch.clientY };
    setHeld(true);
  }

  function onTouchMove(event: TouchEvent) {
    const origin = start.current;
    if (!origin) return;
    const touch = event.touches[0];
    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    setDrag(dy > 0 && dy > Math.abs(dx) ? dy : 0);
  }

  function onTouchEnd(event: TouchEvent) {
    const origin = start.current;
    start.current = null;
    setHeld(false);
    if (!origin) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    if (Math.abs(dy) > Math.abs(dx) && dy > SWIPE) {
      event.preventDefault();
      swiped.current = true;
      setClosing(true);
      window.setTimeout(close, SLIDE);
      return;
    }
    setDrag(0);
  }

  function advance(event: MouseEvent) {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    if (!reveal || closing || onVideo(event)) return;
    const next = reveal.index + 1;
    if (next < reveal.items.length) {
      setReveal({ items: reveal.items, index: next });
      return;
    }
    close();
  }

  function close() {
    if (!reveal) return;
    const merged = [...new Set([...seen, ...reveal.items.map((media) => media.id)])];
    localStorage.setItem(seenKey(profile!), merged.join(','));
    setSeen(merged);
    setReveal(null);
    setDrag(0);
    setHeld(false);
    setClosing(false);
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
  const unseen = other.media.filter((media) => !seen.includes(media.id));
  const shown = other.media[other.media.length - 1];
  const current = reveal ? reveal.items[reveal.index] : undefined;

  return (
    <div className="snap">
      <section className="snap-streak">
        <div className="snap-streak-row">
          <div className="snap-stat">
            <span className="snap-stat-value">{streak.total}</span>
            <span className="snap-stat-label">
              {streak.total > 1 ? 'journées complètes' : 'journée complète'}
            </span>
          </div>
          <div className="snap-stat snap-stat-main">
            <span className="snap-stat-value">🔥 {streak.current}</span>
            <span className="snap-stat-label">
              {streak.current === 0
                ? 'aucun streak'
                : streak.current > 1
                  ? 'jours de suite'
                  : 'jour de suite'}
            </span>
          </div>
          <div className="snap-stat">
            <span className="snap-stat-value">{me.sent ? '✅' : '⬜'}</span>
            <span className="snap-stat-label">{me.sent ? 'envoyé' : 'à envoyer'}</span>
          </div>
        </div>
        {streak.atRisk && streak.deadline && (
          <p className="snap-risk">
            Il te reste {remaining(streak.deadline)} pour sauver le streak
          </p>
        )}
      </section>

      {unseen.length > 0 ? (
        <button className="snap-frame snap-cover" type="button" onClick={() => openReveal(unseen)}>
          👀 Appuyer pour voir{' '}
          {unseen.length > 1 ? `les ${unseen.length} photos` : 'la photo'} de {other.profile}
        </button>
      ) : shown ? (
        <div
          className="snap-frame"
          onClick={(event) => !onVideo(event) && openReveal(other.media)}
        >
          {shown.kind === 'video' ? (
            <video className="snap-media" src={shown.originalUrl} controls playsInline />
          ) : (
            <img className="snap-media" src={shown.originalUrl} alt="" />
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
          accept="image/*,image/heic,image/heif"
          capture="environment"
          hidden
          onChange={send}
        />
        <Button disabled={busy} onClick={() => cameraInput.current?.click()}>
          {me.sent ? 'Envoyer une autre photo' : 'Prendre une photo'}
        </Button>
        {busy && (
          <div className="snap-progress">
            <div className="snap-progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}
        {sendError && <p className="snap-send-error">{sendError}</p>}
      </section>

      <Link className="snap-album" to="/album">
        Voir l'album
      </Link>

      {reveal && current && (
        <div
          className={`snap-reveal${held ? ' snap-reveal-held' : ''}${closing ? ' snap-reveal-closing' : ''}`}
          style={{ '--drag': `${drag}px` } as CSSProperties}
          onClick={advance}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <button className="snap-reveal-close" type="button" onClick={close}>
            ✕
          </button>
          {current.kind === 'video' ? (
            <video
              className="snap-reveal-media"
              src={current.originalUrl}
              controls
              playsInline
              autoPlay
            />
          ) : (
            <img className="snap-reveal-media" src={current.originalUrl} alt="" />
          )}
          {reveal.items.length > 1 && (
            <p className="snap-reveal-count">
              {reveal.index + 1} / {reveal.items.length}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
