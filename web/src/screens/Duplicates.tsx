import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { deleteMedia, listDuplicates } from '../api/media';
import type { DuplicateGroup, Media } from '../api/types';
import { Spinner } from '../ui/Spinner';

function size(media: Media): string {
  const mb = media.bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} Mo` : `${Math.round(media.bytes / 1024)} Ko`;
}

function details(media: Media): string {
  const pixels = media.width && media.height ? `${media.width} × ${media.height} · ` : '';
  return `${pixels}${size(media)}`;
}

export function Duplicates({
  onDeleted,
  onClose,
}: {
  onDeleted: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listDuplicates()
      .then((result) => setGroups(result.groups))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Impossible de chercher les doublons.'),
      );
  }, []);

  if (error) {
    return (
      <div className="dupes">
        <p className="dupes-error">{error}</p>
        <button className="button button-secondary" type="button" onClick={onClose}>
          Fermer
        </button>
      </div>
    );
  }

  if (!groups) {
    return (
      <div className="dupes">
        <Spinner />
      </div>
    );
  }

  const group = groups[index];

  if (!group) {
    return (
      <div className="dupes">
        <p className="dupes-done">
          {groups.length === 0 ? 'Aucun doublon trouvé.' : 'Revue terminée.'}
        </p>
        <button className="button button-secondary" type="button" onClick={onClose}>
          Fermer
        </button>
      </div>
    );
  }

  const [keep, ...drop] = group.items;

  async function remove() {
    setBusy(true);
    const removed: string[] = [];
    try {
      for (const media of drop) {
        await deleteMedia(media.id);
        removed.push(media.id);
      }
      setIndex((previous) => previous + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Suppression impossible.');
    } finally {
      if (removed.length > 0) onDeleted(removed);
      setBusy(false);
    }
  }

  return (
    <div className="dupes">
      <div className="dupes-bar">
        <span className="dupes-count">
          {index + 1} / {groups.length}
        </span>
        <button className="dupes-close" type="button" onClick={onClose}>
          ✕
        </button>
      </div>

      <p className="dupes-verdict">
        {group.exact ? 'Fichiers identiques' : 'Même image, qualité inférieure'}
      </p>

      <div className="dupes-pair">
        <figure className="dupes-item">
          <img src={keep.thumbUrl} alt="" />
          <figcaption>
            <strong>{group.exact ? 'Conservé' : 'Meilleure qualité'}</strong>
            {details(keep)}
          </figcaption>
        </figure>
        {drop.map((media) => (
          <figure key={media.id} className="dupes-item dupes-drop">
            <img src={media.thumbUrl} alt="" />
            <figcaption>
              <strong>{group.exact ? 'Doublon' : 'Moins bonne'}</strong>
              {details(media)}
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="dupes-actions">
        <button
          className="button button-primary"
          type="button"
          disabled={busy}
          onClick={() => void remove()}
        >
          {drop.length > 1
            ? `Supprimer les ${drop.length} autres`
            : group.exact
              ? 'Supprimer le doublon'
              : 'Supprimer la moins bonne'}
        </button>
        <button
          className="button button-secondary"
          type="button"
          disabled={busy}
          onClick={() => setIndex(index + 1)}
        >
          Tout garder
        </button>
      </div>
    </div>
  );
}
