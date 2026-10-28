import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { settleDueWeeks } from '../src/modules/settlement/service.js';
import { createCouple, createTestEnv, PASSWORD } from './helpers.js';
import { afterWeek, checkinDays, noon, pair, W1, W2, W3 } from './scenario.js';

describe('Wetteinsatz', () => {
  it('ohne Einsatz ist alles leer; Freitext wird gespeichert und getrimmt', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    expect((await anna.get('/bets')).body).toEqual({ current: null, upcoming: null });
    const res = await anna.put('/bets', { text: '  Der Verlierer kocht Abendessen  ' });
    expect(res.status).toBe(200);
    // Gilt erst ab der kommenden Woche
    expect(res.body).toEqual({
      current: null,
      upcoming: { text: 'Der Verlierer kocht Abendessen', effectiveFrom: '2026-03-09' },
    });
    expect((await ben.get('/bets')).body.upcoming.text).toBe('Der Verlierer kocht Abendessen');
  });

  it('die Änderung greift erst ab dem nächsten Montag; die laufende Woche behält den alten Einsatz', async () => {
    const { env, anna } = await pair({ bet: 'Kaffee' });
    env.clock.set(noon(W1));
    expect((await anna.get('/bets')).body).toEqual({ current: 'Kaffee', upcoming: null });
    const changed = await anna.put('/bets', { text: 'Massage' });
    expect(changed.body).toEqual({
      current: 'Kaffee',
      upcoming: { text: 'Massage', effectiveFrom: W2 },
    });
    env.clock.set(noon(W2));
    expect((await anna.get('/bets')).body).toEqual({ current: 'Massage', upcoming: null });
  });

  it('mehrere Änderungen vor Inkrafttreten überschreiben sich', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    await anna.put('/bets', { text: 'A' });
    await ben.put('/bets', { text: 'B' });
    expect((await anna.get('/bets')).body.upcoming.text).toBe('B');
    expect(
      (env.ctx.db.$client.prepare('SELECT COUNT(*) AS n FROM bets').get() as { n: number }).n,
    ).toBe(1);
  });

  it('gilt erst, wenn die Woche bei beiden Partnern noch nicht begonnen hat (verschiedene Zeitzonen)', async () => {
    const { env, anna } = await pair({
      annaTz: 'Europe/Berlin',
      benTz: 'Pacific/Auckland',
      bet: null,
    });
    // So 15.03. 12:00 UTC: Berlin noch Woche 03-09, Auckland (UTC+13) bereits Woche 03-16
    env.clock.set(Date.parse('2026-03-15T12:00:00Z'));
    await anna.get('/me');
    const res = await anna.put('/bets', { text: 'Pizza' });
    expect(res.body.upcoming.effectiveFrom).toBe('2026-03-23');
  });

  it('prüft Länge und Inhalt, braucht Team und Anmeldung', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    expect((await anna.put('/bets', { text: '   ' })).status).toBe(400);
    expect((await anna.put('/bets', { text: 'x'.repeat(141) })).status).toBe(400);
    expect((await anna.put('/bets', { text: 'x'.repeat(140) })).status).toBe(200);
    expect((await env.client().get('/bets')).status).toBe(401);
    await anna.delete('/team', { password: PASSWORD });
    expect((await anna.get('/bets')).status).toBe(403);
  });

  it('Einsatz ist reiner Text: Markup bleibt unverändert und wird nie interpretiert', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    const payload = '<img src=x onerror=alert(1)> {{7*7}}';
    await anna.put('/bets', { text: payload });
    expect((await anna.get('/bets')).body.upcoming.text).toBe(payload);
  });
});

