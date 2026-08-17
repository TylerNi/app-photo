import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const env = process.env;
const errors: string[] = [];

function required(name: string): string {
  const value = env[name];
  if (!value) {
    errors.push(`${name} est requise.`);
    return '';
  }
  return value;
}

const port = Number(env.PORT ?? 8080);
const dataDir = resolve(env.DATA_DIR ?? '/data');
const appPassword = required('APP_PASSWORD');
const sessionSecret = required('SESSION_SECRET');
const publicUrl = required('PUBLIC_URL');
const vapidPublicKey = required('VAPID_PUBLIC_KEY');
const vapidPrivateKey = required('VAPID_PRIVATE_KEY');

const profiles = (env.PROFILES ?? 'Tyler,Camille')
  .split(',')
  .map((name) => name.trim())
  .filter((name) => name.length > 0);

if (profiles.length !== 2) {
  errors.push('PROFILES doit contenir exactement deux noms séparés par une virgule.');
}

if (errors.length > 0) {
  process.stderr.write(
    `Configuration invalide, le serveur ne peut pas démarrer :\n${errors
      .map((line) => `  - ${line}`)
      .join('\n')}\n`,
  );
  process.exit(1);
}

const packagedWebDir = resolve(import.meta.dirname, '../web');
const localWebDir = resolve(import.meta.dirname, '../../web/dist');

export const config = {
  port,
  dataDir,
  appPassword,
  sessionSecret,
  profiles,
  appTz: env.APP_TZ ?? 'America/Toronto',
  publicUrl,
  vapidPublicKey,
  vapidPrivateKey,
  vapidSubject: env.VAPID_SUBJECT ?? 'mailto:admin@localhost',
  reminder1: env.REMINDER_1 ?? '20:00',
  reminder2: env.REMINDER_2 ?? '21:30',
  maxUploadMb: Number(env.MAX_UPLOAD_MB ?? 500),
  dbPath: resolve(dataDir, 'db/app.db'),
  originalsDir: resolve(dataDir, 'originals'),
  thumbsDir: resolve(dataDir, 'thumbs'),
  teasersDir: resolve(dataDir, 'teasers'),
  tmpDir: resolve(dataDir, 'tmp'),
  webDir: existsSync(packagedWebDir) ? packagedWebDir : localWebDir,
};
