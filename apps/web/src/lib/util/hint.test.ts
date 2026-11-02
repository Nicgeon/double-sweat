import { describe, expect, it } from 'vitest';
import type { Dashboard } from '#lib/api/client.ts';
import { betMissing, pickHint, startGuide } from './hint.ts';

type Overrides = {
  /** Einsatz gilt in der laufenden Woche (Standard: ja) */
  bet?: string | null;
  betUpcoming?: { text: string; effectiveFrom: string } | null;
  goalDays?: number | null;
  nextGoalDays?: number | null;
  teamFull?: boolean;
  owed?: number;
  earned?: number;
  mineInFeed?: boolean;
};

/** Minimales Dashboard mit den Feldern, die Hinweis und Starthilfe lesen. */
function dashboard(o: Overrides = {}): Dashboard {
  const me = {
    userId: 'u1',
    isMe: true,
    goalDays: o.goalDays === undefined ? 3 : o.goalDays,
    nextGoalDays: o.nextGoalDays === undefined ? null : o.nextGoalDays,
    weekStart: '2026-11-02',
  };
  return {
    members: [me],
    team: { full: o.teamFull ?? true },
    bet: o.bet === undefined ? 'Kinoabend' : o.bet,
    betUpcoming: o.betUpcoming ?? null,
    debts: { owe: 0, owed: o.owed ?? 0 },
    rewards: { earned: o.earned ?? 0, toGive: 0 },
    feed: o.mineInFeed ? [{ userId: 'u1' }] : [],
  } as unknown as Dashboard;
}

describe('pickHint', () => {
  it('zeigt nichts, wenn nichts ansteht', () => {
    expect(pickHint(dashboard())).toBeNull();
  });

  it('meldet Einlösungen, die auf dich warten (Schulden und Belohnungen zusammen)', () => {
    expect(pickHint(dashboard({ owed: 1, earned: 2 }))).toEqual({ kind: 'open', count: 3 });
  });

  it('weist darauf hin, dass ein neues Ziel erst ab Montag gilt', () => {
    expect(pickHint(dashboard({ goalDays: null, nextGoalDays: 4 }))).toEqual({
      kind: 'goalNext',
      days: 4,
      weekStart: '2026-11-02',
    });
  });

  it('nennt Einlösungen vor dem Zielhinweis (höchstens ein Hinweis)', () => {
    expect(pickHint(dashboard({ goalDays: null, nextGoalDays: 4, earned: 1 }))?.kind).toBe('open');
  });
});

describe('startGuide', () => {
  it('erscheint, solange das Ziel fehlt', () => {
    const g = startGuide(dashboard({ goalDays: null, nextGoalDays: null }));
    expect(g?.visible).toBe(true);
    expect(g?.steps.map((s) => s.done)).toEqual([false, true, true, false]);
  });

  it('erscheint, solange der Partner fehlt', () => {
    const g = startGuide(dashboard({ teamFull: false }));
    expect(g?.visible).toBe(true);
    expect(g?.steps.map((s) => s.done)).toEqual([true, true, false, false]);
  });

  it('zählt ein Ziel, das erst ab Montag gilt, als gesetzt', () => {
    const g = startGuide(dashboard({ goalDays: null, nextGoalDays: 3 }));
    expect(g?.steps[0]?.done).toBe(true);
    expect(g?.visible).toBe(false);
  });

  it('führt den Einsatz als Schritt auf, hält die Starthilfe aber nicht allein deswegen offen', () => {
    const g = startGuide(dashboard({ bet: null }));
    expect(g?.steps.find((s) => s.id === 'bet')?.done).toBe(false);
    expect(g?.visible).toBe(false); // Pflicht wird er erst mit der ersten vollen Woche (Dialog der App)
    expect(betMissing(dashboard({ bet: null }))).toBe(true);
  });

  it('zählt einen vorgemerkten Einsatz als festgelegt', () => {
    const d = dashboard({ bet: null, betUpcoming: { text: 'Kino', effectiveFrom: '2026-11-09' } });
    expect(betMissing(d)).toBe(false);
    expect(startGuide(d)?.visible).toBe(false);
  });

  it('verschwindet, sobald Ziel und Partner da sind, auch ohne ersten Check-in', () => {
    const g = startGuide(dashboard());
    expect(g?.visible).toBe(false);
    expect(g?.steps[3]?.done).toBe(false);
  });

  it('hakt den ersten Check-in ab, sobald ein eigenes Foto im Feed liegt', () => {
    expect(startGuide(dashboard({ mineInFeed: true }))?.steps[3]?.done).toBe(true);
  });
});
