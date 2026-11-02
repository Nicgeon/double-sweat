import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { settleDueWeeks } from '../src/modules/settlement/service.js';
import { createCouple, createTestEnv, PASSWORD } from './helpers.js';
import { afterWeek, checkinDays, noon, pair, W1, W2, W3 } from './scenario.js';

describe('Einsatz (pro Person)', () => {
  it('ohne Einsatz ist alles leer; der eigene gilt ab sofort, Freitext wird getrimmt', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    expect((await anna.get('/bets')).body).toMatchObject({
      currentWeekStart: '2026-03-02',
      mine: { current: null, currentFrom: null, upcoming: [] },
      partner: { displayName: 'Ben', current: null, upcoming: [] },
      required: false, // die Beitrittswoche zählt nicht, die App lässt sich erst kennenlernen
    });
    const res = await anna.put('/bets', { text: '  Der Verlierer kocht Abendessen  ' });
    expect(res.status).toBe(200);
    expect(res.body.mine).toEqual({
      current: 'Der Verlierer kocht Abendessen',
      currentFrom: '2026-03-02',
      upcoming: [],
    });
    // Jeder hat seinen eigenen: Ben sieht Annas, hat selbst noch keinen
    const forBen = (await ben.get('/bets')).body;
    expect(forBen.mine.current).toBeNull();
    expect(forBen.partner.current).toBe('Der Verlierer kocht Abendessen');
    expect((await anna.get('/dashboard')).body).toMatchObject({
      bet: 'Der Verlierer kocht Abendessen',
      betUpcoming: null,
      partnerBet: null,
      betRequired: false,
    });
  });

  it('der Einsatz bleibt editierbar: auch für die laufende Woche, und der Partner erfährt davon', async () => {
    const { env, anna, ben } = await pair({ bet: 'Kaffee' });
    env.clock.set(noon(W1));
    const changed = await anna.put('/bets', { text: 'Massage' }); // gilt sofort, ab dieser Woche
    expect(changed.body.mine).toEqual({ current: 'Massage', currentFrom: W1, upcoming: [] });
    expect((await ben.get('/bets')).body.partner.current).toBe('Massage');
    const types = (await ben.get('/notifications')).body.notifications.map(
      (n: { type: string }) => n.type,
    );
    expect(types).toContain('bet_changed');
    // Zurück auf denselben Montag überschreibt, es entsteht keine zweite Zeile
    await anna.put('/bets', { text: 'Pizza' });
    expect(
      (
        env.ctx.db.$client
          .prepare("SELECT COUNT(*) AS n FROM bets WHERE effective_from = ? AND text = 'Pizza'")
          .get(W1) as { n: number }
      ).n,
    ).toBe(1);
  });

  it('Einsätze lassen sich für kommende Wochen vorab festlegen, bleiben bis dahin vorgemerkt und gelten dann', async () => {
    const { env, anna, ben } = await pair({ bet: 'Kaffee' });
    env.clock.set(noon('2026-03-11')); // Mittwoch in Woche 1
    await ben.put('/bets', { text: 'Kino', from: W2 });
    await ben.put('/bets', { text: 'Sushi', from: W3 });
    for (const day of ['2026-03-11', '2026-03-15']) {
      env.clock.set(noon(day));
      const b = (await ben.get('/bets')).body;
      expect(b.mine.current).toBe('Kaffee');
      expect(b.mine.upcoming).toEqual([
        { text: 'Kino', effectiveFrom: W2 },
        { text: 'Sushi', effectiveFrom: W3 },
      ]);
      // Der Partner sieht den vorgemerkten Plan, im Dashboard den nächsten
      expect((await anna.get('/bets')).body.partner.upcoming).toHaveLength(2);
      expect((await ben.get('/dashboard')).body).toMatchObject({
        bet: 'Kaffee',
        betUpcoming: { text: 'Kino', effectiveFrom: W2 },
      });
    }
    // Der Wochenwechsel löscht nichts: Woche 2 gilt Kino, Woche 3 Sushi, Annas bleibt unberührt
    for (const [instant, expected] of [
      [afterWeek(W1), 'Kino'],
      [noon(W2), 'Kino'],
      [noon('2026-03-20'), 'Kino'],
      [noon(W3), 'Sushi'],
    ] as const) {
      env.clock.set(instant);
      const b = (await ben.get('/bets')).body;
      expect(b.mine.current).toBe(expected);
      expect((await anna.get('/bets')).body.mine.current).toBe('Kaffee');
    }
    expect((await ben.get('/dashboard')).body).toMatchObject({ bet: 'Sushi', betUpcoming: null });
  });

  it('einen vorgemerkten Einsatz kann man zurücknehmen, den laufenden nicht', async () => {
    const { env, anna } = await pair({ bet: 'Kaffee' });
    env.clock.set(noon(W1));
    await anna.put('/bets', { text: 'Später', from: W3 });
    const removed = await anna.delete(`/bets/${W3}`);
    expect(removed.status).toBe(200);
    expect(removed.body.mine.upcoming).toEqual([]);
    expect((await anna.delete(`/bets/${W3}`)).status).toBe(404);
    expect((await anna.delete(`/bets/${W1}`)).status).toBe(400); // laufende Woche
    expect((await anna.get('/bets')).body.mine.current).toBe('Kaffee');
  });

  it('prüft den Wochenstart: ein Montag, nicht vergangen, höchstens 12 Wochen voraus', async () => {
    const { env, anna } = await pair({ bet: 'Kaffee' });
    env.clock.set(noon(W1));
    await anna.get('/me'); // aktiv bleiben, sonst läuft die Sitzung nach 14 Tagen Pause ab
    env.clock.set(noon(W2));
    expect((await anna.put('/bets', { text: 'x', from: '2026-03-18' })).status).toBe(400); // Mittwoch
    expect((await anna.put('/bets', { text: 'x', from: 'morgen' })).status).toBe(400);
    expect((await anna.put('/bets', { text: 'x', from: W1 })).status).toBe(400); // vergangen
    expect((await anna.put('/bets', { text: 'x', from: '2026-06-15' })).status).toBe(400); // zu weit
    expect((await anna.put('/bets', { text: 'x', from: '2026-06-08' })).status).toBe(200); // genau 12 Wochen
  });

  it('jede Person hat ihre Zeitzone: "laufende Woche" ist die eigene', async () => {
    const { env, anna, ben } = await pair({
      annaTz: 'Europe/Berlin',
      benTz: 'Pacific/Auckland',
      bet: null,
    });
    // So 15.03. 12:00 UTC: Berlin noch Woche 03-09, Auckland (UTC+13) bereits Woche 03-16
    env.clock.set(Date.parse('2026-03-15T12:00:00Z'));
    await anna.get('/me');
    await ben.get('/me');
    expect((await anna.put('/bets', { text: 'Pizza' })).body.mine.currentFrom).toBe('2026-03-09');
    expect((await ben.put('/bets', { text: 'Sushi' })).body.mine.currentFrom).toBe('2026-03-16');
  });

  it('Pflicht: ab der ersten vollen Woche muss jede Person einen Einsatz für die laufende Woche haben', async () => {
    const { env, anna, ben } = await pair({ bet: null });
    // Beitrittswoche (Mo 02.03.): nichts erforderlich, man kann die App kennenlernen
    expect((await anna.get('/bets')).body.required).toBe(false);
    env.clock.set(noon(W1));
    await anna.get('/me');
    await ben.get('/me');
    for (const who of [anna, ben]) {
      expect((await who.get('/bets')).body.required).toBe(true);
      expect((await who.get('/dashboard')).body.betRequired).toBe(true);
    }
    await anna.put('/bets', { text: 'Pizza' });
    expect((await anna.get('/bets')).body.required).toBe(false);
    expect((await ben.get('/bets')).body.required).toBe(true); // jede Person für sich
    // Wer vorab für diese Woche festlegt, wird gar nicht gefragt
    env.clock.set(noon(W2));
    await ben.get('/me');
    await anna.get('/me');
    expect((await anna.get('/bets')).body.required).toBe(false); // Annas Pizza gilt weiter
    expect((await ben.get('/bets')).body.required).toBe(true);
    await ben.put('/bets', { text: 'Kino', from: W3 });
    expect((await ben.get('/bets')).body.required).toBe(true); // W2 hat noch keinen
    env.clock.set(noon(W3));
    await ben.get('/me');
    expect((await ben.get('/bets')).body.required).toBe(false);
  });

  it('wer vor der ersten vollen Woche für sie festlegt, sieht das Pop-up nie', async () => {
    const { env, anna } = await pair({ bet: null });
    await anna.put('/bets', { text: 'Pizza', from: W1 }); // in der Beitrittswoche vorab für Woche 1
    env.clock.set(noon(W1));
    await anna.get('/me');
    expect((await anna.get('/bets')).body.required).toBe(false);
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
    expect((await anna.get('/bets')).body.mine.current).toBe(payload);
  });

  it('der bisherige Einsatz pro Team gilt nach der Umstellung für beide weiter', async () => {
    // Zeilen im alten Format (ein Einsatz pro Team) stehen nach der Migration bei beiden Personen
    const { env, anna, ben } = await pair({ bet: 'Kaffee' });
    const rows = env.ctx.db.$client
      .prepare('SELECT user_id AS u, text FROM bets ORDER BY user_id')
      .all() as { u: string; text: string }[];
    expect(rows.map((r) => r.text)).toEqual(['Kaffee', 'Kaffee']);
    expect((await anna.get('/bets')).body.mine.current).toBe('Kaffee');
    expect((await ben.get('/bets')).body.mine.current).toBe('Kaffee');
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
    const { env, anna, ben, id } = await withDebt();
    // Ben schuldet mit seinem eigenen Einsatz; ändert er ihn danach, bleibt der Text der Schuld stehen
    await ben.put('/bets', { text: 'Etwas ganz anderes' });
    env.clock.set(noon(W3));
    await anna.get('/me');
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
