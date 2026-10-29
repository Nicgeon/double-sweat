import { describe, expect, it } from 'vitest';
import { settleWeeksJob } from '../src/jobs/settle-weeks.js';
import { createCouple, createTestEnv, PASSWORD } from './helpers.js';
import { afterWeek, checkinDays, noon, pair, W1, W2 } from './scenario.js';

describe('Belohnung: Versprechen', () => {
  it('ohne Versprechen ist alles leer; Freitext wird getrimmt und gilt ab der kommenden Woche', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    expect((await anna.get('/rewards')).body).toEqual({
      mine: { current: null, upcoming: null },
      partner: { displayName: 'Ben', current: null, upcoming: null },
    });
    const res = await anna.put('/rewards', { text: '  Ich koche am Sonntag  ' });
    expect(res.status).toBe(200);
    expect(res.body.mine).toEqual({
      current: null,
      upcoming: { text: 'Ich koche am Sonntag', effectiveFrom: '2026-03-09' },
    });
    // Der Partner sieht, was er gewinnen kann
    expect((await ben.get('/rewards')).body.partner).toMatchObject({
      displayName: 'Anna',
      upcoming: { text: 'Ich koche am Sonntag', effectiveFrom: '2026-03-09' },
    });
  });

  it('der Partner erfährt vom Versprechen (Postfach), das Zurückziehen bleibt still', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    await anna.put('/rewards', { text: 'Massage' });
    await anna.put('/rewards', { text: '' });
    await env.ctx.idle();
    const inbox = (await ben.get('/notifications')).body.notifications;
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      type: 'reward_set',
      body: 'Anna verspricht dir eine Belohnung für dein Wochenziel: „Massage“.',
    });
    expect((await anna.get('/notifications')).body.notifications).toEqual([]);
    // Zurückgezogen: gilt künftig nicht mehr
    expect((await anna.get('/rewards')).body.mine.upcoming).toEqual({
      text: null,
      effectiveFrom: '2026-03-09',
    });
  });

  it('eine Änderung greift erst ab dem nächsten Montag; die laufende Woche behält die alte Belohnung', async () => {
    const { env, anna, ben } = await pair({ bet: null });
    await anna.put('/rewards', { text: 'Kaffee' });
    env.clock.set(noon(W1));
    expect((await anna.get('/rewards')).body.mine).toEqual({ current: 'Kaffee', upcoming: null });
    await anna.put('/rewards', { text: 'Massage' });
    expect((await anna.get('/rewards')).body.mine).toEqual({
      current: 'Kaffee',
      upcoming: { text: 'Massage', effectiveFrom: W2 },
    });
    expect((await ben.get('/rewards')).body.partner.current).toBe('Kaffee');
    env.clock.set(noon(W2));
    expect((await anna.get('/rewards')).body.mine).toEqual({ current: 'Massage', upcoming: null });
  });

  it('prüft Länge, behandelt Text als Text und verlangt Anmeldung und Team', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    expect((await anna.put('/rewards', { text: 'x'.repeat(141) })).status).toBe(400);
    expect((await anna.put('/rewards', { text: 'x'.repeat(140) })).status).toBe(200);
    const payload = '<img src=x onerror=alert(1)> {{7*7}}';
    await anna.put('/rewards', { text: payload });
    expect((await anna.get('/rewards')).body.mine.upcoming.text).toBe(payload);
    expect((await env.client().get('/rewards')).status).toBe(401);
    await anna.delete('/team', { password: PASSWORD });
    expect((await anna.get('/rewards')).status).toBe(403);
  });

  it('ohne Partner gibt es nur das eigene Versprechen', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    expect((await anna.get('/rewards')).body).toEqual({
      mine: { current: null, upcoming: null },
      partner: null,
    });
  });
});

