import { describe, expect, it } from 'vitest';
import { pickColor } from '../src/domain/colors.js';
import { createCouple, createTestEnv, PASSWORD, SETUP_TOKEN } from './helpers.js';

const me = async (c: { get: (p: string) => Promise<{ body: any }> }) => (await c.get('/me')).body;

describe('Identitätsfarbe: Auswahl der Standardfarbe', () => {
  it('nimmt den Standard des Platzes, sonst die erste freie Farbe', () => {
    expect(pickColor(1, null)).toBe('ember');
    expect(pickColor(2, 'ember')).toBe('tide');
    expect(pickColor(2, 'tide')).toBe('ember');
    expect(pickColor(1, 'ember')).toBe('tide');
    expect(pickColor(2, 'tide', 'orchid')).toBe('orchid');
    expect(pickColor(2, 'orchid', 'orchid')).toBe('tide');
  });
});

describe('Identitätsfarbe im Team', () => {
  it('Gründer bekommt Ember, Partner Tide', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    expect((await me(anna)).user.color).toBe('ember');
    expect((await me(ben)).user.color).toBe('tide');
    const members = (await anna.get('/team')).body.team.members;
    expect(members.map((m: any) => [m.slot, m.color])).toEqual([
      [1, 'ember'],
      [2, 'tide'],
    ]);
  });

  it('übernimmt die Wunschfarbe bei der Registrierung', async () => {
    const env = createTestEnv();
    const anna = env.client({ ip: '203.0.113.21' });
    const res = await anna.post('/auth/register', {
      email: 'anna@example.org',
      password: PASSWORD,
      displayName: 'Anna',
      timezone: 'Europe/Berlin',
      setupToken: SETUP_TOKEN,
      color: 'orchid',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.color).toBe('orchid');
    anna.adopt(res);
    const invite = await anna.post('/teams/invites');
    const ben = env.client({ ip: '203.0.113.22' });
    const joined = await ben.post('/auth/register', {
      email: 'ben@example.org',
      password: PASSWORD,
      displayName: 'Ben',
      timezone: 'Europe/Berlin',
      inviteCode: invite.body.code,
      color: 'moss',
    });
    expect(joined.status).toBe(201);
    expect(joined.body.user.color).toBe('moss');
  });

  it('lehnt beim Beitritt die Farbe des Partners ab; ohne Wunsch gibt es eine freie', async () => {
    const env = createTestEnv();
    const anna = env.client({ ip: '203.0.113.23' });
    anna.adopt(
      await anna.post('/auth/register', {
        email: 'anna@example.org',
        password: PASSWORD,
        displayName: 'Anna',
        timezone: 'Europe/Berlin',
        setupToken: SETUP_TOKEN,
        color: 'tide',
      }),
    );
    const invite = (await anna.post('/teams/invites')).body.code;
    const body = {
      password: PASSWORD,
      displayName: 'Ben',
      timezone: 'Europe/Berlin',
      inviteCode: invite,
    };
    const clash = await env
      .client({ ip: '203.0.113.24' })
      .post('/auth/register', { ...body, email: 'ben@example.org', color: 'tide' });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('color_taken');
    // der fehlgeschlagene Versuch hat weder Konto noch Platz verbraucht
    expect(env.ctx.db.$client.prepare('SELECT COUNT(*) n FROM users').get()).toEqual({ n: 1 });
    // Standard von Platz 2 wäre Tide (vergeben): dann gilt die erste freie
    const ok = await env
      .client({ ip: '203.0.113.25' })
      .post('/auth/register', { ...body, email: 'ben@example.org' });
    expect(ok.status).toBe(201);
    expect(ok.body.user.color).toBe('ember');
  });

  it('zeigt Einladenden und seine Farbe in der öffentlichen Vorschau', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    await anna.patch('/me', { color: 'orchid' });
    const code = (await anna.post('/teams/invites')).body.code;
    const preview = await env.client({ ip: '203.0.113.99' }).get(`/invites/${code}`);
    expect(preview.body).toEqual({
      inviterName: 'Anna',
      inviterColor: 'orchid',
      teamName: 'Unser Team',
    });
  });

  it('ändert die Farbe per PATCH /me und lehnt die des Partners ab', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    const res = await ben.patch('/me', { color: 'sky' });
    expect(res.status).toBe(200);
    expect(res.body.user.color).toBe('sky');
    expect((await anna.get('/team')).body.team.members[1].color).toBe('sky');

    const clash = await anna.patch('/me', { color: 'sky' });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('color_taken');
    expect((await me(anna)).user.color).toBe('ember');

    // die eigene Farbe erneut zu setzen ist erlaubt, die frei gewordene ebenfalls
    expect((await anna.patch('/me', { color: 'ember' })).status).toBe(200);
    expect((await anna.patch('/me', { color: 'tide' })).status).toBe(200);
  });

  it('weist unbekannte Farben ab (Validierung)', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    for (const color of ['pink', '#ff0000', '', 7, null]) {
      expect((await anna.patch('/me', { color })).status).toBe(400);
    }
  });

  it('Farbe allein zählt als Änderung; eine leere Anfrage nicht', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    expect((await anna.patch('/me', {})).status).toBe(400);
    expect((await anna.patch('/me', { color: 'cocoa' })).status).toBe(200);
  });

  it('Dashboard und Verlauf liefern Platz und Farbe jeder Person', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    await ben.patch('/me', { color: 'graphite' });
    const dash = (await anna.get('/dashboard')).body;
    expect(dash.members.map((m: any) => [m.displayName, m.slot, m.color])).toEqual([
      ['Anna', 1, 'ember'],
      ['Ben', 2, 'graphite'],
    ]);
    const history = (await ben.get('/history')).body;
    expect(history.weeks).toEqual([]);
  });

  it('nach dem Auflösen des Teams behält jede Person ihre Farbe und kann sie frei wählen', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    expect((await anna.request('DELETE', '/team', { password: PASSWORD })).status).toBe(200);
    expect((await ben.patch('/me', { color: 'ember' })).status).toBe(200);
    expect((await me(ben)).user.color).toBe('ember');
  });

  it('Beitritt eines bestehenden Kontos per Code: Konflikt wird aufgelöst, Wunsch ist möglich', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    expect((await ben.request('DELETE', '/team', { password: PASSWORD })).status).toBe(200);
    // Ben (Tide) tritt einem neuen Team bei, dessen Gründerin ebenfalls Tide hat
    const clara = env.client({ ip: '203.0.113.31' });
    clara.adopt(
      await clara.post('/auth/register', {
        email: 'clara@example.org',
        password: PASSWORD,
        displayName: 'Clara',
        timezone: 'Europe/Berlin',
        setupToken: SETUP_TOKEN,
        color: 'tide',
      }),
    );
    const code = (await clara.post('/teams/invites')).body.code;
    const joined = await ben.post('/teams/join', { code });
    expect(joined.status).toBe(200);
    const colors = joined.body.team.members.map((m: any) => m.color);
    expect(new Set(colors).size).toBe(2);
    expect(await me(anna)).toBeTruthy();
  });

  it('exportiert die Farbe im Profil', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    await anna.patch('/me', { color: 'moss' });
    const grant = (await anna.post('/me/export', { password: PASSWORD })).body;
    const zip = await anna.get(grant.downloadUrl);
    expect(zip.status).toBe(200);
    const { unzipSync, strFromU8 } = await import('fflate');
    const data = JSON.parse(strFromU8(unzipSync(new Uint8Array(zip.body))['data.json']!));
    expect(data.profile.color).toBe('moss');
  });
});
