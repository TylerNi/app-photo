import { Router } from 'express';
import type { Response } from 'express';
import multer from 'multer';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { requireProfile } from '../auth.js';
import { config } from '../config.js';
import { db } from '../db.js';
import type { MediaRow } from '../media/storage.js';
import { UnsupportedTypeError, getMediaRow, storeUpload, toMedia } from '../media/storage.js';
import { onAlbumUpload } from '../notify/events.js';
import { hasSnap } from '../streak.js';
import type { Media } from '../types.js';

export const router = Router();

type AlbumRow = MediaRow & { sort_at: string };

const VISIBLE = `
  source <> 'snap' OR local_day IN (
    SELECT local_day FROM media
    WHERE source = 'snap'
    GROUP BY local_day
    HAVING COUNT(DISTINCT owner) = 2
  )
`;

const listFirstPage = db.prepare(`
  SELECT *, COALESCE(taken_at, created_at) AS sort_at FROM media
  WHERE (${VISIBLE})
  ORDER BY sort_at DESC, id DESC
  LIMIT @limit
`);

const listAfterCursor = db.prepare(`
  SELECT *, COALESCE(taken_at, created_at) AS sort_at FROM media
  WHERE (${VISIBLE})
    AND (COALESCE(taken_at, created_at), id) < (@sortAt, @id)
  ORDER BY sort_at DESC, id DESC
  LIMIT @limit
`);

function revealBlocked(row: MediaRow, me: string): boolean {
  return row.source === 'snap' && row.owner !== me && !hasSnap(me, row.local_day);
}

function notFound(res: Response): void {
  res.status(404).json({ error: 'not_found', message: 'Média introuvable.' });
}

function notRevealed(res: Response): void {
  res.status(403).json({
    error: 'not_revealed',
    message: "Envoie ton snap du jour pour voir celui de l'autre.",
  });
}

function serveFile(res: Response, relativePath: string, mime: string): void {
  if (!existsSync(resolve(config.dataDir, relativePath))) {
    notFound(res);
    return;
  }
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.sendFile(relativePath, { root: config.dataDir });
}

const upload = multer({
  storage: multer.diskStorage({ destination: config.tmpDir }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
}).array('files', 20);

router.post(
  '/album',
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
    const files = (req.files ?? []) as Express.Multer.File[];
    const profile = req.profile!;
    const items: Media[] = [];

    try {
      for (const file of files) {
        items.push(await storeUpload(file, profile, 'album'));
      }
    } catch (err) {
      if (err instanceof UnsupportedTypeError) {
        res.status(415).json({ error: 'unsupported_type', message: 'Type de fichier refusé.' });
        return;
      }
      throw err;
    }

    res.json({ items });
    onAlbumUpload(profile, items).catch(() => {});
  },
);

router.get('/album', requireProfile, (req, res) => {
  const requested = Number(req.query.limit ?? 60);
  const limit = Math.min(Number.isFinite(requested) && requested > 0 ? requested : 60, 200);

  const params = { limit: limit + 1 };

  const before = typeof req.query.before === 'string' ? req.query.before : null;
  let rows: AlbumRow[];

  if (before) {
    const separator = before.indexOf('|');
    if (separator < 0) {
      res.status(400).json({ error: 'bad_request', message: 'Curseur invalide.' });
      return;
    }
    rows = listAfterCursor.all({
      ...params,
      sortAt: before.slice(0, separator),
      id: before.slice(separator + 1),
    }) as AlbumRow[];
  } else {
    rows = listFirstPage.all(params) as AlbumRow[];
  }

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor = rows.length > limit && last ? `${last.sort_at}|${last.id}` : null;

  res.json({ items: page.map(toMedia), nextCursor });
});

router.get('/media/:id/original', requireProfile, (req, res) => {
  const row = getMediaRow(String(req.params.id));
  if (!row) {
    notFound(res);
    return;
  }
  if (revealBlocked(row, req.profile!)) {
    notRevealed(res);
    return;
  }
  serveFile(res, row.storage_path, row.mime);
});

router.get('/media/:id/thumb', requireProfile, (req, res) => {
  const row = getMediaRow(String(req.params.id));
  if (!row || !row.thumb_path) {
    notFound(res);
    return;
  }
  if (revealBlocked(row, req.profile!)) {
    notRevealed(res);
    return;
  }
  serveFile(res, row.thumb_path, 'image/jpeg');
});

router.get('/media/:id/teaser', requireProfile, (req, res) => {
  const row = getMediaRow(String(req.params.id));
  if (!row) {
    notFound(res);
    return;
  }
  if (!revealBlocked(row, req.profile!)) {
    notRevealed(res);
    return;
  }
  if (!row.teaser_path) {
    notFound(res);
    return;
  }
  serveFile(res, row.teaser_path, 'image/jpeg');
});
