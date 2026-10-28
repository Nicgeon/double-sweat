import { describe, expect, it } from 'vitest';
import {
  addDays,
  addWeeks,
  isLocalDate,
  isWeekClosed,
  localDateAt,
  nextWeekStart,
  positionInWeek,
  startOfLocalDay,
  weekDays,
  weekEndInstant,
  weekStartAt,
  weekStartInstant,
  weekStartOf,
} from '../src/domain/weeks.js';
import { HOUR } from '../src/util/time.js';

const at = (iso: string) => new Date(iso).getTime();

describe('Kalenderrechnung', () => {
  it('Woche beginnt am Montag', () => {
    expect(weekStartOf('2026-03-02')).toBe('2026-03-02'); // Montag
    expect(weekStartOf('2026-03-04')).toBe('2026-03-02'); // Mittwoch
    expect(weekStartOf('2026-03-08')).toBe('2026-03-02'); // Sonntag gehört noch zur Woche
    expect(weekStartOf('2026-03-09')).toBe('2026-03-09');
  });

  it('funktioniert über Monats- und Jahresgrenzen sowie Schaltjahre', () => {
    expect(weekStartOf('2026-01-01')).toBe('2025-12-29'); // Donnerstag
    expect(weekStartOf('2024-03-01')).toBe('2024-02-26'); // Schaltjahr
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
    expect(addWeeks('2025-12-29', 1)).toBe('2026-01-05');
    expect(addWeeks('2026-03-02', -1)).toBe('2026-02-23');
  });

  it('liefert sieben Tage von Montag bis Sonntag', () => {
    expect(weekDays('2026-03-02')).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
    ]);
  });

  it('validiert Datumsangaben', () => {
    expect(isLocalDate('2026-02-28')).toBe(true);
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('02.03.2026')).toBe(false);
    expect(isLocalDate('2026-3-2')).toBe(false);
    expect(() => weekStartOf('kaputt')).toThrow(RangeError);
  });

  it('Position in der Woche', () => {
    expect(positionInWeek('2026-03-02')).toEqual({ dayIndex: 0, daysLeftInclToday: 7 });
    expect(positionInWeek('2026-03-08')).toEqual({ dayIndex: 6, daysLeftInclToday: 1 });
  });
});

describe('Lokaler Tag je Zeitzone', () => {
  it('derselbe Zeitpunkt ist je nach Zeitzone ein anderer Kalendertag', () => {
    const instant = at('2026-03-02T23:30:00Z'); // Montag 23:30 UTC
    expect(localDateAt(instant, 'UTC')).toBe('2026-03-02');
    expect(localDateAt(instant, 'Europe/Berlin')).toBe('2026-03-03'); // 00:30 am Dienstag
    expect(localDateAt(instant, 'America/Los_Angeles')).toBe('2026-03-02'); // 15:30
    expect(localDateAt(instant, 'Pacific/Auckland')).toBe('2026-03-03'); // 12:30 am Dienstag
    expect(localDateAt(instant, 'Pacific/Kiritimati')).toBe('2026-03-03'); // UTC+14
    expect(localDateAt(instant, 'Asia/Kolkata')).toBe('2026-03-03'); // +5:30 → 05:00
  });

  it('Halbstunden-Offset: Kolkata wechselt erst um 18:30 UTC den Tag', () => {
    expect(localDateAt(at('2026-03-02T18:29:59Z'), 'Asia/Kolkata')).toBe('2026-03-02');
    expect(localDateAt(at('2026-03-02T18:30:00Z'), 'Asia/Kolkata')).toBe('2026-03-03');
  });

  it('Sonntag spät lokal ist noch die alte Woche, Montag 00:00 lokal die neue', () => {
    expect(weekStartAt(at('2026-03-08T22:59:59Z'), 'Europe/Berlin')).toBe('2026-03-02'); // 23:59:59 Sonntag
    expect(weekStartAt(at('2026-03-08T23:00:00Z'), 'Europe/Berlin')).toBe('2026-03-09'); // 00:00 Montag
  });

  it('wirft bei ungültiger Zeitzone', () => {
    expect(() => localDateAt(Date.now(), 'Mars/Olympus')).toThrow(RangeError);
  });
});

