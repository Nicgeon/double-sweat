import { afterEach, describe, expect, it } from 'vitest';
import type { Dashboard, DashboardMember } from '#lib/api/client.ts';
import { i18n } from '#lib/i18n/index.svelte.ts';
import { buildWidgetSnapshot } from './widget.ts';

const day = (checkedIn: boolean, isToday = false, isFuture = false) => ({
  date: '2026-10-26',
  checkedIn,
  isToday,
  isFuture,
});

const member = (over: Partial<DashboardMember>): DashboardMember =>
  ({
    userId: 'u',
    displayName: 'Anna',
    slot: 1,
    color: 'ember',
    isMe: true,
    weekStart: '2026-10-26',
    goalDays: 3,
    doneDays: 2,
    checkedInToday: false,
    status: 'on_track',
    days: [
      day(true),
      day(true),
      day(false, true),
      ...Array.from({ length: 4 }, () => day(false, false, true)),
    ],
    ...over,
  }) as DashboardMember;

const dash = (members: DashboardMember[]) => ({ members }) as unknown as Dashboard;

describe('Widget-Stand', () => {
  afterEach(() => i18n.set('de'));

  it('stellt mich zuerst, mit Fortschritt, Wochenleiste und Serie', () => {
    const ben = member({
      displayName: 'Ben',
      isMe: false,
      slot: 2,
      color: 'tide',
      goalDays: undefined as never,
    });
    const snap = buildWidgetSnapshot(
      dash([ben, member({})]),
      3,
      Date.parse('2026-10-28T17:04:00Z'),
    );
    expect(snap.streak).toBe(3);
    expect(snap.streakText).toBe('Wochen in Serie');
    expect(snap.todayText).toBe('Heute noch offen');
    expect(snap.todayShort).toBe('Offen');
    expect(snap.todayDone).toBe(false);
    expect(snap.weekLabel).toContain('KW 44');
    expect(snap.lanes.map((l) => l.name)).toEqual(['Anna (Du)', 'Ben']);
    expect(snap.lanes[0]?.progress).toBe('2 von 3 Tagen');
    expect(snap.lanes[0]?.days).toEqual([
      'done',
      'done',
      'today',
      'future',
      'future',
      'future',
      'future',
    ]);
    expect(snap.lanes[1]?.progress).toBe('kein Ziel');
    expect(snap.lanes[1]?.color).toBe('tide');
    expect(snap.lanes.map((l) => l.slot)).toEqual([1, 2]);
    expect(snap.lanes.map((l) => l.initials)).toEqual(['A', 'B']);
  });

  it('folgt der Sprache und meldet den heutigen Check-in', () => {
    i18n.set('en');
    const snap = buildWidgetSnapshot(dash([member({ checkedInToday: true })]), 1);
    expect(snap.todayText).toBe('Done today');
    expect(snap.todayDone).toBe(true);
    expect(snap.streakText).toBe('week in a row');
    expect(snap.lanes[0]?.name).toBe('Anna (you)');
  });

  it('bleibt klein genug für das Widget', () => {
    const snap = buildWidgetSnapshot(
      dash([member({}), member({ isMe: false, displayName: 'Ben' })]),
      12,
    );
    expect(JSON.stringify(snap).length).toBeLessThan(2000);
  });
});
