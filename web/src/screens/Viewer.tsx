import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, TouchEvent } from 'react';
import type { Media } from '../api/types';

const SWIPE = 50;
const SLIDE = 220;
const AXIS = 10;

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
  const [broken, setBroken] = useState<string[]>([]);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [held, setHeld] = useState(false);
  const [jump, setJump] = useState(false);
  const [closing, setClosing] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<'x' | 'y' | null>(null);
  const settling = useRef(false);
  const strip = useRef<HTMLDivElement>(null);
  const active = useRef<HTMLButtonElement>(null);
  const media = items[index];

  useEffect(() => {
    if (!jump) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setJump(false)));
    return () => cancelAnimationFrame(frame);
  }, [jump]);

  useEffect(() => {
    const node = active.current;
    const box = strip.current;
    if (!node || !box) return;
    box.scrollLeft = node.offsetLeft - box.clientWidth / 2 + node.clientWidth / 2;
  }, [index]);

  function slide(next: number) {
    if (settling.current || next < 0 || next > items.length - 1) return;
    settling.current = true;
    setHeld(false);
    setDrag({ x: next > index ? -window.innerWidth : window.innerWidth, y: 0 });
    window.setTimeout(() => {
      settling.current = false;
      setJump(true);
      setDrag({ x: 0, y: 0 });
      onIndex(next);
    }, SLIDE);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft') slide(index - 1);
      if (event.key === 'ArrowRight') slide(index + 1);
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onIndex, onClose]);

  if (!media) return null;

  function onTouchStart(event: TouchEvent) {
    const target = event.target as HTMLElement;
    if (settling.current || target.closest('video') || target.closest('.viewer-strip')) {
      start.current = null;
      return;
    }
    const touch = event.touches[0];
    start.current = { x: touch.clientX, y: touch.clientY };
    axis.current = null;
    setHeld(true);
  }

  function onTouchMove(event: TouchEvent) {
    const origin = start.current;
    if (!origin) return;
    const touch = event.touches[0];
    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    if (axis.current === null) {
      if (Math.abs(dx) < AXIS && Math.abs(dy) < AXIS) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (axis.current === 'y') {
      setDrag({ x: 0, y: dy > 0 ? dy : 0 });
      return;
    }
    const blocked = (dx > 0 && index === 0) || (dx < 0 && index === items.length - 1);
    setDrag({ x: blocked ? dx / 4 : dx, y: 0 });
  }

  function onTouchEnd(event: TouchEvent) {
    const origin = start.current;
    const direction = axis.current;
    start.current = null;
    axis.current = null;
    setHeld(false);
    if (!origin) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    if (direction === 'y') {
      if (dy > SWIPE) {
        event.preventDefault();
        setClosing(true);
        window.setTimeout(onClose, SLIDE);
        return;
      }
      setDrag({ x: 0, y: 0 });
      return;
    }
    if (dx > SWIPE && index > 0) {
      slide(index - 1);
      return;
    }
    if (dx < -SWIPE && index < items.length - 1) {
      slide(index + 1);
      return;
    }
    setDrag({ x: 0, y: 0 });
  }

  const window3 = [items[index - 1], items[index], items[index + 1]];

  return (
    <div
      className={`viewer${held ? ' viewer-held' : ''}${jump ? ' viewer-jump' : ''}${closing ? ' viewer-closing' : ''}`}
      style={{ '--dragx': `${drag.x}px`, '--dragy': `${drag.y}px` } as CSSProperties}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <button className="viewer-close" type="button" onClick={onClose}>
        ✕
      </button>
      <div className="viewer-stage">
        <div className="viewer-track">
          {window3.map((slot, position) => (
            <div className="viewer-slide" key={slot ? slot.id : `edge-${position}`}>
              {slot &&
                (slot.kind === 'video' ? (
                  position === 1 ? (
                    <video
                      className="viewer-media"
                      src={slot.originalUrl}
                      controls
                      playsInline
                      autoPlay
                    />
                  ) : (
                    <img className="viewer-media" src={slot.thumbUrl} alt="" />
                  )
                ) : (
                  <img
                    className="viewer-media"
                    src={broken.includes(slot.id) ? slot.thumbUrl : slot.originalUrl}
                    alt=""
                    onError={() => setBroken((previous) => [...previous, slot.id])}
                  />
                ))}
            </div>
          ))}
        </div>
      </div>
      <p className="viewer-caption">
        {media.owner} · {stamp(media)}
        {broken.includes(media.id) && (
          <span className="viewer-fallback">Aperçu — format non affichable ici</span>
        )}
      </p>
      <div className="viewer-strip" ref={strip}>
        {items.map((item, position) => (
          <button
            key={item.id}
            ref={position === index ? active : null}
            className={`viewer-thumb${position === index ? ' viewer-thumb-active' : ''}`}
            type="button"
            onClick={() => onIndex(position)}
          >
            <img src={item.thumbUrl} loading="lazy" decoding="async" alt="" />
          </button>
        ))}
      </div>
    </div>
  );
}
