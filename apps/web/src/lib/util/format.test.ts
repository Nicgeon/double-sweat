import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from '#lib/i18n/index.svelte.ts';
import {
  addDays,
  dayLabel,
  dayName,
  isoWeek,
  longDate,
  relative,
  shortDate,
  weekdayDate,
  weekLabel,
} from './format.ts';

describe('Datumsformate', () => {
  it('berechnet die ISO-Kalenderwoche', () => {
    expect(isoWeek('2026-10-26')).toBe(44);
    expect(isoWeek('2026-03-02')).toBe(10);
    expect(isoWeek('2026-12-28')).toBe(53);
    expect(isoWeek('2027-01-04')).toBe(1);
    expect(isoWeek('2024-12-30')).toBe(1);
  });

  it('formatiert deutsche Kurzformen', () => {
    expect(shortDate('2026-10-26')).toBe('26. Okt.');
    expect(shortDate('2026-03-02')).toBe('2. März');
    expect(weekdayDate('2026-10-26')).toBe('Mo, 26. Okt.');
    expect(longDate('2026-10-26')).toBe('Montag, 26. Oktober');
  });

  it('rechnet Tage über Monats- und Zeitumstellungsgrenzen', () => {
    expect(addDays('2026-10-26', 6)).toBe('2026-11-01');
    expect(addDays('2026-03-23', 7)).toBe('2026-03-30');
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
  });

  it('beschriftet die Woche', () => {
    expect(weekLabel('2026-10-26')).toBe('KW 44 · 26. Okt. – 1. Nov.');
  });

  it('beschreibt Zeitabstände', () => {
    const now = Date.parse('2026-10-28T12:00:00Z');
    expect(relative(now - 20_000, now)).toBe('gerade eben');
    expect(relative(now - 5 * 60_000, now)).toBe('vor 5 Min.');
    expect(relative(now - 3 * 3_600_000, now)).toBe('vor 3 Std.');
    expect(relative(now - 24 * 3_600_000, now)).toBe('gestern');
    expect(relative(now - 4 * 24 * 3_600_000, now)).toBe('vor 4 Tagen');
  });
});

describe('Datumsformate auf Englisch', () => {
  afterEach(() => i18n.set('de'));

  it('formatiert Datum, Woche und Zeitabstände in der gewählten Sprache', () => {
    i18n.set('en');
    expect(shortDate('2026-10-26')).toBe('Oct 26');
    expect(weekdayDate('2026-10-26')).toBe('Mon, Oct 26');
    expect(longDate('2026-10-26')).toBe('Monday, October 26');
    expect(weekLabel('2026-10-26')).toBe('Week 44 · Oct 26 – Nov 1');
    const now = Date.parse('2026-10-28T12:00:00Z');
    expect(relative(now - 20_000, now)).toBe('just now');
    expect(relative(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(relative(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(relative(now - 24 * 3_600_000, now)).toBe('yesterday');
    expect(relative(now - 4 * 24 * 3_600_000, now)).toBe('4 days ago');
  });

  it('Wochentage der Wochenleiste folgen der Sprache', () => {
    i18n.set('de');
    expect([0, 1, 6].map(dayLabel)).toEqual(['Mo', 'Di', 'So']);
    expect([0, 6].map(dayName)).toEqual(['Montag', 'Sonntag']);
    i18n.set('en');
    expect([0, 1, 6].map(dayLabel)).toEqual(['Mo', 'Tu', 'Su']);
    expect([0, 6].map(dayName)).toEqual(['Monday', 'Sunday']);
  });
});
