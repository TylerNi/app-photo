import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TIMEOUT = 30_000;

async function producedFile(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.size > 0;
  } catch {
    return false;
  }
}

export async function makeThumb(
  sourcePath: string,
  kind: 'photo' | 'video',
  outPath: string,
): Promise<boolean> {
  try {
    if (kind === 'photo') {
      await run(
        'magick',
        [
          `${sourcePath}[0]`,
          '-auto-orient',
          '-resize',
          '600x600>',
          '-quality',
          '82',
          '-strip',
          outPath,
        ],
        { timeout: TIMEOUT },
      );
    } else {
      const args = (seek: string) => [
        '-y',
        '-ss',
        seek,
        '-i',
        sourcePath,
        '-frames:v',
        '1',
        '-vf',
        "scale='min(600,iw)':-2",
        outPath,
      ];
      try {
        await run('ffmpeg', args('1'), { timeout: TIMEOUT });
      } catch {}
      if (!(await producedFile(outPath))) {
        await run('ffmpeg', args('0'), { timeout: TIMEOUT });
      }
    }

    if (!(await producedFile(outPath))) {
      throw new Error('vignette vide');
    }
    return true;
  } catch (err) {
    process.stderr.write(`vignette impossible pour ${sourcePath} : ${String(err)}\n`);
    return false;
  }
}

export async function makeTeaser(thumbPath: string, outPath: string): Promise<boolean> {
  try {
    await run(
      'magick',
      [thumbPath, '-resize', '32x32', '-blur', '0x4', '-quality', '70', outPath],
      { timeout: TIMEOUT },
    );
    if (!(await producedFile(outPath))) {
      throw new Error('teaser vide');
    }
    return true;
  } catch (err) {
    process.stderr.write(`teaser impossible pour ${thumbPath} : ${String(err)}\n`);
    return false;
  }
}
