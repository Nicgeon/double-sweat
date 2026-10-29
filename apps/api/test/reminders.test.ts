import { describe, expect, it } from 'vitest';
import { remindersJob } from '../src/jobs/reminders.js';
import { newDevice, pushEnv, startPushServer } from './push-helpers.js';
import { checkinDays, noon, type Pair, pair, W1 } from './scenario.js';

// Woche 1 = Mo 09.03. bis So 15.03.2026, Berlin in Normalzeit (UTC+1)
const berlin = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+01:00`);
const auckland = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+13:00`);
const FRI = '2026-03-13';

const inbox = (p: Pair, name: string, type = 'reminder') =>
  p.env.ctx.db.$client
    .prepare(
      `SELECT n.body AS body, n.data_json AS data FROM notifications n JOIN users u ON u.id = n.user_id
       WHERE u.display_name = ? AND n.type = ? ORDER BY n.created_at`,
    )
    .all(name, type) as { body: string; data: string | null }[];

const run = async (p: Pair, at: number) => {
  p.env.clock.set(at);
  remindersJob(p.env.ctx);
  await p.env.ctx.idle();
};

describe('Abend-Erinnerung', () => {
  it('erinnert, wenn jeder verbleibende Tag gebraucht wird (kein Puffer mehr)', async () => {
    const p = await pair({ annaGoal: 3, benGoal: 2 });
    // Freitag: noch 3 Tage (Fr, Sa, So), Anna braucht 3 → gefährdet. Ben braucht 2 von 3 → noch Puffer.
    await run(p, berlin(FRI, '19:00'));
    expect(inbox(p, 'Anna')).toHaveLength(1);
    expect(inbox(p, 'Ben')).toEqual([]);
    expect(inbox(p, 'Anna')[0]).toMatchObject({
      body: 'Dir fehlen noch 3 Tage für dein Wochenziel, und jeder verbleibende Tag zählt. Heute schon trainiert?',
    });
    expect(JSON.parse(inbox(p, 'Anna')[0]!.data!)).toEqual({ weekStart: W1, needed: 3 });
  });

  it('schreibt im Singular, wenn nur noch ein Tag fehlt', async () => {
    const p = await pair({ annaGoal: 3, benGoal: 2 });
    await checkinDays(p.env, p.anna, W1, 2); // Mo, Di erledigt
    await run(p, berlin('2026-03-15', '19:00')); // Sonntag: noch 1 Tag, 1 fehlt
    expect(inbox(p, 'Anna')[0]?.body).toBe(
      'Heute noch trainieren: Dir fehlt noch ein Tag für dein Wochenziel, und es bleibt kein Puffer.',
    );
  });

  it('erinnert nicht, solange noch Puffer da ist', async () => {
    const p = await pair({ annaGoal: 3, benGoal: 2 });
    for (const day of ['2026-03-10', '2026-03-11', '2026-03-12'])
      await run(p, berlin(day, '19:00')); // Di bis Do
    expect(inbox(p, 'Anna')).toEqual([]);
  });

  it('erinnert nicht, wenn das Ziel unerreichbar ist oder schon erreicht wurde', async () => {
    const p = await pair({ annaGoal: 3, benGoal: 1 });
    await checkinDays(p.env, p.ben, W1, 1); // Ben hat sein Ziel erreicht
    await run(p, berlin('2026-03-15', '19:00')); // Sonntag: Anna braucht 3, hat 0, nur 1 Tag übrig
    expect(inbox(p, 'Anna')).toEqual([]);
    expect(inbox(p, 'Ben')).toEqual([]);
  });

  it('erinnert nicht, wenn heute schon eingecheckt wurde', async () => {
    const p = await pair({ annaGoal: 3, benGoal: 2 });
    p.env.clock.set(berlin(FRI, '08:00'));
    const { noisyJpeg, photoForm } = await import('./fixtures.js');
    await p.anna.get('/me');
    // Anna hat am Freitag Vormittag eingecheckt: sie braucht dann 2 von noch 2 Tagen, aber heute ist erledigt
    expect((await p.anna.upload('/checkins', photoForm(await noisyJpeg()))).status).toBe(201);
    await run(p, berlin(FRI, '19:00'));
    expect(inbox(p, 'Anna')).toEqual([]);
  });

  it('erinnert nur zur eingestellten Zeit und holt sie bis 22:00 Uhr nach', async () => {
    const p = await pair({ annaGoal: 3, benGoal: 2 });
    await run(p, berlin(FRI, '18:59'));
    expect(inbox(p, 'Anna')).toEqual([]);
    await run(p, berlin(FRI, '19:00'));
    expect(inbox(p, 'Anna')).toHaveLength(1);
  });

  it('Neustart um 20:30: Erinnerung wird nachgeholt', async () => {
    const p = await pair({ annaGoal: 3, benGoal: 2 });
    await run(p, berlin(FRI, '20:30'));
    expect(inbox(p, 'Anna')).toHaveLength(1);
  });

  it('Neustart nach 22:00: keine Erinnerung mitten in der Nacht', async () => {
    const p = await pair({ annaGoal: 3, benGoal: 2 });
    await run(p, berlin(FRI, '22:01'));
    await run(p, berlin(FRI, '23:59'));
    expect(inbox(p, 'Anna')).toEqual([]);
  });

  it('sendet pro Tag höchstens eine Erinnerung, egal wie oft der Job läuft', async () => {
    const p = await pair({ annaGoal: 3, benGoal: 2 });
    for (const time of ['19:00', '19:01', '19:30', '20:00', '21:59'])
      await run(p, berlin(FRI, time));
    expect(inbox(p, 'Anna')).toHaveLength(1);
    expect(
      (
        p.env.ctx.db.$client.prepare('SELECT COUNT(*) AS n FROM reminder_log').get() as {
          n: number;
        }
      ).n,
    ).toBe(1);
    // Am nächsten Abend gibt es wieder eine (Samstag: 2 Tage übrig, Anna braucht weiterhin 3 → unerreichbar, also keine)
    await run(p, berlin('2026-03-14', '19:00'));
    expect(inbox(p, 'Anna')).toHaveLength(1);
  });

  it('nutzt die persönliche Uhrzeit', async () => {
    const p = await pair({ annaGoal: 3, benGoal: 2 });
    p.env.clock.set(berlin(FRI, '07:00'));
    await p.anna.get('/me');
    expect((await p.anna.patch('/me', { reminderTime: '07:30' })).status).toBe(200);
    await run(p, berlin(FRI, '07:29'));
    expect(inbox(p, 'Anna')).toEqual([]);
    await run(p, berlin(FRI, '07:30'));
    expect(inbox(p, 'Anna')).toHaveLength(1);
    await run(p, berlin(FRI, '19:00')); // am Abend nicht noch einmal
    expect(inbox(p, 'Anna')).toHaveLength(1);
  });

  it('eine Uhrzeit nach 22:00 hat trotzdem eine Stunde Zeitfenster', async () => {
    const p = await pair({ annaGoal: 3, benGoal: 2 });
    p.env.clock.set(berlin(FRI, '08:00'));
    await p.anna.get('/me');
    await p.anna.patch('/me', { reminderTime: '23:00' });
    await run(p, berlin(FRI, '23:30'));
    expect(inbox(p, 'Anna')).toHaveLength(1);
  });

  it('richtet sich nach der Zeitzone des Nutzers', async () => {
    const p = await pair({
      annaGoal: 3,
      benGoal: 3,
      annaTz: 'Europe/Berlin',
      benTz: 'Pacific/Auckland',
    });
    // Freitag 19:00 in Auckland (UTC+13) = 06:00 UTC; in Berlin ist es da erst 07:00
    await run(p, auckland(FRI, '19:00'));
    expect(inbox(p, 'Ben')).toHaveLength(1);
    expect(inbox(p, 'Anna')).toEqual([]);
    // Freitag 19:00 in Berlin = 18:00 UTC; in Auckland ist es Samstag 07:00
    await run(p, berlin(FRI, '19:00'));
    expect(inbox(p, 'Anna')).toHaveLength(1);
    expect(inbox(p, 'Ben')).toHaveLength(1);
  });

  it('erinnert nicht in der Beitrittswoche (sie wird nicht gewertet)', async () => {
    const p = await pair({ annaGoal: 3, benGoal: 2 });
    const annaId = (await p.anna.get('/me')).body.user.id as string;
    // Künstliches Ziel in der Beitrittswoche, das ohne Schutz am Sonntag eine Erinnerung auslösen würde
    p.env.ctx.db.$client
      .prepare(
        'INSERT OR REPLACE INTO weekly_goals (user_id, effective_from, days, created_at) VALUES (?, ?, ?, ?)',
      )
      .run(annaId, '2026-03-02', 7, 0);
    await run(p, berlin('2026-03-08', '19:00'));
    expect(inbox(p, 'Anna')).toEqual([]);
  });

  it('erinnert ohne Ziel und in unvollständigen Teams nicht', async () => {
    const p = await pair({ annaGoal: 3, benGoal: 2 });
    p.env.ctx.db.$client.prepare('DELETE FROM weekly_goals').run();
    await run(p, berlin(FRI, '19:00'));
    expect(inbox(p, 'Anna')).toEqual([]);

    const solo = await pair({ annaGoal: 3, benGoal: 2 });
    solo.env.clock.set(noon('2026-03-05'));
    await solo.ben.get('/me');
    await solo.ben.delete('/me', { password: 'correct horse battery' });
    await run(solo, berlin(FRI, '19:00'));
    expect(inbox(solo, 'Anna')).toEqual([]);
  });

  it('wird als verschlüsselter Push zugestellt (TTL 2 Stunden)', async () => {
    const server = await startPushServer();
    try {
      const env = pushEnv();
      const anna = env.client({ ip: '203.0.113.11' });
      const ben = env.client({ ip: '203.0.113.12' });
      await anna.registerFounder();
      const invite = (await anna.post('/teams/invites')).body.code;
      await ben.registerWithInvite(invite);
      await anna.put('/goals/next', { days: 3 });
      await ben.put('/goals/next', { days: 2 });
      const device = newDevice(`${server.base}/anna-geraet`);
      await anna.post('/push/subscriptions', {
        provider: 'webpush',
        endpoint: device.endpoint,
        keys: device.keys,
      });

      env.clock.set(berlin(FRI, '19:00'));
      remindersJob(env.ctx);
      await env.ctx.idle();
      expect(server.requests).toHaveLength(1);
      expect(server.requests[0]!.headers.ttl).toBe('7200');
      expect(JSON.parse(device.decrypt(server.requests[0]!.body))).toMatchObject({
        type: 'reminder',
        title: 'Double Sweat',
      });
    } finally {
      await server.close();
    }
  });
});
