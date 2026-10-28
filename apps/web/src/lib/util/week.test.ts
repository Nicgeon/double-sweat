import { describe, expect, it } from 'vitest';
import type { DashboardMember } from '#lib/api/client.ts';
import { laneOf } from './week.ts';

const day = (checkedIn: boolean, isToday = false, isFuture = false) => ({
  date: '2026-10-26',
  checkedIn,
  isToday,
  isFuture,
});

const member = (over: Partial<DashboardMember> = {}): DashboardMember =>
  ({
    userId: 'u1',
    displayName: 'Anna',
    slot: 1,
    color: 'ember',
    isMe: true,
    timezone: 'Europe/Berlin',
    weekStart: '2026-10-26',
    weekEndsAt: 0,
    goalDays: 4,
    doneDays: 2,
    checkedInToday: false,
    remainingDays: 5,
    neededDays: 2,
    status: 'on_track',
    days: [
      day(true),
      day(true),
      day(false, true),
      ...Array.from({ length: 4 }, () => day(false, false, true)),
    ],
    ...over,
  }) as DashboardMember;

describe('laneOf (Anzeigetafel)', () => {
  it('bildet Tage auf Zustände der Wochenleiste ab', () => {
    const lane = laneOf(member());
    expect(lane.days.map((d) => d.state)).toEqual([
      'done',
      'done',
      'today',
      'future',
      'future',
      'future',
      'future',
    ]);
    expect(lane.days.map((d) => d.label)).toEqual(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']);
  });

  it('kennzeichnet vergangene Tage ohne Check-in als leer, nicht als Fehler', () => {
    const lane = laneOf(
      member({
        days: [day(false), day(true), ...Array.from({ length: 5 }, () => day(false, false, true))],
      }),
    );
    expect(lane.days[0]?.state).toBe('missed');
  });

  it.each([
    ['done', 'done', undefined],
    ['on_track', 'open', undefined],
    ['at_risk', 'risk', undefined],
    ['unreachable', 'missed', 'Nicht mehr erreichbar'],
    ['no_goal', 'open', 'Kein Ziel'],
  ] as const)('übersetzt den Status %s', (status, chip, label) => {
    const lane = laneOf(member({ status }));
    expect(lane.status).toBe(chip);
    expect(lane.statusLabel).toBe(label);
  });

  it('übernimmt Platz, Farbe und Ziel der Person', () => {
    const lane = laneOf(
      member({ slot: 2, color: 'orchid', goalDays: undefined as never, isMe: false }),
    );
    expect(lane).toMatchObject({ slot: 2, color: 'orchid', you: false, goal: null, name: 'Anna' });
  });
});
