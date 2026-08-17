import { Router } from 'express';
import multer from 'multer';
import { requireProfile } from '../auth.js';
import { config } from '../config.js';
import { localDay } from '../day.js';
import { UnsupportedTypeError, storeUpload, toMedia } from '../media/storage.js';
import { onSnapSent } from '../notify/events.js';
import { computeStreak, snapOfDay } from '../streak.js';
import type { TodayState } from '../types.js';

export const router = Router();

function otherProfile(me: string): string {
  return config.profiles.find((name) => name !== me) ?? me;
}

function todayState(me: string): TodayState {
  const day = localDay();
  const other = otherProfile(me);
  const mine = snapOfDay(me, day);
  const theirs = snapOfDay(other, day);
  const revealed = mine !== undefined;

  return {
    localDay: day,
    streak: computeStreak(),
    me: { profile: me, sent: mine !== undefined, media: mine ? toMedia(mine) : null },
    other: {
      profile: other,
      sent: theirs !== undefined,
      revealed,
      media: revealed && theirs ? toMedia(theirs) : null,
      teaserUrl: theirs && !revealed ? `/api/media/${theirs.id}/teaser` : null,
    },
  };
}

const upload = multer({
  storage: multer.diskStorage({ destination: config.tmpDir }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
}).single('file');

router.get('/snap/today', requireProfile, (req, res) => {
  res.json(todayState(req.profile!));
});

router.post(
  '/snap',
  requireProfile,
  (req, res, next) => {
    upload(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          error: 'too_large',
          message: `Fichier trop lourd (maximum ${config.maxUploadMb} Mo).`,
        });
        return;
      }
      res.status(400).json({ error: 'bad_request', message: 'Envoi invalide.' });
    });
  },
  async (req, res) => {
    const profile = req.profile!;
    if (!req.file) {
      res.status(400).json({ error: 'bad_request', message: 'Aucune photo envoyée.' });
      return;
    }

    let media;
    try {
      media = await storeUpload(req.file, profile, 'snap');
    } catch (err) {
      if (err instanceof UnsupportedTypeError) {
        res.status(415).json({ error: 'unsupported_type', message: 'Type de fichier refusé.' });
        return;
      }
      throw err;
    }

    res.json(todayState(profile));
    onSnapSent(profile, media).catch(() => {});
  },
);

router.get('/streak', requireProfile, (_req, res) => {
  res.json(computeStreak());
});
