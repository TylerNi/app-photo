import { db } from './db.js';
import { localDay, nextMidnightUtc } from './day.js';
import type { MediaRow } from './media/storage.js';
import type { Streak } from './types.js';

const completeDaysStmt = db.prepare(`
  SELECT local_day
  FROM media
  WHERE source = 'snap'
  GROUP BY local_day
  HAVING COUNT(DISTINCT owner) = 2
  ORDER BY local_day DESC
`);

const snapOfDayStmt = db.prepare(`
  SELECT * FROM media
  WHERE source = 'snap' AND owner = ? AND local_day = ?
  ORDER BY created_at DESC, id DESC
  LIMIT 1
`);

const hasSnapStmt = db.prepare(
  "SELECT 1 FROM media WHERE source = 'snap' AND owner = ? AND local_day = ? LIMIT 1",
);

function previousDay(day: string): string {
  const instant = new Date(`${day}T00:00:00Z`).getTime() - 86400000;
  return new Date(instant).toISOString().slice(0, 10);
}

export function completeDays(): string[] {
  return (completeDaysStmt.all() as { local_day: string }[]).map((row) => row.local_day);
}

export function computeStreak(now: Date = new Date()): Streak {
  const days = completeDays();
  const complete = new Set(days);
  const today = localDay(now);
  const todayComplete = complete.has(today);

  let cursor = todayComplete ? today : previousDay(today);
  let current = 0;
  while (complete.has(cursor)) {
    current += 1;
    cursor = previousDay(cursor);
  }

  const atRisk = current > 0 && !todayComplete;

  return {
    current,
    total: days.length,
    atRisk,
    deadline: atRisk ? nextMidnightUtc(now) : null,
    todayComplete,
  };
}

export function snapOfDay(profile: string, day: string): MediaRow | undefined {
  return snapOfDayStmt.get(profile, day) as MediaRow | undefined;
}

export function hasSnap(profile: string, day: string): boolean {
  return hasSnapStmt.get(profile, day) !== undefined;
}