describe('Belohnung: Abrechnung', () => {
  /** Ben verspricht Anna eine Belohnung. Woche 1: Anna erreicht ihr Ziel (3 Tage), Ben nicht. */
  async function annaEarned() {
    const ctx = await pair({ bet: null });
    await ctx.ben.put('/rewards', { text: 'Ben kocht' });
    await checkinDays(ctx.env, ctx.anna, W1, 3);
    await checkinDays(ctx.env, ctx.ben, W1, 1);
    ctx.env.clock.set(afterWeek(W1));
    await ctx.anna.get('/me');
    await ctx.ben.get('/me');
    settleWeeksJob(ctx.env.ctx);
    await ctx.env.ctx.idle();
    const claim = (await ctx.anna.get('/reward-claims')).body.claims[0];
    return { ...ctx, id: claim.id as string };
  }

  it('wer sein Ziel schafft, bekommt die versprochene Belohnung; wer verfehlt, nicht', async () => {
    const { anna, ben, id } = await annaEarned();
    const a = (await anna.get('/reward-claims')).body.claims;
    const b = (await ben.get('/reward-claims')).body.claims;
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      id,
      direction: 'earned',
      recipientName: 'Anna',
      giverName: 'Ben',
      rewardText: 'Ben kocht',
      weekStart: W1,
      redeemedAt: null,
    });
    expect(b[0]).toMatchObject({ id, direction: 'give' });
    // Ben hat sein Ziel verfehlt, Anna hatte nichts versprochen: keine zweite Belohnung
    expect(a).toHaveLength(1);
  });

  it('beide erreichen ihr Ziel: jeder bekommt, was der andere versprochen hat', async () => {
    const { env, anna, ben } = await pair({ bet: null });
    await anna.put('/rewards', { text: 'Massage' });
    await ben.put('/rewards', { text: 'Eis' });
    await checkinDays(env, anna, W1, 3);
    await checkinDays(env, ben, W1, 2);
    env.clock.set(afterWeek(W1));
    await anna.get('/me');
    await ben.get('/me');
    settleWeeksJob(env.ctx);
    const claims = (await anna.get('/reward-claims')).body.claims as {
      direction: string;
      rewardText: string;
    }[];
    expect(claims).toHaveLength(2);
    expect(claims.find((c) => c.direction === 'earned')?.rewardText).toBe('Eis');
    expect(claims.find((c) => c.direction === 'give')?.rewardText).toBe('Massage');
  });

  it('Mitteilung an beide: Empfänger und Geber', async () => {
    const { anna, ben } = await annaEarned();
    const forAnna = (await anna.get('/notifications')).body.notifications;
    const forBen = (await ben.get('/notifications')).body.notifications;
    expect(forAnna.at(0)).toMatchObject({
      type: 'reward_earned',
      body: 'Wochenziel geschafft! Deine Belohnung von Ben: „Ben kocht“.',
    });
    expect(forBen.at(0)).toMatchObject({
      type: 'reward_earned',
      body: 'Anna hat das Wochenziel geschafft. Deine Belohnung ist fällig: „Ben kocht“.',
    });
  });

  it('ein zweiter Abrechnungslauf legt nichts doppelt an', async () => {
    const { env, anna } = await annaEarned();
    settleWeeksJob(env.ctx);
    expect((await anna.get('/reward-claims?status=all')).body.claims).toHaveLength(1);
  });

  it('verfehltes oder nicht gesetztes Ziel und zurückgezogene Belohnung ergeben nichts', async () => {
    // Ben hat verfehlt (Anna hatte etwas versprochen, Ben bekommt aber nichts)
    const a = await pair({ bet: null });
    await a.anna.put('/rewards', { text: 'Massage' });
    await checkinDays(a.env, a.anna, W1, 3);
    await checkinDays(a.env, a.ben, W1, 1);
    a.env.clock.set(afterWeek(W1));
    await a.anna.get('/me');
    await a.ben.get('/me');
    settleWeeksJob(a.env.ctx);
    expect((await a.anna.get('/reward-claims?status=all')).body.claims).toEqual([]);

    // Belohnung vor Wochenbeginn zurückgezogen
    const b = await pair({ bet: null });
    await b.ben.put('/rewards', { text: 'Ben kocht' });
    await b.ben.put('/rewards', { text: '' });
    await checkinDays(b.env, b.anna, W1, 3);
    b.env.clock.set(afterWeek(W1));
    await b.anna.get('/me');
    await b.ben.get('/me');
    settleWeeksJob(b.env.ctx);
    expect((await b.anna.get('/reward-claims?status=all')).body.claims).toEqual([]);
  });

  it('der Text bleibt in der verdienten Belohnung stehen, auch wenn das Versprechen später geändert wird', async () => {
    const { env, ben, anna } = await annaEarned();
    env.clock.set(noon(W2));
    await ben.put('/rewards', { text: 'etwas ganz anderes' });
    expect((await anna.get('/reward-claims')).body.claims[0].rewardText).toBe('Ben kocht');
  });
});

