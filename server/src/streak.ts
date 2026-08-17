import { db } from './db.js';
import { localDay, nextMidnightUtc } from './day.js';
import type { MediaRow } from './media/storage.js';
import type { Streak } from './types.js';

const completeDaysStmt = db.prepare(`
  SELECT local_day
  FROM media
  WHERE source = 'snap'
    AND local_day > COALESCE((SELECT day FROM streak_reset WHERE id = 1), '')
  GROUP BY local_day
  HAVING COUNT(DISTINCT owner) = 2
  ORDER BY local_day DESC
`);

const resetStreakStmt = db.prepare(`
  INSERT INTO streak_reset (id, day) VALUES (1, ?)
  ON CONFLICT(id) DO UPDATE SET day = excluded.day
`);

const snapsOfDayStmt = db.prepare(`
  SELECT * FROM media
  WHERE source = 'snap' AND owner = ? AND local_day = ?
  ORDER BY created_at ASC, id ASC
`);

const hasSnapStmt = db.prepare(
  "SELECT 1 FROM media WHERE source = 'snap' AND owner = ? AND local_day = ? LIMIT 1",
);

const lastSnapDayStmt = db.prepare(
  "SELECT local_day FROM media WHERE source = 'snap' AND owner = ? ORDER BY local_day DESC LIMIT 1",
);

const allSnapsStmt = db.prepare(`
  SELECT id, owner FROM media
  WHERE source = 'snap'
  ORDER BY created_at ASC, id ASC
`);

function previousDay(day: string): string {
  const instant = new Date(`${day}T00:00:00Z`).getTime() - 86400000;
  return new Date(instant).toISOString().slice(0, 10);
}

export function completeDays(): string[] {
  return (completeDaysStmt.all() as { local_day: string }[]).map((row) => row.local_day);
}

export function resetStreak(now: Date = new Date()): void {
  resetStreakStmt.run(localDay(now));
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

export function snapsOfDay(profile: string, day: string): MediaRow[] {
  return snapsOfDayStmt.all(profile, day) as MediaRow[];
}

export function hasSnap(profile: string, day: string): boolean {
  return hasSnapStmt.get(profile, day) !== undefined;
}

export function lastSnapDay(profile: string): string | undefined {
  return (lastSnapDayStmt.get(profile) as { local_day: string } | undefined)?.local_day;
}

export function lockedSnapIds(): string[] {
  const rows = allSnapsStmt.all() as { id: string; owner: string }[];
  let pending: string[] = [];
  let owner: string | null = null;

  for (const row of rows) {
    if (pending.length > 0 && row.owner !== owner) {
      pending = [];
      owner = null;
      continue;
    }
    pending.push(row.id);
    owner = row.owner;
  }

  return pending;
}
