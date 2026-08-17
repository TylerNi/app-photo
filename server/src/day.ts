import { config } from './config.js';

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.appTz,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const instantFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.appTz,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function offsetMs(instant: number): number {
  const parts = instantFormat.formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)!.value);
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  );
  return asUtc - instant;
}

export function localDay(date: Date = new Date()): string {
  return dayFormat.format(date);
}

export function localToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): string {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = asUtc - offsetMs(asUtc);
  instant = asUtc - offsetMs(instant);
  return new Date(instant).toISOString();
}

export function nextMidnightUtc(date: Date = new Date()): string {
  const [year, month, day] = localDay(date).split('-').map(Number);
  const localMidnight = Date.UTC(year, month - 1, day + 1);
  let instant = localMidnight - offsetMs(localMidnight);
  instant = localMidnight - offsetMs(instant);
  return new Date(instant).toISOString();
}
