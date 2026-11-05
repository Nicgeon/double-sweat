import { describe, expect, it } from 'vitest';
import { groupByDay, type InboxItem, inboxLook } from './inbox.ts';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0).getTime();
const item = (id: string, createdAt: number, type = 'nudge'): InboxItem => ({
  id,
  type,
  title: 'Double Sweat',
  body: id,
  createdAt,
  read: false,
  link: null,
  data: null,
});

describe('groupByDay', () => {
  const now = at(2026, 11, 5, 18);

  it('teilt in Heute, Gestern und ältere Tage und behält die Reihenfolge', () => {
    const groups = groupByDay(
      [
        item('a', at(2026, 11, 5, 17)),
        item('b', at(2026, 11, 5, 9)),
        item('c', at(2026, 11, 4, 23)),
        item('d', at(2026, 11, 2)),
      ],
      now,
    );
    expect(groups.map((g) => [g.kind, g.key, g.items.map((i) => i.id)])).toEqual([
      ['today', '2026-11-05', ['a', 'b']],
      ['yesterday', '2026-11-04', ['c']],
      ['date', '2026-11-02', ['d']],
    ]);
  });

  it('fasst denselben Tag nur einmal zusammen und kommt mit leerem Postfach klar', () => {
    expect(groupByDay([], now)).toEqual([]);
    expect(
      groupByDay([item('a', at(2026, 10, 30, 20)), item('b', at(2026, 10, 30, 8))], now),
    ).toHaveLength(1);
  });

  it('über den Monatswechsel gilt der Vortag als gestern', () => {
    const groups = groupByDay([item('a', at(2026, 10, 31, 22))], at(2026, 11, 1, 9));
    expect(groups[0]?.kind).toBe('yesterday');
  });
});

describe('inboxLook', () => {
  it('gibt jeder Art ein Symbol; Reaktionen zeigen das Symbol der Reaktion', () => {
    expect(inboxLook('checkin', null)).toEqual({ icon: 'camera', tone: 'neutral' });
    expect(inboxLook('goal_reached', null).tone).toBe('done');
    expect(inboxLook('debt_created', null).tone).toBe('alert');
    expect(inboxLook('reaction', { kind: 'flame' }).icon).toBe('flame');
    expect(inboxLook('reaction', { kind: 'strong' }).icon).toBe('dumbbell');
    expect(inboxLook('reaction', null).icon).toBe('heart-pulse');
  });

  it('eine unbekannte Art (neuere Serverversion) bekommt die Glocke statt eines Fehlers', () => {
    expect(inboxLook('etwas_neues', null)).toEqual({ icon: 'bell', tone: 'neutral' });
  });
});
