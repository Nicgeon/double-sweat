const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' als lokales Datum (ohne Zeitzonenverschiebung). */
export function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12));
}

const fmt = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', ...options });
const short = fmt({ day: 'numeric', month: 'short' });
const weekday = fmt({ weekday: 'short', day: 'numeric', month: 'short' });
const long = fmt({ weekday: 'long', day: 'numeric', month: 'long' });

/** "26. Okt." */
export const shortDate = (date: string) =>
  short.format(parseLocalDate(date)).replace('Okt', 'Okt.').replace('..', '.');
/** "Mo, 26. Okt." */
export const weekdayDate = (date: string) =>
  weekday
    .format(parseLocalDate(date))
    .replace('..', '.')
    .replace(/^(\p{L}+)\./u, '$1');
/** "Montag, 26. Oktober" */
export const longDate = (date: string) => long.format(parseLocalDate(date));

export function addDays(date: string, days: number): string {
  return new Date(parseLocalDate(date).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** ISO-Kalenderwoche des Montags `weekStart`. */
export function isoWeek(weekStart: string): number {
  const d = parseLocalDate(weekStart);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return (
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / DAY_MS -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    )
  );
}

/** "KW 43 · 26. Okt. – 1. Nov." */
export function weekLabel(weekStart: string): string {
  return `KW ${isoWeek(weekStart)} · ${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 6))}`;
}

const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const dateTime = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
export const clockTime = (ms: number) => `${time.format(ms)} Uhr`;
export const dateAndTime = (ms: number) => dateTime.format(ms).replace('..', '.');

/** "vor 2 Std." */
export function relative(ms: number, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - ms) / 60_000));
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'gestern' : `vor ${days} Tagen`;
}

export const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
