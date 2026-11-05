import { describe, expect, it } from 'vitest';
import { type NotificationType, renderNotification } from '../src/i18n/notifications.js';
import { remindersJob } from '../src/jobs/reminders.js';
import { settleWeeksJob } from '../src/jobs/settle-weeks.js';
import { HOUR } from '../src/util/time.js';
import { noisyJpeg, photoForm } from './fixtures.js';
import { createCouple, createTestEnv, PASSWORD, type TestClient } from './helpers.js';
import { newDevice, pushEnv, startPushServer } from './push-helpers.js';
import { afterWeek, checkinDays, noon, pair, W1 } from './scenario.js';

const ALL_ON = {
  reminder: true,
  nudge: true,
  checkin: true,
  reaction: true,
  agreement: true,
  result: true,
  streak: true,
};

const webpush = (device: ReturnType<typeof newDevice>) => ({
  provider: 'webpush',
  endpoint: device.endpoint,
  keys: device.keys,
});

const inbox = async (who: TestClient) =>
  (await who.get('/notifications')).body.notifications as {
    type: string;
    body: string;
    link: string | null;
    data: Record<string, unknown> | null;
  }[];

describe('Einstellungen pro Art von Mitteilung', () => {
  it('ohne eigene Wahl ist alles an; Änderungen werden einzeln gespeichert und bleiben', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    expect((await anna.get('/me')).body.user.notifications).toEqual(ALL_ON);

    const res = await anna.patch('/me', { notifications: { nudge: false, reaction: false } });
    expect(res.status).toBe(200);
    expect(res.body.user.notifications).toEqual({ ...ALL_ON, nudge: false, reaction: false });

    // Eine spätere Änderung berührt nur den genannten Schalter
    await anna.patch('/me', { notifications: { checkin: false } });
    expect((await anna.get('/me')).body.user.notifications).toEqual({
      ...ALL_ON,
      nudge: false,
      reaction: false,
      checkin: false,
    });
    await anna.patch('/me', { notifications: { nudge: true } });
    expect((await anna.get('/me')).body.user.notifications.nudge).toBe(true);
  });

  it('lehnt falsche Werte und leere Änderungen ab; die Wahl eines Kontos betrifft nur dieses', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    expect((await anna.patch('/me', { notifications: { nudge: 'nein' } })).status).toBe(400);
    expect((await anna.patch('/me', { notifications: {} })).status).toBe(400);
    expect((await anna.patch('/me', { notifications: { unbekannt: true } })).status).toBe(400);
    await anna.patch('/me', { notifications: { reminder: false } });
    expect((await ben.get('/me')).body.user.notifications).toEqual(ALL_ON);
  });

  it('abgeschaltete Art: das Postfach bekommt sie trotzdem, ein Push kommt nicht', async () => {
    const server = await startPushServer();
    try {
      const env = pushEnv();
      const { anna, ben } = await createCouple(env);
      await ben.post('/push/subscriptions', webpush(newDevice(`${server.base}/ben`)));
      await ben.patch('/me', { notifications: { nudge: false } });

      await anna.post('/nudges');
      await env.ctx.idle();
      expect(server.requests).toHaveLength(0);
      expect((await inbox(ben)).map((n) => n.type)).toEqual(['nudge']);

      // Wieder an: der nächste Anstupser (nach der Sperrfrist) kommt an
      await ben.patch('/me', { notifications: { nudge: true } });
      env.clock.advance(2 * HOUR);
      await anna.post('/nudges');
      await env.ctx.idle();
      expect(server.requests).toHaveLength(1);
      expect((await inbox(ben)).map((n) => n.type)).toEqual(['nudge', 'nudge']);
    } finally {
      await server.close();
    }
  });

  it('Test-Mitteilung und Team-Ereignisse kommen immer per Push, auch wenn alles abgeschaltet ist', async () => {
    const server = await startPushServer();
    try {
      const env = pushEnv();
      const { ben } = await createCouple(env);
      await ben.post('/push/subscriptions', webpush(newDevice(`${server.base}/ben`)));
      await ben.patch('/me', {
        notifications: Object.fromEntries(Object.keys(ALL_ON).map((k) => [k, false])),
      });
      await ben.post('/push/test');
      await env.ctx.idle();
      expect(server.requests).toHaveLength(1);
    } finally {
      await server.close();
    }
  });

  it('wer die Abend-Erinnerung abgeschaltet hat, bekommt sie nicht, auch nicht im Postfach', async () => {
    const p = await pair({ annaGoal: 3, benGoal: 2 });
    const friday = Date.parse('2026-03-13T19:00:00+01:00');
    await p.anna.patch('/me', { notifications: { reminder: false } });
    p.env.clock.set(friday);
    remindersJob(p.env.ctx);
    await p.env.ctx.idle();
    expect((await inbox(p.anna)).filter((n) => n.type === 'reminder')).toEqual([]);

    // Wieder an: am selben Abend kommt sie noch (es wurde nichts vermerkt)
    await p.anna.patch('/me', { notifications: { reminder: true } });
    remindersJob(p.env.ctx);
    await p.env.ctx.idle();
    expect((await inbox(p.anna)).filter((n) => n.type === 'reminder')).toHaveLength(1);
  });
});

