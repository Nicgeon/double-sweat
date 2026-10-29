import { currentLocale, type Locale, type MessageKey, t } from '#lib/i18n/index.svelte.ts';

const DAY_MS = 86_400_000;

/** 'YYYY-MM-DD' als lokales Datum (ohne Zeitzonenverschiebung). */
export function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12));
}

const formatters = new Map<string, Intl.DateTimeFormat>();
/** Intl-Formatierer je Sprache, einmal erzeugt. */
function formatter(
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
  utc = false,
): Intl.DateTimeFormat {
  const id = `${locale}|${utc}|${JSON.stringify(options)}`;
  let f = formatters.get(id);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, utc ? { timeZone: 'UTC', ...options } : options);
    formatters.set(id, f);
  }
  return f;
}

/** Deutsche Kurzformen vereinheitlichen: je nach ICU-Version fehlt oder verdoppelt sich der Abkürzungspunkt. */
const tidy = (locale: Locale, text: string, weekdayFirst: boolean): string => {
  if (locale !== 'de') return text;
  const fixed = text.replace('Okt', 'Okt.').replace('..', '.');
  return weekdayFirst ? fixed.replace(/^(\p{L}+)\./u, '$1') : fixed;
};

/** Datum formatieren; `abbreviated`: Kurzformen mit Abkürzungspunkt vereinheitlichen. */
const dateOf = (
  date: string,
  options: Intl.DateTimeFormatOptions,
  abbreviated: 'month' | 'weekday' | false,
) => {
  const locale = currentLocale();
  const text = formatter(locale, options, true).format(parseLocalDate(date));
  return abbreviated ? tidy(locale, text, abbreviated === 'weekday') : text;
};

/** "26. Okt." / "Oct 26" */
export const shortDate = (date: string) =>
  dateOf(date, { day: 'numeric', month: 'short' }, 'month');
/** "Mo, 26. Okt." / "Mon, Oct 26" */
export const weekdayDate = (date: string) =>
  dateOf(date, { weekday: 'short', day: 'numeric', month: 'short' }, 'weekday');
/** "Montag, 26. Oktober" / "Monday, October 26" */
export const longDate = (date: string) =>
  dateOf(date, { weekday: 'long', day: 'numeric', month: 'long' }, false);

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

/** "KW 43" / "Week 43" */
export const weekNumber = (weekStart: string) => t('week.number', { n: isoWeek(weekStart) });

/** "KW 43 · 26. Okt. – 1. Nov." */
export function weekLabel(weekStart: string): string {
  return `${weekNumber(weekStart)} · ${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 6))}`;
}

/** "19:00 Uhr" / "7:00 PM" */
export const clockTime = (ms: number) =>
  t('time.oClock', {
    time: formatter(currentLocale(), { hour: '2-digit', minute: '2-digit' }).format(ms),
  });

/** "26. Okt., 19:00" / "Oct 26, 7:00 PM" */
export const dateAndTime = (ms: number) => {
  const locale = currentLocale();
  const text = formatter(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ms);
  return locale === 'de' ? text.replace('..', '.') : text;
};

/** "vor 2 Std." / "2 h ago" */
export function relative(ms: number, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - ms) / 60_000));
  if (min < 1) return t('time.justNow');
  if (min < 60) return t('time.minutesAgo', { n: min });
  const hours = Math.round(min / 60);
  if (hours < 24) return t('time.hoursAgo', { n: hours });
  const days = Math.round(hours / 24);
  return days === 1 ? t('time.yesterday') : t('time.daysAgo', { n: days });
}

/** Kurzer Wochentag der Wochenleiste, Montag = 0 ("Mo"). */
export const dayLabel = (index: number) => t(`day.short.${index + 1}` as MessageKey);

/** Ausgeschriebener Wochentag, Montag = 0 ("Montag" / "Monday"). */
export const dayName = (index: number) =>
  formatter(currentLocale(), { weekday: 'long' }, true).format(
    new Date(Date.UTC(2024, 0, 1 + index, 12)),
  );
