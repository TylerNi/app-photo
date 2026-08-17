import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { deleteAllMedia, deleteTodaySnaps, resetStreak } from '../api/settings';

type Action = 'snaps' | 'streak' | 'album';

const ACTIONS: Record<Action, { label: string; question: string; run: () => Promise<void> }> = {
  snaps: {
    label: 'Supprimer les snaps du jour',
    question: 'Supprimer les snaps du jour des deux profils ?',
    run: deleteTodaySnaps,
  },
  streak: {
    label: 'Réinitialiser le streak',
    question: 'Remettre le streak et le total de journées à zéro ? Aucune photo n’est supprimée.',
    run: resetStreak,
  },
  album: {
    label: "Supprimer toutes les photos de l'album",
    question: 'Supprimer toutes les photos, snaps compris ? Rien ne sera récupérable.',
    run: deleteAllMedia,
  },
};

export function Settings() {
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run(action: Action) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await ACTIONS[action].run();
      setDone(`${ACTIONS[action].label} : c'est fait.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action impossible.');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <div className="settings">
      <Link className="settings-back" to="/">
        ‹ Retour
      </Link>

      {(Object.keys(ACTIONS) as Action[]).map((action) => (
        <button
          key={action}
          className="button button-secondary settings-action"
          type="button"
          disabled={busy}
          onClick={() => {
            setError(null);
            setDone(null);
            setConfirm(action);
          }}
        >
          {ACTIONS[action].label}
        </button>
      ))}

      {done && <p className="settings-done">{done}</p>}
      {error && <p className="settings-error">{error}</p>}

      {confirm && (
        <div className="sheet-backdrop" onClick={() => setConfirm(null)}>
          <div className="sheet" onClick={(event) => event.stopPropagation()}>
            <p className="sheet-question">{ACTIONS[confirm].question}</p>
            <button
              className="sheet-danger"
              type="button"
              disabled={busy}
              onClick={() => void run(confirm)}
            >
              Confirmer
            </button>
            <button type="button" onClick={() => setConfirm(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
