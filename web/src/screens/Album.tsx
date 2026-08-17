import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { listAlbum, uploadToAlbum } from '../api/media';
import type { Media } from '../api/types';
import { useSession } from '../session';
import { Spinner } from '../ui/Spinner';
import { Viewer } from './Viewer';
import './Album.css';

const LONG_PRESS = 500;

const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
const canCopy =
  typeof window !== 'undefined' &&
  typeof window.ClipboardItem !== 'undefined' &&
  typeof navigator.clipboard?.write === 'function';

function isoDay(date: Date): string {
  return date.toLocaleDateString('en-CA');
}

function dayLabel(day: string): string {
  const today = new Date();
  if (day === isoDay(today)) return "Aujourd'hui";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === isoDay(yesterday)) return 'Hier';
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function sortKey(media: Media): string {
  return media.takenAt ?? media.createdAt;
}

function groupByDay(items: Media[]): { day: string; items: Media[] }[] {
  const groups: { day: string; items: Media[] }[] = [];
  for (const media of items) {
    const day = isoDay(new Date(sortKey(media)));
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(media);
    else groups.push({ day, items: [media] });
  }
  return groups;
}

function duration(ms: number | null): string {
  if (ms === null) return '';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function fileName(media: Media): string {
  const subtype = media.mime.split('/')[1] ?? 'bin';
  const ext = subtype === 'jpeg' ? 'jpg' : subtype === 'quicktime' ? 'mov' : subtype;
  return `${media.id}.${ext}`;
}

async function toPng(url: string): Promise<Blob> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas');
  context.drawImage(image, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png'))), 'image/png');
  });
}

export function Album() {
  const { profiles } = useSession();
  const [items, setItems] = useState<Media[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [end, setEnd] = useState(false);
  const [broken, setBroken] = useState<string[]>([]);
  const [viewer, setViewer] = useState<number | null>(null);
  const [menu, setMenu] = useState<Media | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ index: number; total: number; pct: number } | null>(null);
  const [failures, setFailures] = useState<string[]>([]);

  const cursor = useRef<string | null>(null);
  const loading = useRef(false);
  const finished = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<number | null>(null);
  const pressed = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadMore = useCallback(async () => {
    if (loading.current || finished.current) return;
    loading.current = true;
    try {
      const page = await listAlbum(cursor.current ?? undefined);
      cursor.current = page.nextCursor;
      if (page.nextCursor === null) {
        finished.current = true;
        setEnd(true);
      }
      setItems((previous) => {
        const seen = new Set(previous.map((media) => media.id));
        return [...previous, ...page.items.filter((media) => !seen.has(media.id))];
      });
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Impossible de charger l'album.");
    } finally {
      loading.current = false;
    }
  }, []);

  useEffect(() => {
    void loadMore();
  }, [loadMore]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, end]);

  function cancelPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function startPress(media: Media) {
    pressed.current = false;
    cancelPress();
    pressTimer.current = window.setTimeout(() => {
      pressed.current = true;
      pressTimer.current = null;
      setActionError(null);
      setMenu(media);
    }, LONG_PRESS);
  }

  function openViewer(index: number) {
    if (pressed.current) {
      pressed.current = false;
      return;
    }
    setViewer(index);
  }

  function openMenu(event: MouseEvent, media: Media) {
    event.preventDefault();
    setActionError(null);
    setMenu(media);
  }

  async function share(media: Media) {
    setMenu(null);
    try {
      const blob = await fetch(media.originalUrl).then((res) => res.blob());
      const file = new File([blob], fileName(media), { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName(media);
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setActionError("Le partage n'a pas abouti.");
    }
  }

  function copy(media: Media) {
    setMenu(null);
    navigator.clipboard
      .write([new ClipboardItem({ 'image/png': toPng(media.originalUrl) })])
      .catch(() => setActionError("La copie n'a pas abouti."));
  }

  async function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setFailures([]);
    const failed: string[] = [];

    for (const [index, file] of files.entries()) {
      setUpload({ index: index + 1, total: files.length, pct: 0 });
      try {
        const media = await uploadToAlbum(file, (pct) =>
          setUpload({ index: index + 1, total: files.length, pct }),
        );
        setItems((previous) =>
          [media, ...previous.filter((other) => other.id !== media.id)].sort(
            (a, b) => sortKey(b).localeCompare(sortKey(a)) || b.id.localeCompare(a.id),
          ),
        );
      } catch (err) {
        failed.push(`${file.name} — ${err instanceof ApiError ? err.message : 'envoi impossible'}`);
      }
    }

    setUpload(null);
    setFailures(failed);
  }

  const groups = groupByDay(items);

  return (
    <div className="album">
      <div className="album-bar">
        <Link className="album-back" to="/">
          ‹ Retour
        </Link>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,image/heic,image/heif,video/*"
          multiple
          hidden
          onChange={addFiles}
        />
        <button
          className="album-add"
          type="button"
          disabled={upload !== null}
          onClick={() => fileInput.current?.click()}
        >
          +
        </button>
      </div>

      {upload && (
        <div className="album-upload">
          <p>
            Envoi {upload.index} / {upload.total}
          </p>
          <div className="album-progress">
            <div className="album-progress-bar" style={{ width: `${upload.pct}%` }} />
          </div>
        </div>
      )}

      {failures.length > 0 && (
        <div className="album-failures">
          <p>
            {failures.length}{' '}
            {failures.length > 1
              ? "fichiers n'ont pas pu être envoyés"
              : "fichier n'a pas pu être envoyé"}
          </p>
          {failures.map((line) => (
            <p key={line} className="album-failure">
              {line}
            </p>
          ))}
        </div>
      )}

      {actionError && <p className="album-action-error">{actionError}</p>}

      {groups.map((group) => (
        <section key={group.day}>
          <h2 className="album-day">{dayLabel(group.day)}</h2>
          <div className="album-grid">
            {group.items.map((media) => (
              <button
                key={media.id}
                className="album-tile"
                type="button"
                onClick={() => openViewer(items.indexOf(media))}
                onContextMenu={(event) => openMenu(event, media)}
                onTouchStart={() => startPress(media)}
                onTouchMove={cancelPress}
                onTouchEnd={cancelPress}
              >
                {broken.includes(media.id) ? (
                  <span className="album-tile-missing">🖼️</span>
                ) : (
                  <img
                    src={media.thumbUrl}
                    loading="lazy"
                    decoding="async"
                    alt=""
                    onError={() => setBroken((previous) => [...previous, media.id])}
                  />
                )}
                {media.kind === 'video' && (
                  <span className="album-tile-video">▶ {duration(media.durationMs)}</span>
                )}
                <span
                  className={`album-tile-owner profile-${profiles.indexOf(media.owner)}`}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </section>
      ))}

      {loadError && (
        <p className="album-load-error" onClick={() => void loadMore()}>
          {loadError}
        </p>
      )}

      {!end && !loadError && (
        <div className="album-sentinel" ref={sentinel}>
          <Spinner />
        </div>
      )}

      {end && items.length === 0 && <p className="album-empty">L'album est vide.</p>}

      {menu && (
        <div className="album-menu-backdrop" onClick={() => setMenu(null)}>
          <div className="album-menu" onClick={(event) => event.stopPropagation()}>
            {canShare && (
              <button type="button" onClick={() => void share(menu)}>
                Partager / Enregistrer
              </button>
            )}
            {canCopy && menu.kind === 'photo' && (
              <button type="button" onClick={() => copy(menu)}>
                Copier
              </button>
            )}
            <button type="button" onClick={() => setMenu(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {viewer !== null && (
        <Viewer items={items} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}
