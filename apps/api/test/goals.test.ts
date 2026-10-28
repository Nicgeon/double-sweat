import { describe, expect, it } from 'vitest';
import { weekEndInstant } from '../src/domain/weeks.js';
import { noisyJpeg, photoForm } from './fixtures.js';
import { createTestEnv, type TestEnv } from './helpers.js';

// Fake-Uhr startet Montag, 2. März 2026, 10:00 UTC

async function founder(env: TestEnv, timezone = 'Europe/Berlin') {
  const c = env.client({ ip: '203.0.113.20' });
  await c.registerFounder('anna@example.org', 'Anna', timezone);
  return c;
}

describe('Wochenziel', () => {
  it('ohne Ziel sind beide Wochen leer', async () => {
    const env = createTestEnv();
    const anna = await founder(env);
    const res = await anna.get('/goals');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      currentWeekStart: '2026-03-02',
      currentGoal: null,
      nextWeekStart: '2026-03-09',
      nextGoal: null,
    });
  });

  it('ein neues Ziel gilt erst ab der kommenden Woche; die laufende Woche bleibt unberührt', async () => {
    const env = createTestEnv();
    const anna = await founder(env);
    const res = await anna.put('/goals/next', { days: 4 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      currentWeekStart: '2026-03-02',
      currentGoal: null,
      nextWeekStart: '2026-03-09',
      nextGoal: 4,
    });
  });

  it('das Ziel der kommenden Woche lässt sich beliebig oft ändern', async () => {
    const env = createTestEnv();
    const anna = await founder(env);
    await anna.put('/goals/next', { days: 4 });
    const res = await anna.put('/goals/next', { days: 6 });
    expect(res.body.nextGoal).toBe(6);
    const rows = env.ctx.db.$client.prepare('SELECT COUNT(*) AS n FROM weekly_goals').get() as {
      n: number;
    };
    expect(rows.n).toBe(1);
  });

  it('nach dem Wochenwechsel gilt das Ziel, und die nächste Woche erbt es', async () => {
    const env = createTestEnv();
    const anna = await founder(env);
    await anna.put('/goals/next', { days: 4 });
    env.clock.set(weekEndInstant('2026-03-02', 'Europe/Berlin') + 1000);
    const res = await anna.get('/goals');
    expect(res.body).toEqual({
      currentWeekStart: '2026-03-09',
      currentGoal: 4,
      nextWeekStart: '2026-03-16',
      nextGoal: 4,
    });
  });

  it('eine Änderung wirkt nur auf die Folgewoche; die laufende Woche behält ihr Ziel', async () => {
    const env = createTestEnv();
    const anna = await founder(env);
    await anna.put('/goals/next', { days: 4 });
    env.clock.set(weekEndInstant('2026-03-02', 'Europe/Berlin') + 1000);
    const res = await anna.put('/goals/next', { days: 2 });
    expect(res.body).toMatchObject({ currentGoal: 4, nextGoal: 2 });
    env.clock.set(weekEndInstant('2026-03-09', 'Europe/Berlin') + 1000);
    expect((await anna.get('/goals')).body).toMatchObject({
      currentWeekStart: '2026-03-16',
      currentGoal: 2,
    });
  });

  it('nimmt nur ganze Zahlen von 1 bis 7', async () => {
    const env = createTestEnv();
    const anna = await founder(env);
    for (const days of [0, 8, -1, 2.5, '3', null]) {
      expect((await anna.put('/goals/next', { days })).status, String(days)).toBe(400);
    }
    for (const days of [1, 7]) expect((await anna.put('/goals/next', { days })).status).toBe(200);
  });

  it('der Wochenwechsel richtet sich nach der Zeitzone des Nutzers', async () => {
    const env = createTestEnv();
    const ben = env.client({ ip: '203.0.113.21' });
    await ben.registerFounder('ben@example.org', 'Ben', 'Pacific/Auckland');
    // Montag 2. März 2026, 10:00 UTC = 23:00 Montag in Auckland (UTC+13), also noch dieselbe Woche
    expect((await ben.get('/goals')).body.currentWeekStart).toBe('2026-03-02');
    env.clock.set(Date.parse('2026-03-02T11:00:00Z')); // Dienstag 00:00 lokal, immer noch Woche 02.03.
    expect((await ben.get('/goals')).body.currentWeekStart).toBe('2026-03-02');
    env.clock.set(Date.parse('2026-03-08T11:00:00Z')); // Montag 00:00 in Auckland (UTC+13), UTC noch Sonntag
    expect((await ben.get('/goals')).body.currentWeekStart).toBe('2026-03-09');
  });

  it('verlangt Anmeldung', async () => {
    const env = createTestEnv();
    expect((await env.client().get('/goals')).status).toBe(401);
    expect((await env.client().put('/goals/next', { days: 3 })).status).toBe(401);
  });
});

