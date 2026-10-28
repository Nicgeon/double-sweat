import { describe, expect, it } from 'vitest';
import { weekEndInstant } from '../src/domain/weeks.js';
import { weekStatus } from '../src/modules/dashboard/service.js';
import { DAY } from '../src/util/time.js';
import { noisyJpeg, photoForm } from './fixtures.js';
import { createCouple, createTestEnv, type TestClient, type TestEnv } from './helpers.js';

const checkin = async (who: TestClient) => who.upload('/checkins', photoForm(await noisyJpeg()));
const berlin = (iso: string) => Date.parse(iso);

/** Ziele setzen und in die folgende Woche (Di, 10.03.2026) springen, in der sie gelten. */
async function coupleWithGoals(env: TestEnv, annaGoal = 3, benGoal = 2) {
  const couple = await createCouple(env);
  await couple.anna.put('/goals/next', { days: annaGoal });
  await couple.ben.put('/goals/next', { days: benGoal });
  env.clock.set(berlin('2026-03-10T10:00:00Z'));
  return couple;
}

const me = (body: { members: { isMe: boolean }[] }) =>
  body.members.find((m) => m.isMe) as Record<string, any>;
const partner = (body: { members: { isMe: boolean }[] }) =>
  body.members.find((m) => !m.isMe) as Record<string, any>;

describe('weekStatus', () => {
  it.each([
    // [Ziel, erledigt, verbleibende Tage] → Status
    [null, 0, 7, 'no_goal', 0],
    [3, 3, 4, 'done', 0],
    [3, 4, 0, 'done', 0],
    [3, 0, 7, 'on_track', 3],
    [3, 1, 4, 'on_track', 2],
    [3, 1, 2, 'at_risk', 2], // jeder verbleibende Tag wird gebraucht
    [3, 1, 1, 'unreachable', 2],
    [1, 0, 1, 'at_risk', 1],
    [7, 0, 7, 'at_risk', 7],
    [7, 1, 6, 'at_risk', 6],
    [7, 1, 5, 'unreachable', 6],
    [2, 0, 0, 'unreachable', 2],
  ] as const)('Ziel %s, erledigt %s, übrig %s → %s', (goal, done, slots, status, needed) => {
    expect(weekStatus(goal, done, slots)).toEqual({ status, needed });
  });
});

