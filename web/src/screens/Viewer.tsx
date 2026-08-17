import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, TouchEvent } from 'react';
import type { Media } from '../api/types';

const SWIPE = 50;
const SLIDE = 220;

function stamp(media: Media): string {
  return new Date(media.createdAt).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Viewer({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: Media[];
  index: number;
  onIndex: (next: number) => void;
  onClose: () => void;
}) {
  const [fallback, setFallback] = useState(false);
  const [drag, setDrag] = useState(0);
  const [held, setHeld] = useState(false);
  const [closing, setClosing] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const media = items[index];

  useEffect(() => setFallback(false), [index]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (event.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onIndex, onClose]);

  useEffect(() => {
    for (const neighbour of [items[index - 1], items[index + 1]]) {
      if (neighbour && neighbour.kind === 'photo') new Image().src = neighbour.originalUrl;
    }
  }, [items, index]);

  if (!media) return null;

  function onTouchStart(event: TouchEvent) {
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
    if (Math.abs(dy) > Math.abs(dx)) {
      if (dy > SWIPE) {
        event.preventDefault();
        setClosing(true);
        window.setTimeout(onClose, SLIDE);
        return;
      }
      setDrag(0);
      return;
    }
    setDrag(0);
    if (dx > SWIPE && index > 0) onIndex(index - 1);
    if (dx < -SWIPE && index < items.length - 1) onIndex(index + 1);
  }

  return (
    <div
      className={`viewer${held ? ' viewer-held' : ''}${closing ? ' viewer-closing' : ''}`}
      style={{ '--drag': `${drag}px` } as CSSProperties}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <button className="viewer-close" type="button" onClick={onClose}>
        ✕
      </button>
      <div className="viewer-stage">
        {media.kind === 'video' ? (
          <video className="viewer-media" src={media.originalUrl} controls playsInline autoPlay />
        ) : (
          <img
            className="viewer-media"
            src={fallback ? media.thumbUrl : media.originalUrl}
            alt=""
            onError={() => setFallback(true)}
          />
        )}
      </div>
      <p className="viewer-caption">
        {media.owner} · {stamp(media)}
        {fallback && <span className="viewer-fallback">Aperçu — format non affichable ici</span>}
      </p>
    </div>
  );
}