describe('Zeitzone ändern', () => {
  it('wirkt sofort, solange es noch keinen Check-in gibt', async () => {
    const env = createTestEnv();
    const anna = await founder(env, 'Europe/Berlin');
    const res = await anna.patch('/me', { timezone: 'America/Los_Angeles' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ timezone: 'America/Los_Angeles', pendingTimezone: null });
  });

  it('wird nach dem ersten Check-in erst zum nächsten Wochenstart wirksam', async () => {
    const env = createTestEnv();
    const anna = await founder(env, 'Europe/Berlin');
    expect((await anna.upload('/checkins', photoForm(await noisyJpeg()))).status).toBe(201);

    const res = await anna.patch('/me', { timezone: 'Asia/Tokyo' });
    expect(res.body.user).toMatchObject({
      timezone: 'Europe/Berlin',
      pendingTimezone: 'Asia/Tokyo',
    });
    expect((await anna.get('/dashboard')).body.members[0].timezone).toBe('Europe/Berlin');

    env.clock.set(weekEndInstant('2026-03-02', 'Europe/Berlin') + 1000);
    const dash = (await anna.get('/dashboard')).body.members[0];
    expect(dash.timezone).toBe('Asia/Tokyo');
    expect((await anna.get('/me')).body.user).toMatchObject({
      timezone: 'Asia/Tokyo',
      pendingTimezone: null,
    });
  });

  it('eine vorgemerkte Änderung lässt sich durch die alte Zeitzone zurücknehmen', async () => {
    const env = createTestEnv();
    const anna = await founder(env, 'Europe/Berlin');
    await anna.upload('/checkins', photoForm(await noisyJpeg()));
    await anna.patch('/me', { timezone: 'Asia/Tokyo' });
    const res = await anna.patch('/me', { timezone: 'Europe/Berlin' });
    expect(res.body.user).toMatchObject({ timezone: 'Europe/Berlin', pendingTimezone: null });
  });

  it('Zeitzonen-Tricks gewinnen keine Stunden: Der Tag bleibt der alte', async () => {
    const env = createTestEnv();
    const anna = await founder(env, 'America/Los_Angeles');
    env.clock.set(Date.parse('2026-03-02T22:00:00Z')); // Montag 14:00 in LA
    expect((await anna.upload('/checkins', photoForm(await noisyJpeg()))).status).toBe(201);
    await anna.patch('/me', { timezone: 'Pacific/Kiritimati' }); // dort wäre es schon Dienstag
    env.clock.set(Date.parse('2026-03-03T01:00:00Z')); // Montag 17:00 in LA, Dienstag 15:00 in Kiritimati
    const again = await anna.upload('/checkins', photoForm(await noisyJpeg()));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('already_checked_in');
  });

  it('lehnt unbekannte Zeitzonen ab', async () => {
    const env = createTestEnv();
    const anna = await founder(env);
    const res = await anna.patch('/me', { timezone: 'Mars/Olympus' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_timezone');
  });
});
