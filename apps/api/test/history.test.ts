import { describe, expect, it } from 'vitest';
import { computeStreak, computeTeamStreak, type WeekOutcome } from '../src/domain/streaks.js';
import { settleDueWeeks } from '../src/modules/settlement/service.js';
import { createCouple, createTestEnv } from './helpers.js';
import { afterWeek, checkinDays, pair, W1, W2, W3 } from './scenario.js';

const out = (...flags: (boolean | null)[]): WeekOutcome[] =>
  flags.map((met, i) => ({ weekStart: `2026-01-${String(5 + i * 7).padStart(2, '0')}`, met }));

describe('Serien (Streaks)', () => {
  it('zählt aufeinanderfolgende erreichte Wochen', () => {
    expect(computeStreak(out(true, true, true))).toEqual({ current: 3, best: 3 });
    expect(computeStreak([])).toEqual({ current: 0, best: 0 });
  });

  it('eine verfehlte Woche beendet die Serie, die beste bleibt erhalten', () => {
    expect(computeStreak(out(true, true, false, true))).toEqual({ current: 1, best: 2 });
    expect(computeStreak(out(true, true, true, false))).toEqual({ current: 0, best: 3 });
  });

  it('nicht gewertete Wochen werden übersprungen', () => {
    expect(computeStreak(out(true, null, true))).toEqual({ current: 2, best: 2 });
    expect(computeStreak(out(null, null))).toEqual({ current: 0, best: 0 });
  });

  it('sortiert nach Wochenstart, nicht nach Reihenfolge der Eingabe', () => {
    expect(computeStreak([...out(true, false, true, true)].reverse())).toEqual({
      current: 2,
      best: 2,
    });
  });

  it('Team-Serie: nur Wochen, in denen beide erreicht haben', () => {
    expect(computeTeamStreak(out(true, true, true), out(true, false, true))).toEqual({
      current: 1,
      best: 1,
    });
    expect(computeTeamStreak(out(true, true), out(true, true))).toEqual({ current: 2, best: 2 });
  });

  it('Team-Serie: ist erst ein Partner abgerechnet, zählt die Woche noch nicht', () => {
    expect(computeTeamStreak(out(true, true, true), out(true, true))).toEqual({
      current: 2,
      best: 2,
    });
    expect(computeTeamStreak(out(false), out(true))).toEqual({ current: 0, best: 0 });
  });
});

describe('Historie', () => {
  it('ist ohne abgerechnete Wochen leer', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    expect((await anna.get('/history')).body).toEqual({
      weeks: [],
      streaks: {
        me: { current: 0, best: 0 },
        partner: { current: 0, best: 0 },
        team: { current: 0, best: 0 },
      },
      nextCursor: null,
    });
  });

  /** W1: beide ok · W2: Ben verfehlt · W3: beide ok */
  async function threeWeeks() {
    const ctx = await pair({ annaGoal: 2, benGoal: 2 });
    for (const [week, anna, ben] of [
      [W1, 2, 2],
      [W2, 2, 1],
      [W3, 3, 2],
    ] as const) {
      await checkinDays(ctx.env, ctx.anna, week, anna);
      await checkinDays(ctx.env, ctx.ben, week, ben);
    }
    ctx.env.clock.set(afterWeek(W3));
    settleDueWeeks(ctx.env.ctx);
    return ctx;
  }

  it('listet Wochen neueste zuerst mit Ergebnis beider Partner und Schuld', async () => {
    const { anna } = await threeWeeks();
    const { weeks } = (await anna.get('/history')).body;
    expect(weeks.map((w: { weekStart: string }) => w.weekStart)).toEqual([W3, W2, W1]);
    expect(weeks.map((w: { teamMet: boolean }) => w.teamMet)).toEqual([true, false, true]);
    const w2 = weeks[1];
    expect(
      w2.members.map((m: any) => [m.displayName, m.isMe, m.goalDays, m.doneDays, m.met]),
    ).toEqual([
      ['Anna', true, 2, 2, true],
      ['Ben', false, 2, 1, false],
    ]);
    expect(w2.members[0].debt).toMatchObject({ role: 'creditor', redeemed: false });
    expect(w2.members[1].debt).toMatchObject({ role: 'debtor', redeemed: false });
    expect(weeks[0].members.every((m: any) => m.debt === null)).toBe(true);
  });

  it('berechnet Serien aus Sicht des Betrachters', async () => {
    const { anna, ben } = await threeWeeks();
    expect((await anna.get('/history')).body.streaks).toEqual({
      me: { current: 3, best: 3 },
      partner: { current: 1, best: 1 },
      team: { current: 1, best: 1 },
    });
    const fromBen = (await ben.get('/history')).body.streaks;
    expect(fromBen.me).toEqual({ current: 1, best: 1 });
    expect(fromBen.partner).toEqual({ current: 3, best: 3 });
  });

  it('zeigt eingelöste Schulden als eingelöst', async () => {
    const { anna } = await threeWeeks();
    const debtId = (await anna.get('/debts')).body.debts[0].id;
    await anna.post(`/debts/${debtId}/redeem`);
    const w2 = (await anna.get('/history')).body.weeks[1];
    expect(w2.members[0].debt.redeemed).toBe(true);
  });

  it('blättert mit limit und before/nextCursor', async () => {
    const { anna } = await threeWeeks();
    const first = (await anna.get('/history?limit=2')).body;
    expect(first.weeks.map((w: any) => w.weekStart)).toEqual([W3, W2]);
    expect(first.nextCursor).toBe(W2);
    const second = (await anna.get(`/history?limit=2&before=${first.nextCursor}`)).body;
    expect(second.weeks.map((w: any) => w.weekStart)).toEqual([W1]);
    expect(second.nextCursor).toBeNull();
    expect((await anna.get('/history?limit=0')).status).toBe(400);
    expect((await anna.get('/history?limit=500')).status).toBe(400);
    expect((await anna.get('/history?before=gestern')).status).toBe(400);
  });

  it('eine noch nicht abgerechnete Partnerwoche (andere Zeitzone) hat teamMet = null', async () => {
    const { env, anna } = await pair({ annaTz: 'Europe/Berlin', benTz: 'Pacific/Auckland' });
    env.clock.set(Date.parse('2026-03-15T12:00:00Z')); // Auckland hat Woche 1 abgeschlossen, Berlin noch nicht
    await anna.get('/me');
    settleDueWeeks(env.ctx);
    const { weeks } = (await anna.get('/history')).body;
    expect(weeks).toHaveLength(1);
    expect(weeks[0].teamMet).toBeNull();
    expect(weeks[0].members.find((m: any) => m.isMe).met).toBeNull();
    expect(weeks[0].members.find((m: any) => !m.isMe).met).toBe(false);
  });

  it('zeigt nur das eigene Team', async () => {
    const { env } = await threeWeeks();
    const carla = env.client({ ip: '203.0.113.98' });
    await carla.registerFounder('carla@example.org', 'Carla');
    expect((await carla.get('/history')).body.weeks).toEqual([]);
    expect((await env.client().get('/history')).status).toBe(401);
  });

  it('gibt keine E-Mail-Adressen preis', async () => {
    const { anna } = await threeWeeks();
    expect(JSON.stringify((await anna.get('/history')).body)).not.toMatch(/@example/);
  });
});