describe('Dashboard', () => {
  it('verlangt Anmeldung und ein Team', async () => {
    const env = createTestEnv();
    expect((await env.client().get('/dashboard')).status).toBe(401);
    const anna = env.client();
    await anna.registerFounder();
    await anna.delete('/team', { password: 'correct horse battery' });
    const res = await anna.get('/dashboard');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('no_team');
  });

  it('zeigt vor dem ersten Ziel einen leeren Zustand mit sieben Tagen', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    const { body } = await anna.get('/dashboard');
    expect(body.team.full).toBe(true);
    expect(body.members).toHaveLength(2);
    expect(me(body)).toMatchObject({
      displayName: 'Anna',
      goalDays: null,
      doneDays: 0,
      status: 'no_goal',
      weekStart: '2026-03-02',
    });
    expect(me(body).days.map((d: any) => d.date)).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
      '2026-03-07',
      '2026-03-08',
    ]);
    expect(
      me(body)
        .days.filter((d: any) => d.isToday)
        .map((d: any) => d.date),
    ).toEqual(['2026-03-02']);
    expect(me(body).days.filter((d: any) => d.isFuture)).toHaveLength(6);
    expect(body.feed).toEqual([]);
  });

  it('ein Team mit nur einem Mitglied ist nicht vollständig', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const { body } = await anna.get('/dashboard');
    expect(body.team.full).toBe(false);
    expect(body.members).toHaveLength(1);
  });

  it('zählt Check-ins gegen das Ziel und bewertet den Wochenstand', async () => {
    const env = createTestEnv();
    const { anna, ben } = await coupleWithGoals(env, 3, 2); // Dienstag
    let { body } = await anna.get('/dashboard');
    expect(me(body)).toMatchObject({
      goalDays: 3,
      doneDays: 0,
      checkedInToday: false,
      remainingDays: 6,
      neededDays: 3,
      status: 'on_track',
    });
    expect(partner(body)).toMatchObject({ displayName: 'Ben', goalDays: 2 });

    await checkin(anna);
    ({ body } = await anna.get('/dashboard'));
    expect(me(body)).toMatchObject({
      doneDays: 1,
      checkedInToday: true,
      remainingDays: 5,
      neededDays: 2,
      status: 'on_track',
    });
    expect(me(body).days.find((d: any) => d.isToday)).toMatchObject({
      date: '2026-03-10',
      checkedIn: true,
    });

    env.clock.set(berlin('2026-03-14T10:00:00Z')); // Samstag: 2 Tage übrig, 2 fehlen
    ({ body } = await anna.get('/dashboard'));
    expect(me(body)).toMatchObject({ remainingDays: 2, neededDays: 2, status: 'at_risk' });

    env.clock.set(berlin('2026-03-15T10:00:00Z')); // Sonntag: 1 Tag übrig, 2 fehlen
    ({ body } = await anna.get('/dashboard'));
    expect(me(body)).toMatchObject({ remainingDays: 1, neededDays: 2, status: 'unreachable' });

    await checkin(ben); // Bens Wochenstand ändert Annas nicht
    expect(me((await anna.get('/dashboard')).body)).toMatchObject({ doneDays: 1 });
  });

  it('erreichtes Ziel ergibt "done"', async () => {
    const env = createTestEnv();
    const { anna } = await coupleWithGoals(env, 2, 2);
    await checkin(anna);
    env.clock.advance(DAY);
    await checkin(anna);
    expect(me((await anna.get('/dashboard')).body)).toMatchObject({
      doneDays: 2,
      goalDays: 2,
      status: 'done',
      neededDays: 0,
    });
  });

  it('beide Partner sehen dasselbe Bild, jeweils mit eigener Perspektive', async () => {
    const env = createTestEnv();
    const { anna, ben } = await coupleWithGoals(env);
    await checkin(anna);
    await checkin(ben);
    const fromAnna = (await anna.get('/dashboard')).body;
    const fromBen = (await ben.get('/dashboard')).body;
    expect(me(fromAnna).displayName).toBe('Anna');
    expect(me(fromBen).displayName).toBe('Ben');
    expect(partner(fromBen)).toMatchObject({ displayName: 'Anna', doneDays: 1 });
    expect(fromAnna.feed.map((c: any) => c.id).sort()).toEqual(
      fromBen.feed.map((c: any) => c.id).sort(),
    );
  });

  it('der Foto-Feed der Woche enthält beide Partner, neueste zuerst, mit Foto-Links', async () => {
    const env = createTestEnv();
    const { anna, ben } = await coupleWithGoals(env);
    await checkin(anna);
    env.clock.advance(60_000);
    await checkin(ben);
    const { feed } = (await anna.get('/dashboard')).body;
    expect(feed.map((c: any) => c.displayName)).toEqual(['Ben', 'Anna']);
    expect(feed[0].photo.thumbUrl).toMatch(/^\/api\/v1\/photos\/[0-9A-Z]{26}\/thumb$/);
    expect((await anna.get(feed[0].photo.thumbUrl)).status).toBe(200);
  });

  it('der Feed zeigt keine Check-ins vergangener Wochen und keine fremder Teams', async () => {
    const env = createTestEnv();
    const { anna } = await coupleWithGoals(env);
    const carla = env.client({ ip: '203.0.113.88' });
    await carla.registerFounder('carla@example.org', 'Carla');
    await checkin(carla);
    await checkin(anna);
    env.clock.set(berlin('2026-03-17T10:00:00Z')); // eine Woche später
    expect((await anna.get('/dashboard')).body.feed).toEqual([]);
    env.clock.set(berlin('2026-03-10T11:00:00Z'));
    expect((await anna.get('/dashboard')).body.feed.map((c: any) => c.displayName)).toEqual([
      'Anna',
    ]);
  });

  it('jeder Partner wird in seiner Zeitzone bewertet (Auckland ist schon in der neuen Woche)', async () => {
    const env = createTestEnv();
    const anna = env.client({ ip: '203.0.113.91' });
    const ben = env.client({ ip: '203.0.113.92' });
    await anna.registerFounder('anna@example.org', 'Anna', 'Europe/Berlin');
    await ben.registerWithInvite(
      (await anna.post('/teams/invites')).body.code,
      'ben@example.org',
      'Ben',
      'Pacific/Auckland',
    );
    env.clock.set(berlin('2026-03-08T12:00:00Z')); // Sonntag 13:00 in Berlin, Montag 01:00 in Auckland
    const { body } = await anna.get('/dashboard');
    expect(me(body)).toMatchObject({ weekStart: '2026-03-02', timezone: 'Europe/Berlin' });
    expect(partner(body)).toMatchObject({
      weekStart: '2026-03-09',
      timezone: 'Pacific/Auckland',
      doneDays: 0,
    });
    expect(me(body).weekEndsAt).toBe(weekEndInstant('2026-03-02', 'Europe/Berlin'));
    expect(partner(body).weekEndsAt).toBe(weekEndInstant('2026-03-09', 'Pacific/Auckland'));
    expect(partner(body).days[0]).toMatchObject({ date: '2026-03-09', isToday: true });
  });

  it('gibt keine E-Mail-Adressen oder Hashes preis', async () => {
    const env = createTestEnv();
    const { anna } = await coupleWithGoals(env);
    await checkin(anna);
    const text = JSON.stringify((await anna.get('/dashboard')).body);
    expect(text).not.toMatch(/@example|argon2|photoSha|photo_key|photoKey/);
  });
});
