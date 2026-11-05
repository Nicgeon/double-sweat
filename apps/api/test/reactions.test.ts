import { describe, expect, it } from 'vitest';
import { noisyJpeg, photoForm } from './fixtures.js';
import { createCouple, createTestEnv } from './helpers.js';

async function withCheckin() {
  const env = createTestEnv();
  const { anna, ben } = await createCouple(env);
  const checkin = (await anna.upload('/checkins', photoForm(await noisyJpeg()))).body.checkin;
  return { env, anna, ben, id: checkin.id as string };
}

describe('Reaktionen auf Check-ins', () => {
  it('der Partner kann reagieren; Feed und Dashboard zeigen die Reaktion beiden', async () => {
    const { ben, anna, id } = await withCheckin();
    const res = await ben.put(`/checkins/${id}/reaction`, { kind: 'flame' });
    expect(res.status).toBe(200);
    expect(res.body.reactions).toEqual([
      { kind: 'flame', userId: expect.any(String), displayName: 'Ben' },
    ]);
    for (const who of [anna, ben]) {
      const feed = (await who.get('/dashboard')).body.feed;
      expect(feed[0].reactions).toMatchObject([{ kind: 'flame', displayName: 'Ben' }]);
    }
    const week = (await anna.get('/checkins')).body.checkins;
    expect(week[0].reactions).toHaveLength(1);
  });

  it('eine neue Reaktion ersetzt die alte und lässt sich zurücknehmen', async () => {
    const { ben, id } = await withCheckin();
    await ben.put(`/checkins/${id}/reaction`, { kind: 'flame' });
    const changed = await ben.put(`/checkins/${id}/reaction`, { kind: 'heart' });
    expect(changed.body.reactions).toMatchObject([{ kind: 'heart' }]);
    const removed = await ben.delete(`/checkins/${id}/reaction`);
    expect(removed.body.reactions).toEqual([]);
    expect((await ben.delete(`/checkins/${id}/reaction`)).status).toBe(200); // idempotent
  });

  it('auf den eigenen Check-in kann man nicht reagieren', async () => {
    const { anna, id } = await withCheckin();
    const res = await anna.put(`/checkins/${id}/reaction`, { kind: 'flame' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('own_checkin');
  });

  it('nur bekannte Symbole', async () => {
    const { ben, id } = await withCheckin();
    for (const kind of ['', 'fire', '<b>', 5, null]) {
      expect((await ben.put(`/checkins/${id}/reaction`, { kind })).status, String(kind)).toBe(400);
    }
    for (const kind of ['flame', 'applause', 'strong', 'heart']) {
      expect((await ben.put(`/checkins/${id}/reaction`, { kind })).status).toBe(200);
    }
  });

  it('fremde Teams und erfundene IDs: nicht gefunden; ohne Anmeldung 401', async () => {
    const { env, id } = await withCheckin();
    const carl = env.client({ ip: '203.0.113.98' });
    await carl.registerFounder('carl@example.org', 'Carl');
    expect((await carl.put(`/checkins/${id}/reaction`, { kind: 'flame' })).status).toBe(404);
    expect((await carl.put('/checkins/gibtesnicht/reaction', { kind: 'flame' })).status).toBe(404);
    expect((await carl.delete(`/checkins/${id}/reaction`)).status).toBe(404);
    expect((await env.client().put(`/checkins/${id}/reaction`, { kind: 'flame' })).status).toBe(
      401,
    );
  });

  it('der Partner bekommt eine Mitteilung, aber nur einmal je Check-in und Stunde', async () => {
    const { env, anna, ben, id } = await withCheckin();
    await ben.put(`/checkins/${id}/reaction`, { kind: 'applause' });
    await ben.put(`/checkins/${id}/reaction`, { kind: 'strong' }); // Wechsel: keine zweite Mitteilung
    await ben.delete(`/checkins/${id}/reaction`);
    await ben.put(`/checkins/${id}/reaction`, { kind: 'heart' }); // Neu gesetzt: weiterhin gedrosselt
    await env.ctx.idle();
    const inbox = (await anna.get('/notifications')).body.notifications;
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      type: 'reaction',
      body: 'Ben applaudiert dir.',
      data: { checkinId: id },
    });
    // Ben bekommt nur die Meldung zu Annas Check-in, keine zu seiner eigenen Reaktion
    expect(
      (await ben.get('/notifications')).body.notifications.map((n: { type: string }) => n.type),
    ).toEqual(['checkin']);
  });

  it('mit dem Check-in verschwindet auch die Reaktion', async () => {
    const { env, anna, ben, id } = await withCheckin();
    await ben.put(`/checkins/${id}/reaction`, { kind: 'flame' });
    await anna.delete(`/checkins/${id}`);
    const count = () =>
      (env.ctx.db.$client.prepare('SELECT COUNT(*) AS n FROM reactions').get() as { n: number }).n;
    expect(count()).toBe(0);
  });
});
