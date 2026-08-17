import { resolve } from 'node:path';
import { config } from '../config.js';
import { db } from '../db.js';
import { probeImage, probeVideo } from './probe.js';

const VERSION = 1;

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
