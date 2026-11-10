import { describe, expect, it } from 'vitest';
import type { HealthSession } from '#lib/native/plugins.ts';
import { dateInZone, pendingSessions } from './health-suggest.ts';

const TZ = 'Europe/Berlin';
const H = 3600_000;
/** 10. November 2026, 12:00 Uhr in Berlin (11:00 UTC) */
const NOON = Date.UTC(2026, 10, 10, 11, 0);

const session = (id: string, endHoursFromNoon: number, minutes = 45): HealthSession => ({
  id,
  tag: 'laufen',
  endMs: NOON + endHoursFromNoon * H,
  startMs: NOON + endHoursFromNoon * H - minutes * 60_000,
  minutes,
});

const pending = (over: Partial<Parameters<typeof pendingSessions>[0]>) =>
  pendingSessions({
    sessions: [],
    used: [],
    checkins: [],
    today: '2026-11-10',
    timezone: TZ,
    ...over,
  }).map((s) => s.id);

describe('dateInZone', () => {
  it('rechnet in die Zeitzone der Person um', () => {
    // 23:30 Uhr UTC ist in Berlin schon der nächste Tag
    const ms = Date.UTC(2026, 10, 10, 23, 30);
    expect(dateInZone(ms, 'Europe/Berlin')).toBe('2026-11-11');
    expect(dateInZone(ms, 'UTC')).toBe('2026-11-10');
  });

  it('fällt bei einer ungültigen Zone auf das Gerät zurück, statt zu werfen', () => {
    expect(dateInZone(NOON, 'Kein/Ort')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('pendingSessions', () => {
  it('schlägt Trainings von heute vor, das jüngste zuerst', () => {
    const sessions = [session('früh', -4), session('spät', -1), session('mittag', -2)];
    expect(pending({ sessions })).toEqual(['spät', 'mittag', 'früh']);
  });

  it('lässt Trainings von gestern weg: ein Check-in gilt nur für heute', () => {
    // 12 Stunden vor Mittag ist 00:00 Uhr: gerade noch heute; eine Stunde früher gestern
    const sessions = [session('gestern', -12.5), session('heute', -11)];
    expect(pending({ sessions })).toEqual(['heute']);
  });

  it('lässt übernommene und ausgeblendete Trainings weg', () => {
    const sessions = [session('a', -3), session('b', -1)];
    expect(pending({ sessions, used: ['a'] })).toEqual(['b']);
  });

  it('ein Check-in nach dem Training deckt es zu', () => {
    const sessions = [session('lauf', -3)];
    expect(pending({ sessions, checkins: [NOON - 2.5 * H] })).toEqual([]);
    // auch ein Foto kurz vor dem Start (im Studio) gehört dazu
    expect(pending({ sessions, checkins: [NOON - 3 * H - 45 * 60_000 - 20 * 60_000] })).toEqual([]);
  });

  it('ein Check-in weit vor oder lange nach dem Training deckt es nicht zu', () => {
    const sessions = [session('lauf', -3)];
    expect(pending({ sessions, checkins: [NOON - 8 * H] })).toEqual(['lauf']);
    expect(pending({ sessions, checkins: [NOON + 3 * H] })).toEqual(['lauf']);
  });

  it('jeder Check-in verbraucht nur ein Training: Lauf am Morgen bleibt offen, wenn abends Kraft eingecheckt wurde', () => {
    const sessions = [session('lauf', -5), session('kraft', -1)];
    expect(pending({ sessions, checkins: [NOON - 0.5 * H] })).toEqual(['lauf']);
    // zwei Check-ins decken beide zu
    expect(pending({ sessions, checkins: [NOON - 4.5 * H, NOON - 0.5 * H] })).toEqual([]);
  });

  it('ein übernommenes Training verbraucht seinen Check-in und deckt kein anderes zu', () => {
    const sessions = [session('a', -2), session('b', -1.5)];
    // Der Check-in gehört zu "b" (übernommen); "a" liegt zwar im Fenster, bleibt aber offen
    expect(pending({ sessions, used: ['b'], checkins: [NOON - 1.4 * H] })).toEqual(['a']);
  });
});
