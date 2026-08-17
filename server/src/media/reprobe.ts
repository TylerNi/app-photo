import { resolve } from 'node:path';
import { config } from '../config.js';
import { db } from '../db.js';
import { perceptualHash, sha256File } from './hash.js';
import { probeImage, probeVideo } from './probe.js';

const VERSION = 1;
const HASH_VERSION = 2;

export async function backfillHashes(): Promise<void> {
  if ((db.pragma('user_version', { simple: true }) as number) >= HASH_VERSION) return;

  const rows = db
    .prepare('SELECT id, storage_path, thumb_path FROM media WHERE sha256 IS NULL')
    .all() as { id: string; storage_path: string; thumb_path: string | null }[];

  const update = db.prepare('UPDATE media SET sha256 = ?, phash = ? WHERE id = ?');

  for (const row of rows) {
    const sha = await sha256File(resolve(config.dataDir, row.storage_path));
    const phash = row.thumb_path
      ? await perceptualHash(resolve(config.dataDir, row.thumb_path))
      : null;
    update.run(sha, phash, row.id);
  }

  db.pragma(`user_version = ${HASH_VERSION}`);
}

export async function reprobeTakenAt(): Promise<void> {
  if ((db.pragma('user_version', { simple: true }) as number) >= VERSION) return;

  const rows = db.prepare('SELECT id, kind, storage_path FROM media').all() as {
    id: string;
    kind: 'photo' | 'video';
    storage_path: string;
  }[];

  const update = db.prepare('UPDATE media SET taken_at = ? WHERE id = ?');

  for (const row of rows) {
    const path = resolve(config.dataDir, row.storage_path);
    const probed = row.kind === 'video' ? await probeVideo(path) : await probeImage(path);
    if (probed.takenAt !== null) update.run(probed.takenAt, row.id);
  }

  db.pragma(`user_version = ${VERSION}`);
}
