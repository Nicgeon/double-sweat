import { describe, expect, it } from 'vitest';
import { createContext } from '../src/context.js';
import { HOUR, MINUTE } from '../src/util/time.js';
import { createCouple, createTestEnv, PASSWORD } from './helpers.js';

describe('Nudges', () => {
  it('stupst den Partner an: Postfach-Eintrag und Antwort mit dem nächsten erlaubten Zeitpunkt', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    const res = await anna.post('/nudges');
    expect(res.status).toBe(202);
    expect(res.body.nextAllowedAt).toBe(env.clock.now() + HOUR);
    await env.ctx.idle();
    const inbox = (await ben.get('/notifications')).body;
    expect(inbox.unreadCount).toBe(1);
    expect(inbox.notifications[0]).toMatchObject({
      type: 'nudge',
      title: 'Double Sweat',
      read: false,
    });
    expect(inbox.notifications[0].body).toBe('Anna stupst dich an: Zeit fürs Training!');
    expect((await anna.get('/notifications')).body.notifications).toEqual([]); // nicht an sich selbst
  });

  it('höchstens ein Nudge pro Stunde: danach 429 mit passendem Retry-After', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    expect((await anna.post('/nudges')).status).toBe(202);
    env.clock.advance(20 * MINUTE);
    const blocked = await anna.post('/nudges');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('rate_limited');
    expect(Number(blocked.headers.get('retry-after'))).toBe(40 * 60);
    env.clock.advance(40 * MINUTE - 1000);
    expect((await anna.post('/nudges')).status).toBe(429);
    env.clock.advance(1000);
    expect((await anna.post('/nudges')).status).toBe(202);
  });

  it('das Limit gilt pro Absender: beide Partner dürfen je einmal pro Stunde', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    expect((await anna.post('/nudges')).status).toBe(202);
    expect((await ben.post('/nudges')).status).toBe(202);
    expect((await anna.post('/nudges')).status).toBe(429);
    expect((await ben.post('/nudges')).status).toBe(429);
  });

  it('das Limit überlebt einen Neustart (liegt in der Datenbank)', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    await anna.post('/nudges');
    const restarted = createContext({ config: env.config, db: env.ctx.db, clock: env.clock });
    const { createApp } = await import('../src/app.js');
    const again = env.client({ ip: '203.0.113.15' });
    again.cookies = new Map(anna.cookies);
    again.csrfToken = anna.csrfToken;
    const app = createApp(restarted);
    const res = await app.request(
      'https://ds.test/api/v1/nudges',
      {
        method: 'POST',
        headers: {
          origin: 'https://ds.test',
          'x-csrf-token': anna.csrfToken!,
          cookie: [...anna.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
          'content-type': 'application/json',
        },
        body: '{}',
      },
      { incoming: { socket: { remoteAddress: '203.0.113.15' } } },
    );
    expect(res.status).toBe(429);
  });

  it('gleichzeitige Nudges lassen höchstens einen durch', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    const results = await Promise.all([
      anna.post('/nudges'),
      anna.post('/nudges'),
      anna.post('/nudges'),
    ]);
    expect(results.filter((r) => r.status === 202)).toHaveLength(1);
    await env.ctx.idle();
    expect(
      (env.ctx.db.$client.prepare('SELECT COUNT(*) AS n FROM nudges').get() as { n: number }).n,
    ).toBe(1);
  });

  it('braucht einen Partner und ein Team', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const alone = await anna.post('/nudges');
    expect(alone.status).toBe(409);
    expect(alone.body.error.code).toBe('no_partner');
    expect((await env.client({ ip: '203.0.113.16' }).post('/nudges')).status).toBe(401);
    await anna.delete('/team', { password: PASSWORD });
    expect((await anna.post('/nudges')).status).toBe(403);
  });

  it('ein abgelehnter Nudge erzeugt keine Benachrichtigung', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    await anna.post('/nudges');
    await anna.post('/nudges');
    await anna.post('/nudges');
    await env.ctx.idle();
    expect((await ben.get('/notifications')).body.notifications).toHaveLength(1);
  });
});
