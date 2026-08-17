import { config } from '../config.js';
import { db } from '../db.js';
import { localDay } from '../day.js';
import { computeStreak, hasSnap } from '../streak.js';
import type { Media } from '../types.js';
import { sendTo } from './push.js';
import { albumUpload, snapSent } from './texts.js';

const ALBUM_WINDOW_MS = 10 * 60 * 1000;

const windowCountsStmt = db.prepare(`
  SELECT kind, COUNT(*) AS n
  FROM media
  WHERE owner = ? AND source = 'album' AND created_at >= ?
  GROUP BY kind
`);

const logStmt = db.prepare(`
  INSERT INTO notification_log (kind, recipient, local_day, sent_at, count, tag)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function otherProfile(me: string): string {
  return config.profiles.find((name) => name !== me) ?? me;
}

export async function onAlbumUpload(profile: string, items: Media[]): Promise<void> {
  if (items.length === 0) return;

  const since = new Date(Date.now() - ALBUM_WINDOW_MS).toISOString();
  const counts = windowCountsStmt.all(profile, since) as { kind: 'photo' | 'video'; n: number }[];
  const photos = counts.find((row) => row.kind === 'photo')?.n ?? 0;
  const videos = counts.find((row) => row.kind === 'video')?.n ?? 0;
  if (photos + videos === 0) return;

  const recipient = otherProfile(profile);
  const payload = albumUpload(profile, photos, videos);

  await sendTo(recipient, payload);
  logStmt.run(
    'album',
    recipient,
    localDay(),
    new Date().toISOString(),
    photos + videos,
    payload.tag,
  );
}

export async function onSnapSent(sender: string, media: Media): Promise<void> {
  const recipient = otherProfile(sender);
  const day = localDay();
  const payload = snapSent(sender, hasSnap(recipient, day), computeStreak().current);

  await sendTo(recipient, payload);
  logStmt.run('snap', recipient, day, new Date().toISOString(), 1, payload.tag);
}
