import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { config } from '../config.js';
import { db } from '../db.js';
import { localDay } from '../day.js';
import type { Media } from '../types.js';
import { makeTeaser, makeThumb } from './derive.js';
import { perceptualHash, sha256File } from './hash.js';
import { probeImage, probeVideo } from './probe.js';

export interface MediaRow {
  id: string;
  owner: string;
  kind: 'photo' | 'video';
  source: 'snap' | 'album';
  original_name: string | null;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  taken_at: string | null;
  created_at: string;
  local_day: string;
  storage_path: string;
  thumb_path: string | null;
  teaser_path: string | null;
  derive_status: 'pending' | 'ready' | 'failed';
  sha256: string | null;
  phash: string | null;
}

export class UnsupportedTypeError extends Error {}

export const ACCEPTED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

function mimeFromName(name: string): string | undefined {
  const ext = extname(name).slice(1).toLowerCase();
  const normalized = ext === 'jpeg' ? 'jpg' : ext;
  return Object.keys(ACCEPTED_MIME).find((mime) => ACCEPTED_MIME[mime] === normalized);
}

export function toMedia(row: MediaRow): Media {
  return {
    id: row.id,
    owner: row.owner,
    kind: row.kind,
    source: row.source,
    mime: row.mime,
    bytes: row.bytes,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    takenAt: row.taken_at,
    createdAt: row.created_at,
    localDay: row.local_day,
    thumbUrl: `/api/media/${row.id}/thumb`,
    originalUrl: `/api/media/${row.id}/original`,
  };
}

export function getMediaRow(id: string): MediaRow | undefined {
  return db.prepare('SELECT * FROM media WHERE id = ?').get(id) as MediaRow | undefined;
}

const deleteMediaStmt = db.prepare('DELETE FROM media WHERE id = ?');

export async function deleteMedia(rows: MediaRow[]): Promise<void> {
  for (const row of rows) {
    for (const path of [row.storage_path, row.thumb_path, row.teaser_path]) {
      if (path) await rm(resolve(config.dataDir, path), { force: true });
    }
    deleteMediaStmt.run(row.id);
  }
}

const insertMedia = db.prepare(`
  INSERT INTO media (
    id, owner, kind, source, original_name, mime, bytes, width, height,
    duration_ms, taken_at, created_at, local_day, storage_path, derive_status, sha256
  ) VALUES (
    @id, @owner, @kind, @source, @original_name, @mime, @bytes, @width, @height,
    @duration_ms, @taken_at, @created_at, @local_day, @storage_path, 'pending', @sha256
  )
`);

const updateDerived = db.prepare(`
  UPDATE media SET thumb_path = @thumb_path, teaser_path = @teaser_path,
    derive_status = @derive_status, phash = @phash
  WHERE id = @id
`);

export async function storeUpload(
  file: { path: string; originalname: string; mimetype: string; size: number },
  owner: string,
  source: 'snap' | 'album',
): Promise<Media> {
  const mime = ACCEPTED_MIME[file.mimetype]
    ? file.mimetype
    : file.mimetype === 'application/octet-stream'
      ? mimeFromName(file.originalname)
      : undefined;

  if (!mime) {
    await rm(file.path, { force: true });
    throw new UnsupportedTypeError(`Type non pris en charge : ${file.mimetype}`);
  }

  const id = randomUUID();
  const ext = ACCEPTED_MIME[mime];
  const kind: 'photo' | 'video' = mime.startsWith('video/') ? 'video' : 'photo';

  const now = new Date();
  const day = localDay(now);
  const [year, month] = day.split('-');
  const storagePath = `originals/${year}/${month}/${id}.${ext}`;
  const absoluteStoragePath = resolve(config.dataDir, storagePath);

  await mkdir(resolve(config.originalsDir, year, month), { recursive: true });
  await rename(file.path, absoluteStoragePath);

  const probed =
    kind === 'video'
      ? await probeVideo(absoluteStoragePath)
      : { ...(await probeImage(absoluteStoragePath)), durationMs: null };

  insertMedia.run({
    id,
    owner,
    kind,
    source,
    original_name: file.originalname,
    mime,
    bytes: file.size,
    width: probed.width,
    height: probed.height,
    duration_ms: probed.durationMs,
    taken_at: probed.takenAt,
    created_at: now.toISOString(),
    local_day: day,
    storage_path: storagePath,
    sha256: await sha256File(absoluteStoragePath),
  });

  const thumbPath = `thumbs/${id}.jpg`;
  const thumbOk = await makeThumb(absoluteStoragePath, kind, resolve(config.dataDir, thumbPath));

  let teaserPath: string | null = null;
  let teaserOk = true;
  if (source === 'snap' && thumbOk) {
    teaserPath = `teasers/${id}.jpg`;
    teaserOk = await makeTeaser(
      resolve(config.dataDir, thumbPath),
      resolve(config.dataDir, teaserPath),
    );
    if (!teaserOk) teaserPath = null;
  }

  updateDerived.run({
    id,
    thumb_path: thumbOk ? thumbPath : null,
    teaser_path: teaserPath,
    derive_status: thumbOk && teaserOk ? 'ready' : 'failed',
    phash: thumbOk ? await perceptualHash(resolve(config.dataDir, thumbPath)) : null,
  });

  return toMedia(getMediaRow(id)!);
}
