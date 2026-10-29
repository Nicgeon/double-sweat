import { DateTime } from 'luxon';

/** Kalendertag in der Zeitzone eines Nutzers, Format YYYY-MM-DD. */
export type LocalDate = string;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(value: string): value is LocalDate {
  return DATE_PATTERN.test(value) && DateTime.fromISO(value, { zone: 'utc' }).isValid;
}

function assertLocalDate(value: string): LocalDate {
  if (!isLocalDate(value)) throw new RangeError(`Kein gültiges Datum (YYYY-MM-DD): ${value}`);
  return value;
}

function calendar(date: LocalDate): DateTime {
  return DateTime.fromISO(assertLocalDate(date), { zone: 'utc' });
}

/** Kalendertag, an dem der Zeitpunkt in der Zeitzone liegt. */
export function localDateAt(instant: number, zone: string): LocalDate {
  const date = DateTime.fromMillis(instant, { zone }).toISODate();
  if (!date) throw new RangeError(`Ungültige Zeitzone: ${zone}`);
  return date;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return calendar(date).plus({ days }).toISODate() as LocalDate;
}

export const addWeeks = (date: LocalDate, weeks: number): LocalDate => addDays(date, weeks * 7);

/** Montag der Woche, in die das Datum fällt. Die Woche beginnt immer montags. */
export function weekStartOf(date: LocalDate): LocalDate {
  const day = calendar(date);
  return day.minus({ days: day.weekday - 1 }).toISODate() as LocalDate;
}

/** Montag der Woche, in der der Zeitpunkt für diese Zeitzone liegt. */
export function weekStartAt(instant: number, zone: string): LocalDate {
  return weekStartOf(localDateAt(instant, zone));
}

/** Die sieben Kalendertage einer Woche (Montag bis Sonntag). */
export function weekDays(weekStart: LocalDate): LocalDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/**
 * Beginn eines Kalendertags als Zeitpunkt. Fällt Mitternacht in eine Zeitumstellung (der Tag beginnt
 * dann z. B. um 01:00), liefert Luxon den ersten tatsächlich existierenden Zeitpunkt des Tages.
 */
export function startOfLocalDay(date: LocalDate, zone: string): number {
  const start = DateTime.fromISO(assertLocalDate(date), { zone }).startOf('day');
  if (!start.isValid) throw new RangeError(`Ungültige Zeitzone: ${zone}`);
  return start.toMillis();
}

export const weekStartInstant = (weekStart: LocalDate, zone: string): number =>
  startOfLocalDay(weekStart, zone);

/** Ende der Woche = Beginn des nächsten Montags (exklusiv). Wochen können 167 bis 169 Stunden lang sein. */
export function weekEndInstant(weekStart: LocalDate, zone: string): number {
  return startOfLocalDay(addWeeks(weekStart, 1), zone);
}

export const isWeekClosed = (weekStart: LocalDate, zone: string, now: number): boolean =>
  now >= weekEndInstant(weekStart, zone);

/** Montag der kommenden Woche. */
export const nextWeekStart = (instant: number, zone: string): LocalDate =>
  addWeeks(weekStartAt(instant, zone), 1);

export interface WeekProgressPosition {
  /** 0 = Montag … 6 = Sonntag */
  dayIndex: number;
  /** Verbleibende Tage inklusive heute. */
  daysLeftInclToday: number;
}

export function positionInWeek(today: LocalDate): WeekProgressPosition {
  const dayIndex = calendar(today).weekday - 1;
  return { dayIndex, daysLeftInclToday: 7 - dayIndex };
}

/** Erster Wochenstart, der nach der Vervollständigung des Teams beginnt. Frühere Wochen zählen nicht. */
export function firstScoredWeek(fullSince: number, zone: string): LocalDate {
  const week = weekStartAt(fullSince, zone);
  return weekStartInstant(week, zone) >= fullSince ? week : addWeeks(week, 1);
}
