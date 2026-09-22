import { execFile } from 'node:child_process';
import { open } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TIMEOUT = 30_000;
const HEAD = 128 * 1024;

async function fromFrontCamera(path: string): Promise<boolean> {
  try {
    const { stdout } = await run(
      'magick',
      ['identify', '-format', '%[EXIF:LensModel]', `${path}[0]`],
      { timeout: TIMEOUT },
    );
    return /front/i.test(stdout);
  } catch {
    return false;
  }
}

function findOrientation(buf: Buffer): { at: number; little: boolean } | null {
  let cursor = 2;

  while (cursor + 4 <= buf.length) {
    if (buf[cursor] !== 0xff) return null;
    const size = buf.readUInt16BE(cursor + 2);

    if (buf[cursor + 1] === 0xe1 && buf.toString('ascii', cursor + 4, cursor + 10) === 'Exif\0\0') {
      const tiff = cursor + 10;
      if (tiff + 8 > buf.length) return null;

      const little = buf.toString('ascii', tiff, tiff + 2) === 'II';
      const u16 = (at: number) => (little ? buf.readUInt16LE(at) : buf.readUInt16BE(at));
      const u32 = (at: number) => (little ? buf.readUInt32LE(at) : buf.readUInt32BE(at));

      const ifd = tiff + u32(tiff + 4);
      if (ifd + 2 > buf.length) return null;

      const count = u16(ifd);
      for (let i = 0; i < count; i += 1) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > buf.length) return null;
        if (u16(entry) === 0x0112) return { at: entry + 8, little };
      }
      return null;
    }

    cursor += 2 + size;
  }

  return null;
}

export async function mirrorFrontCamera(path: string, mime: string): Promise<void> {
  if (mime !== 'image/jpeg') return;
  if (!(await fromFrontCamera(path))) return;

  const file = await open(path, 'r+');
  try {
    const head = Buffer.alloc(HEAD);
    const { bytesRead } = await file.read(head, 0, HEAD, 0);
    const found = findOrientation(head.subarray(0, bytesRead));
    if (!found) return;

    const value = found.little ? head.readUInt16LE(found.at) : head.readUInt16BE(found.at);
    if (value < 1 || value > 8) return;

    const patch = Buffer.alloc(2);
    const mirrored = value % 2 === 1 ? value + 1 : value - 1;
    if (found.little) patch.writeUInt16LE(mirrored, 0);
    else patch.writeUInt16BE(mirrored, 0);
    await file.write(patch, 0, 2, found.at);
  } finally {
    await file.close();
  }
}
