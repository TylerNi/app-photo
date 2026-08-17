import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { localToUtc } from '../day.js';

const run = promisify(execFile);
const TIMEOUT = 30_000;

const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

function fromExifDate(raw: string): string | null {
  const match = EXIF_DATE.exec(raw.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return localToUtc(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
}

export async function probeImage(
  path: string,
): Promise<{ width: number | null; height: number | null; takenAt: string | null }> {
  let width: number | null = null;
  let height: number | null = null;
  let takenAt: string | null = null;

  try {
    const { stdout } = await run('magick', ['identify', '-format', '%w %h', `${path}[0]`], {
      timeout: TIMEOUT,
    });
    const [w, h] = stdout.trim().split(/\s+/).map(Number);
    if (Number.isFinite(w) && Number.isFinite(h)) {
      width = w;
      height = h;
    }
  } catch {
    width = null;
    height = null;
  }

  try {
    const { stdout } = await run(
      'magick',
      ['identify', '-format', '%[EXIF:DateTimeOriginal]', `${path}[0]`],
      { timeout: TIMEOUT },
    );
    takenAt = fromExifDate(stdout);
  } catch {
    takenAt = null;
  }

  return { width, height, takenAt };
}

interface FfprobeOutput {
  streams?: {
    width?: number;
    height?: number;
    side_data_list?: { rotation?: number }[];
  }[];
  format?: {
    duration?: string;
    tags?: { creation_time?: string };
  };
}

export async function probeVideo(path: string): Promise<{
  width: number | null;
  height: number | null;
  durationMs: number | null;
  takenAt: string | null;
}> {
  try {
    const { stdout } = await run(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height:stream_side_data=rotation:format=duration:format_tags=creation_time',
        '-of',
        'json',
        path,
      ],
      { timeout: TIMEOUT },
    );

    const parsed = JSON.parse(stdout) as FfprobeOutput;
    const stream = parsed.streams?.[0];

    let width = stream?.width ?? null;
    let height = stream?.height ?? null;

    const rotation = stream?.side_data_list?.find((entry) => entry.rotation !== undefined)?.rotation;
    if (rotation !== undefined && Math.abs(rotation) === 90 && width !== null && height !== null) {
      [width, height] = [height, width];
    }

    const duration = Number(parsed.format?.duration);
    const durationMs = Number.isFinite(duration) ? Math.round(duration * 1000) : null;

    let takenAt: string | null = null;
    const creationTime = parsed.format?.tags?.creation_time;
    if (creationTime) {
      const date = new Date(creationTime);
      takenAt = Number.isNaN(date.getTime()) ? fromExifDate(creationTime) : date.toISOString();
    }

    return { width, height, durationMs, takenAt };
  } catch {
    return { width: null, height: null, durationMs: null, takenAt: null };
  }
}
