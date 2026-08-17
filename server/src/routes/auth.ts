import { Router } from 'express';
import { checkPassword, readSession, requireAuth, setSession } from '../auth.js';
import { config } from '../config.js';

export const router = Router();

router.post('/login', (req, res) => {
  if (!checkPassword(req.body?.password)) {
    res.status(401).json({ error: 'unauthorized', message: 'Mot de passe incorrect.' });
    return;
  }
  setSession(res, null);
  res.status(204).end();
});

router.get('/me', (req, res) => {
  const { authenticated, profile } = readSession(req);
  res.json({ authenticated, profile, profiles: config.profiles });
});

router.post('/profile', requireAuth, (req, res) => {
  const profile = req.body?.profile;
  if (typeof profile !== 'string' || !config.profiles.includes(profile)) {
    res.status(400).json({ error: 'bad_request', message: 'Profil inconnu.' });
    return;
  }
  setSession(res, profile);
  res.status(204).end();
});