describe('Belohnung: Einlösen', () => {
  async function earned() {
    const ctx = await pair({ bet: null });
    await ctx.ben.put('/rewards', { text: 'Ben kocht' });
    await checkinDays(ctx.env, ctx.anna, W1, 3);
    ctx.env.clock.set(afterWeek(W1));
    await ctx.anna.get('/me');
    await ctx.ben.get('/me');
    settleWeeksJob(ctx.env.ctx);
    const id = (await ctx.anna.get('/reward-claims')).body.claims[0].id as string;
    return { ...ctx, id };
  }

  it('nur wer die Belohnung verdient hat, kann sie als erhalten markieren; der Geber nicht', async () => {
    const { anna, ben, id } = await earned();
    const denied = await ben.post(`/reward-claims/${id}/redeem`);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('not_recipient');
    expect((await ben.get('/reward-claims')).body.claims).toHaveLength(1); // unverändert offen
    const ok = await anna.post(`/reward-claims/${id}/redeem`);
    expect(ok.status).toBe(200);
    expect(ok.body.claim.redeemedAt).toBeGreaterThan(0);
  });

  it('ist idempotent, lässt sich zurücknehmen (nur vom Empfänger) und filtert nach Status', async () => {
    const { env, anna, ben, id } = await earned();
    const first = (await anna.post(`/reward-claims/${id}/redeem`)).body.claim.redeemedAt;
    env.clock.advance(60_000);
    expect((await anna.post(`/reward-claims/${id}/redeem`)).body.claim.redeemedAt).toBe(first);
    expect((await anna.get('/reward-claims')).body.claims).toHaveLength(0);
    expect((await anna.get('/reward-claims?status=redeemed')).body.claims).toHaveLength(1);
    expect((await ben.delete(`/reward-claims/${id}/redeem`)).status).toBe(403);
    expect((await anna.delete(`/reward-claims/${id}/redeem`)).body.claim.redeemedAt).toBeNull();
    expect((await anna.get('/reward-claims?status=quatsch')).status).toBe(400);
  });

  it('fremde Teams sehen und ändern nichts (404)', async () => {
    const { env, id } = await earned();
    const carl = env.client({ ip: '203.0.113.99' });
    await carl.registerFounder('carl@example.org', 'Carl');
    expect((await carl.get('/reward-claims?status=all')).body.claims).toEqual([]);
    expect((await carl.post(`/reward-claims/${id}/redeem`)).status).toBe(404);
    expect((await carl.post('/reward-claims/gibtesnicht/redeem')).status).toBe(404);
  });

  it('Dashboard zeigt, was man gewinnen kann, und wie viele Belohnungen offen sind', async () => {
    const { env, anna, ben, id } = await earned();
    env.clock.set(noon(W2));
    await ben.put('/rewards', { text: 'Massage' }); // gilt erst ab der Folgewoche
    const a = (await anna.get('/dashboard')).body;
    const b = (await ben.get('/dashboard')).body;
    expect(a.reward).toBe('Ben kocht');
    expect(a.rewards).toEqual({ earned: 1, toGive: 0 });
    expect(b.rewards).toEqual({ earned: 0, toGive: 1 });
    expect(b.reward).toBeNull(); // Anna hat Ben nichts versprochen
    await anna.post(`/reward-claims/${id}/redeem`);
    expect((await anna.get('/dashboard')).body.rewards).toEqual({ earned: 0, toGive: 0 });
  });
});
