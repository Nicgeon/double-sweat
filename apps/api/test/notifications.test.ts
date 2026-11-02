import { describe, expect, it } from 'vitest';
import { runHousekeeping } from '../src/jobs/housekeeping.js';
import { settleWeeksJob } from '../src/jobs/settle-weeks.js';
import { DAY } from '../src/util/time.js';
import { createCouple, createTestEnv, PASSWORD } from './helpers.js';
import { afterWeek, checkinDays, pair, W1 } from './scenario.js';

describe('Postfach', () => {
  async function withMessages(count: number) {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    const benId = (await ben.get('/me')).body.user.id as string;
    for (let i = 0; i < count; i++) {
      env.clock.advance(1000);
      env.ctx.push.notify(benId, { type: 'nudge', params: { name: `Nr ${i}` } });
    }
    await env.ctx.idle();
    return { env, anna, ben };
  }

  it('listet neueste zuerst mit Ungelesen-Zähler', async () => {
    const { ben } = await withMessages(3);
    const { notifications, unreadCount } = (await ben.get('/notifications')).body;
    expect(notifications.map((n: { body: string }) => n.body)).toEqual([
      'Nr 2 stupst dich an: Zeit fürs Training!',
      'Nr 1 stupst dich an: Zeit fürs Training!',
      'Nr 0 stupst dich an: Zeit fürs Training!',
    ]);
    expect(unreadCount).toBe(3);
    expect(notifications[0]).toMatchObject({
      type: 'nudge',
      title: 'Double Sweat',
      body: 'Nr 2 stupst dich an: Zeit fürs Training!',
      read: false,
      data: null,
    });
  });

  it('markiert bestimmte oder alle als gelesen', async () => {
    const { ben } = await withMessages(3);
    const ids = (await ben.get('/notifications')).body.notifications.map(
      (n: { id: string }) => n.id,
    );
    expect((await ben.post('/notifications/read', { ids: [ids[0]] })).body.marked).toBe(1);
    expect((await ben.get('/notifications')).body.unreadCount).toBe(2);
    expect((await ben.get('/notifications?unread=true')).body.notifications).toHaveLength(2);
    expect((await ben.post('/notifications/read', {})).body.marked).toBe(2);
    expect((await ben.get('/notifications')).body.unreadCount).toBe(0);
    expect((await ben.post('/notifications/read', {})).body.marked).toBe(0);
  });

  it('paginiert mit limit und before', async () => {
    const { ben } = await withMessages(5);
    const first = (await ben.get('/notifications?limit=2')).body.notifications;
    expect(first).toHaveLength(2);
    const next = (await ben.get(`/notifications?limit=2&before=${first[1].createdAt}`)).body
      .notifications;
    expect(next.map((n: { body: string }) => n.body)).toEqual([
      'Nr 2 stupst dich an: Zeit fürs Training!',
      'Nr 1 stupst dich an: Zeit fürs Training!',
    ]);
    expect((await ben.get('/notifications?limit=0')).status).toBe(400);
    expect((await ben.get('/notifications?limit=101')).status).toBe(400);
  });

  it('Nachrichten sind privat: fremde lassen sich weder lesen noch als gelesen markieren', async () => {
    const { anna, ben } = await withMessages(2);
    const ids = (await ben.get('/notifications')).body.notifications.map(
      (n: { id: string }) => n.id,
    );
    expect((await anna.get('/notifications')).body.notifications).toEqual([]);
    expect((await anna.post('/notifications/read', { ids })).body.marked).toBe(0);
    expect((await ben.get('/notifications')).body.unreadCount).toBe(2);
  });

  it('verlangt Anmeldung', async () => {
    const env = createTestEnv();
    expect((await env.client().get('/notifications')).status).toBe(401);
    expect((await env.client().post('/notifications/read', {})).status).toBe(401);
  });

  it('Housekeeping löscht Nachrichten nach 60 Tagen', async () => {
    const { env, ben } = await withMessages(2);
    // In Schritten vorspringen und zwischendurch aktiv sein, sonst läuft die Sitzung nach 14 Tagen ab
    const wait = async (days: number) => {
      for (let left = days; left > 0; left -= 10) {
        env.clock.advance(Math.min(left, 10) * DAY);
        await ben.get('/me');
      }
    };
    await wait(59);
    runHousekeeping(env.ctx);
    expect((await ben.get('/notifications')).body.notifications).toHaveLength(2);
    await wait(2);
    runHousekeeping(env.ctx);
    expect((await ben.get('/notifications')).body.notifications).toHaveLength(0);
  });
});

describe('Benachrichtigungen bei Abrechnung und Team-Auflösung', () => {
  it('Schuldner und Gläubiger erfahren von der Schuld inklusive Einsatz', async () => {
    const { env, anna, ben } = await pair();
    await checkinDays(env, anna, W1, 3);
    await checkinDays(env, ben, W1, 1);
    env.clock.set(afterWeek(W1));
    await anna.get('/me');
    await ben.get('/me');
    settleWeeksJob(env.ctx);
    await env.ctx.idle();
    // Der Einsatz selbst löst auch Mitteilungen aus (bet_set); hier geht es um die Schuld
    const debtOnly = (list: { type: string }[]) => list.filter((n) => n.type === 'debt_created');
    const forBen = debtOnly((await ben.get('/notifications')).body.notifications);
    const forAnna = debtOnly((await anna.get('/notifications')).body.notifications);
    expect(forBen).toHaveLength(1);
    expect(forBen[0]).toMatchObject({
      type: 'debt_created',
      body: 'Ziel verfehlt: Du schuldest Anna diese Woche „Der Verlierer kocht“.',
    });
    expect(forAnna[0].body).toBe(
      'Ben hat das Ziel verfehlt und schuldet dir „Der Verlierer kocht“.',
    );
    expect(forAnna[0].data).toMatchObject({ weekStart: W1 });
  });

  it('wer sein Ziel erreicht oder keinen Einsatz hat, bekommt nichts', async () => {
    const { env, anna, ben } = await pair({ bet: null });
    await checkinDays(env, anna, W1, 3);
    env.clock.set(afterWeek(W1));
    settleWeeksJob(env.ctx);
    await env.ctx.idle();
    expect((await anna.get('/notifications')).body.notifications).toEqual([]);
    expect((await ben.get('/notifications')).body.notifications).toEqual([]);
  });

  it('ein zweiter Lauf benachrichtigt nicht erneut', async () => {
    const { env, ben } = await pair(); // niemand trainiert: beide verfehlen, jeder bekommt zwei Nachrichten
    env.clock.set(afterWeek(W1));
    await ben.get('/me');
    settleWeeksJob(env.ctx);
    await env.ctx.idle();
    const settlement = async () =>
      (await ben.get('/notifications')).body.notifications.filter(
        (n: { type: string }) => n.type !== 'bet_set',
      );
    expect(await settlement()).toHaveLength(2);
    settleWeeksJob(env.ctx);
    settleWeeksJob(env.ctx);
    await env.ctx.idle();
    expect(await settlement()).toHaveLength(2);
  });

  it('Team auflösen informiert den Partner, nicht den Auflösenden', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    await anna.delete('/team', { password: PASSWORD });
    await env.ctx.idle();
    const note = (await ben.get('/notifications')).body.notifications;
    expect(note).toHaveLength(1);
    expect(note[0]).toMatchObject({
      type: 'team_dissolved',
      body: 'Anna hat das Team aufgelöst. Dein Konto bleibt bestehen.',
    });
    expect((await anna.get('/notifications')).body.notifications).toEqual([]);
  });
});