describe('Schulden', () => {
  /** Woche 1 abgerechnet: Anna erreicht, Ben verfehlt → Ben schuldet Anna. */
  async function withDebt() {
    const ctx = await pair();
    await checkinDays(ctx.env, ctx.anna, W1, 3);
    await checkinDays(ctx.env, ctx.ben, W1, 1);
    ctx.env.clock.set(afterWeek(W1));
    settleDueWeeks(ctx.env.ctx);
    const owed = (await ctx.anna.get('/debts')).body.debts[0];
    return { ...ctx, id: owed.id as string };
  }

  it('zeigt jedem Partner die Schuld aus seiner Sicht', async () => {
    const { anna, ben, id } = await withDebt();
    const a = (await anna.get('/debts')).body.debts;
    const b = (await ben.get('/debts')).body.debts;
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      id,
      direction: 'owed',
      debtorName: 'Ben',
      creditorName: 'Anna',
      betText: 'Der Verlierer kocht',
      weekStart: W1,
      redeemedAt: null,
    });
    expect(b[0]).toMatchObject({ id, direction: 'owe' });
  });

  it('nur der Gläubiger kann die Schuld einlösen; der Schuldner nicht', async () => {
    const { anna, ben, id } = await withDebt();
    const denied = await ben.post(`/debts/${id}/redeem`);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('not_creditor');
    expect((await ben.get('/debts')).body.debts).toHaveLength(1); // unverändert offen
    const ok = await anna.post(`/debts/${id}/redeem`);
    expect(ok.status).toBe(200);
    expect(ok.body.debt.redeemedAt).toBeGreaterThan(0);
  });

  it('Einlösen ist idempotent und lässt sich zurücknehmen (nur vom Gläubiger)', async () => {
    const { env, anna, ben, id } = await withDebt();
    const first = (await anna.post(`/debts/${id}/redeem`)).body.debt.redeemedAt;
    env.clock.advance(60_000);
    expect((await anna.post(`/debts/${id}/redeem`)).body.debt.redeemedAt).toBe(first);
    expect((await ben.delete(`/debts/${id}/redeem`)).status).toBe(403);
    const reopened = await anna.delete(`/debts/${id}/redeem`);
    expect(reopened.body.debt.redeemedAt).toBeNull();
  });

  it('filtert nach Status', async () => {
    const { anna, id } = await withDebt();
    expect((await anna.get('/debts?status=redeemed')).body.debts).toHaveLength(0);
    await anna.post(`/debts/${id}/redeem`);
    expect((await anna.get('/debts')).body.debts).toHaveLength(0);
    expect((await anna.get('/debts?status=redeemed')).body.debts).toHaveLength(1);
    expect((await anna.get('/debts?status=all')).body.debts).toHaveLength(1);
    expect((await anna.get('/debts?status=quatsch')).status).toBe(400);
  });

  it('der Einsatztext bleibt in der Schuld stehen, auch wenn der Einsatz später geändert wird', async () => {
    const { env, anna, id } = await withDebt();
    // Es ist bereits Montag nach Woche 1 (Woche 2 läuft), die Änderung gilt daher erst ab Woche 3
    await anna.put('/bets', { text: 'Etwas ganz anderes' });
    env.clock.set(noon(W3));
    await anna.get('/me');
    expect((await anna.get('/bets')).body.current).toBe('Etwas ganz anderes');
    expect(
      (await anna.get('/debts')).body.debts.find((d: { id: string }) => d.id === id).betText,
    ).toBe('Der Verlierer kocht');
  });

  it('fremde Teams sehen und bearbeiten keine Schulden', async () => {
    const { env, id } = await withDebt();
    const carla = env.client({ ip: '203.0.113.99' });
    await carla.registerFounder('carla@example.org', 'Carla');
    expect((await carla.get('/debts?status=all')).body.debts).toEqual([]);
    expect((await carla.post(`/debts/${id}/redeem`)).status).toBe(404);
    expect((await carla.delete(`/debts/${id}/redeem`)).status).toBe(404);
  });

  it('Anmeldung und Team sind Pflicht', async () => {
    const env = createTestEnv();
    expect((await env.client().get('/debts')).status).toBe(401);
    const { anna } = await createCouple(env);
    await anna.delete('/team', { password: PASSWORD });
    expect((await anna.get('/debts')).status).toBe(403);
  });

  it('das Dashboard zeigt Einsatz und offene Schulden', async () => {
    const { anna, ben, id, env } = await withDebt();
    env.clock.set(noon(W2));
    await anna.get('/me');
    await ben.get('/me');
    const a = (await anna.get('/dashboard')).body;
    const b = (await ben.get('/dashboard')).body;
    expect(a.bet).toBe('Der Verlierer kocht');
    expect(a.debts).toEqual({ owe: 0, owed: 1 });
    expect(b.debts).toEqual({ owe: 1, owed: 0 });
    await anna.post(`/debts/${id}/redeem`);
    expect((await anna.get('/dashboard')).body.debts).toEqual({ owe: 0, owed: 0 });
  });
});

describe('Entwickler-Uhr', () => {
  it('DEV_CLOCK_OFFSET_HOURS ist in Produktion verboten', () => {
    const base = {
      PUBLIC_URL: 'https://ds.example.org',
      SIGNUP_MODE: 'invite-only',
      DEV_CLOCK_OFFSET_HOURS: '168',
    };
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/nur für Entwicklung/);
    expect(loadConfig({ ...base, NODE_ENV: 'development' }).devClockOffsetMs).toBe(168 * 3_600_000);
    expect(
      loadConfig({
        PUBLIC_URL: 'https://ds.example.org',
        SIGNUP_MODE: 'invite-only',
        NODE_ENV: 'production',
      }).devClockOffsetMs,
    ).toBe(0);
  });
});
