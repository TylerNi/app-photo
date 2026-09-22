import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { getPushKey, subscribePush, unsubscribePush } from '../api/push';

function decodeKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function PushButton() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      setOn(Boolean(subscription));
    })();
  }, []);

  async function enable() {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setError('Notifications refusées dans les réglages du téléphone.');
      return;
    }
    await navigator.serviceWorker.register('/sw.js');
    const registration = await navigator.serviceWorker.ready;
    const { key } = await getPushKey();
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeKey(key),
    });
    await subscribePush(subscription.toJSON());
    setOn(true);
  }

  async function disable() {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await unsubscribePush(subscription.endpoint);
      await subscription.unsubscribe();
    }
    setOn(false);
  }

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (on) await disable();
      else await enable();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Notifications indisponibles.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="button button-secondary settings-action"
        type="button"
        disabled={busy}
        onClick={() => void toggle()}
      >
        {on ? 'Désactiver les notifications' : 'Activer les notifications'}
      </button>
      {error && <p className="settings-error">{error}</p>}
    </>
  );
}
