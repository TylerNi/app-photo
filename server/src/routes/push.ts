import { Router } from 'express';
import { requireProfile } from '../auth.js';
import { config } from '../config.js';
import { db } from '../db.js';
import { publicLink, sendTo } from '../notify/push.js';
import '../notify/scheduler.js';

export const router = Router();

const upsertStmt = db.prepare(`
  INSERT INTO push_subscriptions (profile, endpoint, p256dh, auth, user_agent, created_at)
  VALUES (@profile, @endpoint, @p256dh, @auth, @user_agent, @created_at)
  ON CONFLICT (endpoint) DO UPDATE SET
    profile = excluded.profile,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent
`);

const deleteStmt = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');

router.get('/push/key', (_req, res) => {
  res.json({ key: config.vapidPublicKey });
});

router.post('/push/subscribe', requireProfile, (req, res) => {
  const body = req.body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;

  if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') {
    res.status(400).json({ error: 'bad_request', message: 'Abonnement invalide.' });
    return;
  }

  upsertStmt.run({
    profile: req.profile!,
    endpoint,
    p256dh,
    auth,
    user_agent: req.get('user-agent') ?? null,
    created_at: new Date().toISOString(),
  });

  res.status(204).end();
});

router.post('/push/unsubscribe', (req, res) => {
  const endpoint = (req.body as { endpoint?: unknown })?.endpoint;

  if (typeof endpoint !== 'string') {
    res.status(400).json({ error: 'bad_request', message: 'Abonnement invalide.' });
    return;
  }

  deleteStmt.run(endpoint);
  res.status(204).end();
});

router.post('/push/test', requireProfile, async (req, res) => {
  await sendTo(req.profile!, {
    title: '🔔 Ça marche !',
    body: 'Les notifications sont bien activées.',
    tag: 'test',
    url: publicLink('/'),
  });
  res.status(204).end();
});