describe('Wochengrenzen und Zeitumstellung', () => {
  it('normale Woche in Berlin hat 168 Stunden', () => {
    const start = weekStartInstant('2026-03-02', 'Europe/Berlin');
    const end = weekEndInstant('2026-03-02', 'Europe/Berlin');
    expect(start).toBe(at('2026-03-01T23:00:00Z'));
    expect((end - start) / HOUR).toBe(168);
  });

  it('Frühjahrs-Umstellung (29.03.2026, Berlin): Woche hat 167 Stunden', () => {
    const start = weekStartInstant('2026-03-23', 'Europe/Berlin');
    const end = weekEndInstant('2026-03-23', 'Europe/Berlin');
    expect((end - start) / HOUR).toBe(167);
    expect(end).toBe(at('2026-03-29T22:00:00Z')); // Montag 00:00 MESZ
  });

  it('Herbst-Umstellung (25.10.2026, Berlin): Woche hat 169 Stunden', () => {
    const start = weekStartInstant('2026-10-19', 'Europe/Berlin');
    const end = weekEndInstant('2026-10-19', 'Europe/Berlin');
    expect((end - start) / HOUR).toBe(169);
    expect(end).toBe(at('2026-10-25T23:00:00Z')); // Montag 00:00 MEZ
  });

  it('am Umstellungstag selbst ist der lokale Tag 23 bzw. 25 Stunden lang', () => {
    const hours = (d: string, z: string) =>
      (startOfLocalDay(addDays(d, 1), z) - startOfLocalDay(d, z)) / HOUR;
    expect(hours('2026-03-29', 'Europe/Berlin')).toBe(23);
    expect(hours('2026-10-25', 'Europe/Berlin')).toBe(25);
  });

  it('Südhalbkugel: Auckland stellt im September um (27.09.2026)', () => {
    const start = weekStartInstant('2026-09-21', 'Pacific/Auckland');
    const end = weekEndInstant('2026-09-21', 'Pacific/Auckland');
    expect((end - start) / HOUR).toBe(167);
  });

  it('Los Angeles: Woche mit Umstellung (08.03.2026) hat 167 Stunden', () => {
    const start = weekStartInstant('2026-03-02', 'America/Los_Angeles');
    const end = weekEndInstant('2026-03-02', 'America/Los_Angeles');
    expect((end - start) / HOUR).toBe(167);
  });

  it('Zeitzonen ohne Umstellung und mit ungewöhnlichem Offset: immer 168 Stunden', () => {
    for (const zone of ['Asia/Kolkata', 'Pacific/Kiritimati', 'UTC', 'Asia/Kathmandu']) {
      const start = weekStartInstant('2026-03-02', zone);
      const end = weekEndInstant('2026-03-02', zone);
      expect((end - start) / HOUR, zone).toBe(168);
    }
    expect(weekStartInstant('2026-03-02', 'Asia/Kolkata')).toBe(at('2026-03-01T18:30:00Z'));
    expect(weekStartInstant('2026-03-02', 'Pacific/Kiritimati')).toBe(at('2026-03-01T10:00:00Z'));
  });

  it('Mitternachts-Lücke: Havanna stellt um 00:00 auf 01:00 (08.03.2026), der Tag beginnt um 01:00', () => {
    const start = startOfLocalDay('2026-03-08', 'America/Havana');
    expect(new Date(start).toISOString()).toBe('2026-03-08T05:00:00.000Z'); // 01:00 Ortszeit (UTC-4)
    expect(localDateAt(start, 'America/Havana')).toBe('2026-03-08');
    expect(localDateAt(start - 1, 'America/Havana')).toBe('2026-03-07');
    // Sonntag 08.03. gehört in die Woche ab Montag 02.03.; das Wochenende fällt auf den 09.03.
    expect(weekStartOf('2026-03-08')).toBe('2026-03-02');
    expect(weekEndInstant('2026-03-02', 'America/Havana')).toBe(
      startOfLocalDay('2026-03-09', 'America/Havana'),
    );
  });

  it('Mitternachts-Lücke am Sonntag: Beirut (29.03.2026), der Tag beginnt um 01:00, die Woche endet normal', () => {
    expect(new Date(startOfLocalDay('2026-03-29', 'Asia/Beirut')).toISOString()).toBe(
      '2026-03-28T22:00:00.000Z',
    );
    expect(weekStartAt(startOfLocalDay('2026-03-29', 'Asia/Beirut'), 'Asia/Beirut')).toBe(
      '2026-03-23',
    );
    expect(new Date(weekEndInstant('2026-03-23', 'Asia/Beirut')).toISOString()).toBe(
      '2026-03-29T21:00:00.000Z',
    ); // 00:00 Montag, UTC+3
  });

  it('Mitternachts-Lücke genau am Montag (Teheran 21.03.2016): neue Woche beginnt um 01:00, nichts geht verloren', () => {
    const zone = 'Asia/Tehran';
    const end = weekEndInstant('2016-03-14', zone);
    expect(new Date(end).toISOString()).toBe('2016-03-20T20:30:00.000Z'); // 01:00 Ortszeit statt 00:00
    expect(weekStartAt(end - 1, zone)).toBe('2016-03-14'); // letzte Sekunde: alte Woche
    expect(weekStartAt(end, zone)).toBe('2016-03-21'); // ab 01:00: neue Woche
    expect(isWeekClosed('2016-03-14', zone, end)).toBe(true);
    expect(isWeekClosed('2016-03-14', zone, end - 1)).toBe(false);
  });

  it('isWeekClosed: exakt am Wochenende kippt die Woche', () => {
    const end = weekEndInstant('2026-03-02', 'Europe/Berlin');
    expect(isWeekClosed('2026-03-02', 'Europe/Berlin', end - 1)).toBe(false);
    expect(isWeekClosed('2026-03-02', 'Europe/Berlin', end)).toBe(true);
  });

  it('Partner in verschiedenen Zeitzonen schließen ihre Woche zu verschiedenen Zeitpunkten', () => {
    const berlin = weekEndInstant('2026-03-02', 'Europe/Berlin');
    const la = weekEndInstant('2026-03-02', 'America/Los_Angeles');
    const auckland = weekEndInstant('2026-03-02', 'Pacific/Auckland');
    expect(auckland).toBeLessThan(berlin);
    expect(berlin).toBeLessThan(la);
    // Zwischen Auckland und Berlin ist es für Ben schon eine neue Woche, für Anna noch nicht
    const between = berlin - 1;
    expect(weekStartAt(between, 'Pacific/Auckland')).toBe('2026-03-09');
    expect(weekStartAt(between, 'Europe/Berlin')).toBe('2026-03-02');
  });

  it('nextWeekStart liefert den kommenden Montag', () => {
    expect(nextWeekStart(at('2026-03-04T12:00:00Z'), 'Europe/Berlin')).toBe('2026-03-09');
    expect(nextWeekStart(at('2026-03-08T23:30:00Z'), 'Europe/Berlin')).toBe('2026-03-16'); // schon Montag lokal
  });
});
