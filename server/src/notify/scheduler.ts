import { schedule } from 'node-cron';
import { config } from '../config.js';
import { db } from '../db.js';
import { localDay } from '../day.js';
import { computeStreak, hasSnap } from '../streak.js';
import { sendTo } from './push.js';
import { reminder1, reminder2 } from './texts.js';

const alreadySentStmt = db.prepare(
  'SELECT 1 FROM notification_log WHERE kind = ? AND recipient = ? AND local_day = ? LIMIT 1',
);

const logStmt = db.prepare(`
  INSERT INTO notification_log (kind, recipient, local_day, sent_at, count, tag)
  VALUES (?, ?, ?, ?, 1, ?)
`);

function cronExpression(value: string, name: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  const hours = match ? Number(match[1]) : -1;
  const minutes = match ? Number(match[2]) : -1;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    process.stderr.write(
      `Configuration invalide, le serveur ne peut pas démarrer :\n  - ${name} doit être une heure au format HH:MM.\n`,
    );
    process.exit(1);
  }

  return `${minutes} ${hours} * * *`;
}

async function runReminder(kind: 'reminder1' | 'reminder2'): Promise<void> {
  const day = localDay();
  const streak = computeStreak().current;

  for (const profile of config.profiles) {
    if (hasSnap(profile, day)) continue;
    if (alreadySentStmt.get(kind, profile, day) !== undefined) continue;

    const other = config.profiles.find((name) => name !== profile) ?? profile;
    const payload = kind === 'reminder1' ? reminder1(streak, other) : reminder2(streak);

    await sendTo(profile, payload);
    logStmt.run(kind, profile, day, new Date().toISOString(), payload.tag);
  }
}

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  schedule(
    cronExpression(config.reminder1, 'REMINDER_1'),
    () => {
      void runReminder('reminder1');
    },
    { timezone: config.appTz },
  );

  schedule(
    cronExpression(config.reminder2, 'REMINDER_2'),
    () => {
      void runReminder('reminder2');
    },
    { timezone: config.appTz },
  );
}

startScheduler();
