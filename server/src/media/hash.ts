import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TIMEOUT = 30_000;

export async function sha256File(path: string): Promise<string | null> {
  try {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
    return hash.digest('hex');
  } catch {
    return null;
  }
}

export async function perceptualHash(thumbPath: string): Promise<string | null> {
  try {
    const { stdout } = await run(
      'magick',
      [`${thumbPath}[0]`, '-colorspace', 'Gray', '-resize', '9x8!', '-depth', '8', 'gray:-'],
      { timeout: TIMEOUT, encoding: 'buffer', maxBuffer: 1024 },
    );
    if (stdout.length < 72) return null;
    let bits = '';
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        const left = stdout[row * 9 + column];
        const right = stdout[row * 9 + column + 1];
        bits += left > right ? '1' : '0';
      }
    }
    return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
  } catch {
    return null;
  }
}

export function hammingDistance(a: string, b: string): number {
  let diff = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (diff > 0n) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}