describe('Ziel einer Mitteilung', () => {
  it('jede Mitteilung führt in der App an die passende Stelle', async () => {
    const env = createTestEnv();
    const { ben } = await createCouple(env);
    const benId = (await ben.get('/me')).body.user.id as string;
    const send = (type: NotificationType, data?: Record<string, string>) =>
      env.ctx.push.notify(benId, { type, params: { name: 'Anna' }, data });
    send('nudge');
    send('reminder');
    send('reaction', { checkinId: 'abc 1' });
    send('checkin', { checkinId: 'xyz' });
    send('goal_reached');
    send('bet_set');
    send('debt_created');
    send('reward_received');
    send('week_result');
    send('streak_milestone');
    send('partner_joined');
    send('test');
    await env.ctx.idle();
    const byType = Object.fromEntries((await inbox(ben)).map((n) => [n.type, n.link]));
    expect(byType).toEqual({
      nudge: '/checkin',
      reminder: '/checkin',
      reaction: '/?photo=abc%201',
      checkin: '/?photo=xyz',
      goal_reached: '/',
      bet_set: '/deal',
      debt_created: '/deal',
      reward_received: '/deal',
      week_result: '/history',
      streak_milestone: '/history',
      partner_joined: '/',
      test: null,
    });
  });
});

describe('Neue Anlässe', () => {
  it('Check-in: der Partner erfährt vom ersten des Tages, nicht von weiteren', async () => {
    const { env, anna, ben } = await pair({ annaGoal: 5 });
    env.clock.set(noon('2026-03-09'));
    await checkinDays(env, anna, W1, 1);
    await checkinDays(env, anna, W1, 1); // zweiter Check-in am selben Tag (anderes Foto)
    await env.ctx.idle();
    const first = (await inbox(ben)).filter((n) => n.type === 'checkin');
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ body: 'Anna hat eingecheckt.' });
    expect(first[0]?.data).toMatchObject({ weekStart: W1 });
    expect(first[0]?.data?.checkinId).toEqual(expect.any(String));
    // Wer eincheckt, bekommt dazu nichts
    expect((await inbox(anna)).filter((n) => n.type === 'checkin')).toEqual([]);

    // Am nächsten Tag meldet sich der erste Check-in wieder
    env.clock.set(noon('2026-03-10'));
    await checkinDays(env, anna, '2026-03-10', 1);
    await env.ctx.idle();
    expect((await inbox(ben)).filter((n) => n.type === 'checkin')).toHaveLength(2);
  });

  it('der Check-in, der das Wochenziel erfüllt, meldet das Ziel statt eines gewöhnlichen Check-ins', async () => {
    const { env, anna, ben } = await pair({ annaGoal: 2 });
    await checkinDays(env, anna, W1, 2);
    await env.ctx.idle();
    const types = (await inbox(ben)).filter(
      (n) => n.type === 'checkin' || n.type === 'goal_reached',
    );
    expect(types.map((n) => n.type).sort()).toEqual(['checkin', 'goal_reached']);
    expect(types.find((n) => n.type === 'goal_reached')?.body).toBe(
      'Anna hat das Wochenziel erreicht.',
    );
    // Ein weiterer Tag über das Ziel hinaus ist wieder ein gewöhnlicher Check-in
    await checkinDays(env, anna, W1, 3);
    await env.ctx.idle();
    expect((await inbox(ben)).filter((n) => n.type === 'goal_reached')).toHaveLength(1);
  });

  it('die Meldung nennt weder Trainingsart noch Notiz', async () => {
    const { env, anna, ben } = await pair();
    env.clock.set(noon(W1));
    await anna.upload(
      '/checkins',
      photoForm(await noisyJpeg(), { tag: 'kraft', note: 'Beintag!' }),
    );
    await env.ctx.idle();
    const note = (await inbox(ben)).find((n) => n.type === 'checkin');
    expect(note?.body).toBe('Anna hat eingecheckt.');
    expect(JSON.stringify(note)).not.toMatch(/kraft|Beintag/);
  });

  it('Einsatz eingelöst: der Schuldner erfährt es, das Zurücknehmen bleibt still', async () => {
    const { env, anna, ben } = await pair({ bet: 'Kinoabend' });
    env.clock.set(afterWeek(W1));
    await anna.get('/me');
    settleWeeksJob(env.ctx);
    await env.ctx.idle();
    const debtId = (await anna.get('/debts')).body.debts.find(
      (d: { direction: string }) => d.direction === 'owed',
    ).id as string;
    await anna.post(`/debts/${debtId}/redeem`);
    await env.ctx.idle();
    const redeemed = (await inbox(ben)).filter((n) => n.type === 'debt_redeemed');
    expect(redeemed).toHaveLength(1);
    expect(redeemed[0]).toMatchObject({
      body: 'Anna hat deinen Einsatz als eingelöst markiert: „Kinoabend“.',
      link: '/deal',
      data: { debtId },
    });
    // Zweimal bestätigen oder zurücknehmen erzeugt nichts Neues
    await anna.post(`/debts/${debtId}/redeem`);
    await anna.delete(`/debts/${debtId}/redeem`);
    await env.ctx.idle();
    expect((await inbox(ben)).filter((n) => n.type === 'debt_redeemed')).toHaveLength(1);
    // Anna selbst bekommt keine Meldung dazu
    expect((await inbox(anna)).filter((n) => n.type === 'debt_redeemed')).toEqual([]);
  });

  it('Belohnung erhalten: der Geber erfährt es', async () => {
    const { env, anna, ben } = await pair({ annaGoal: 2, benGoal: 1 });
    await ben.put('/rewards', { text: 'Massage' }); // gilt ab der kommenden Woche (W1)
    await checkinDays(env, anna, W1, 2);
    await checkinDays(env, ben, W1, 1);
    env.clock.set(afterWeek(W1));
    await anna.get('/me');
    settleWeeksJob(env.ctx);
    await env.ctx.idle();
    const claim = (await anna.get('/reward-claims')).body.claims[0];
    expect(claim).toMatchObject({ rewardText: 'Massage', direction: 'earned' });
    await anna.post(`/reward-claims/${claim.id}/redeem`);
    await env.ctx.idle();
    const received = (await inbox(ben)).filter((n) => n.type === 'reward_received');
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      body: 'Anna hat die Belohnung erhalten: „Massage“.',
      link: '/deal',
    });
  });

  it('Beitritt: wer schon im Team ist, erfährt es; die Gründung meldet niemandem etwas', async () => {
    const env = createTestEnv();
    const anna = env.client({ ip: '203.0.113.11', afterJoin: undefined });
    await anna.registerFounder();
    await env.ctx.idle();
    expect(await inbox(anna)).toEqual([]);

    const invite = (await anna.post('/teams/invites')).body.code;
    const ben = env.client({ ip: '203.0.113.12', afterJoin: undefined });
    await ben.registerWithInvite(invite);
    await env.ctx.idle();
    expect((await inbox(anna)).map((n) => [n.type, n.body, n.link])).toEqual([
      ['partner_joined', 'Ben ist deinem Team beigetreten.', '/'],
    ]);
    expect(await inbox(ben)).toEqual([]);
  });

  it('Beitritt eines bestehenden Kontos per Code meldet sich ebenfalls beim Team', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    await anna.delete('/team', { password: PASSWORD });
    const carla = env.client({ ip: '203.0.113.90', afterJoin: undefined });
    await carla.registerFounder('carla@example.org', 'Carla');
    const invite = (await carla.post('/teams/invites')).body.code;
    await ben.post('/teams/join', { code: invite });
    await env.ctx.idle();
    expect((await inbox(carla)).map((n) => n.body)).toEqual(['Ben ist deinem Team beigetreten.']);
  });

  it('Wochenergebnis: beide bekommen es einmal, jeder mit sich zuerst, in der eigenen Sprache', async () => {
    const { env, anna, ben } = await pair({ annaGoal: 3, benGoal: 2 });
    await ben.patch('/me', { locale: 'en' });
    await checkinDays(env, anna, W1, 3);
    await checkinDays(env, ben, W1, 1);
    env.clock.set(afterWeek(W1));
    await anna.get('/me');
    settleWeeksJob(env.ctx);
    settleWeeksJob(env.ctx); // ein zweiter Lauf ändert nichts
    await env.ctx.idle();
    const result = async (who: TestClient) =>
      (await inbox(who)).filter((n) => n.type === 'week_result');
    expect((await result(anna)).map((n) => n.body)).toEqual(['KW 11: du 3/3, Ben 1/2.']);
    expect((await result(ben)).map((n) => n.body)).toEqual(['Week 11: you 1/2, Anna 3/3.']);
    expect((await result(anna))[0]).toMatchObject({ link: '/history', data: { weekStart: W1 } });
  });

  it('auch eine Woche ganz ohne Check-ins wird gemeldet', async () => {
    const { env, anna } = await pair({ annaGoal: 3, benGoal: 2 });
    env.clock.set(afterWeek(W1));
    await anna.get('/me');
    settleWeeksJob(env.ctx);
    await env.ctx.idle();
    expect((await inbox(anna)).find((n) => n.type === 'week_result')?.body).toBe(
      'KW 11: du 0/3, Ben 0/2.',
    );
  });

  it('ohne Ziel nennt das Wochenergebnis die Tage statt einer Quote', () => {
    const params = { week: 11, mine: 2, myGoal: 0, other: 'Ben', theirs: 1, theirGoal: 2 };
    expect(renderNotification('de', 'week_result', params).body).toBe(
      'KW 11: du 2 Tage, kein Ziel, Ben 1/2.',
    );
    expect(renderNotification('en', 'week_result', params).body).toBe(
      'Week 11: you 2 days, no goal, Ben 1/2.',
    );
  });
});
