import { Router } from 'express';
import { requireProfile } from '../auth.js';
import { db } from '../db.js';
import { localDay } from '../day.js';
import { deleteMedia } from '../media/storage.js';
import type { MediaRow } from '../media/storage.js';
import { resetStreak } from '../streak.js';

export const router = Router();

const snapsOfDayStmt = db.prepare("SELECT * FROM media WHERE source = 'snap' AND local_day = ?");
const allMediaStmt = db.prepare('SELECT * FROM media');

router.delete('/snap/today', requireProfile, async (_req, res) => {
  await deleteMedia(snapsOfDayStmt.all(localDay()) as MediaRow[]);
  res.status(204).end();
});

router.post('/streak/reset', requireProfile, (_req, res) => {
  resetStreak();
  res.status(204).end();
});

router.delete('/media', requireProfile, async (_req, res) => {
  await deleteMedia(allMediaStmt.all() as MediaRow[]);
  res.status(204).end();
});
