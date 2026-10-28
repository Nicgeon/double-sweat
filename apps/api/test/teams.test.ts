import { describe, expect, it } from 'vitest';
import { createTeamInvite, createTeamTx } from '../src/modules/teams/service.js';
import { DAY } from '../src/util/time.js';
import { createCouple, createTestEnv, PASSWORD, SETUP_TOKEN, type TestEnv } from './helpers.js';

const noToken = {
  email: 'x@example.org',
  password: PASSWORD,
  displayName: 'X',
  timezone: 'Europe/Berlin',
};

describe('Einladungen', () => {
  it('erzeugt einen Code, der nur gehasht gespeichert wird', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const res = await anna.post('/teams/invites');
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    expect(res.body.joinUrl).toBe(`https://ds.test/join/${res.body.code}`);
    expect(res.body.expiresAt - env.clock.now()).toBe(7 * DAY);
    const dump = JSON.stringify(env.ctx.db.$client.prepare('SELECT * FROM invites').all());
    expect(dump).not.toContain(res.body.code);
    expect(dump).not.toContain(res.body.code.replaceAll('-', ''));
  });

  it('zeigt die Vorschau öffentlich und ohne Daten des Teams preiszugeben', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const { body } = await anna.post('/teams/invites');
    const preview = await env.client({ ip: '203.0.113.200' }).get(`/invites/${body.code}`);
    expect(preview.status).toBe(200);
    expect(preview.body).toEqual({
      inviterName: 'Anna',
      inviterColor: 'ember',
      teamName: 'Unser Team',
    });
    expect((await env.client().get('/invites/AAAA-BBBB-CCCC-DDDD')).status).toBe(404);
    expect((await env.client().get('/invites/quatsch')).status).toBe(404);
  });

  it('begrenzt Vorschau-Anfragen pro IP (Erraten von Codes)', async () => {
    const env = createTestEnv();
    const c = env.client({ ip: '203.0.113.201' });
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await c.get('/invites/AAAA-BBBB-CCCC-DDDD')).status;
    expect(last).toBe(429);
  });

  it('Partner tritt per Code bei: Team wird vollständig', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    const team = (await ben.get('/team')).body.team;
    expect(team.full).toBe(true);
    expect(team.fullSince).toBe(env.clock.now());
    expect(
      team.members.map((m: { displayName: string; slot: number }) => [m.displayName, m.slot]),
    ).toEqual([
      ['Anna', 1],
      ['Ben', 2],
    ]);
    expect(team.members.filter((m: { isMe: boolean }) => m.isMe)).toHaveLength(1);
    expect(JSON.stringify(team)).not.toContain('@example.org');
    expect((await anna.get('/team')).body.team.id).toBe(team.id);
    expect(team.invite).toBeNull();
  });

  it('ist nur einmal verwendbar', async () => {
    const env = createTestEnv();
    const { inviteCode } = await createCouple(env);
    const res = await env
      .client({ ip: '203.0.113.13' })
      .post('/auth/register', { ...noToken, inviteCode });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_invite');
  });

  it('gleichzeitige Beitritte mit demselben Code: genau einer gewinnt', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const { body } = await anna.post('/teams/invites');
    const attempts = await Promise.all(
      ['b@example.org', 'c@example.org', 'd@example.org'].map((email, i) =>
        env
          .client({ ip: `203.0.113.${30 + i}` })
          .post('/auth/register', { ...noToken, email, inviteCode: body.code }),
      ),
    );
    expect(attempts.filter((r) => r.status === 201)).toHaveLength(1);
    const members = env.ctx.db.$client.prepare('SELECT COUNT(*) AS n FROM memberships').get() as {
      n: number;
    };
    expect(members.n).toBe(2);
  });

  it('läuft nach 7 Tagen ab', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const { body } = await anna.post('/teams/invites');
    env.clock.advance(7 * DAY + 1);
    const res = await env
      .client({ ip: '203.0.113.40' })
      .post('/auth/register', { ...noToken, inviteCode: body.code });
    expect(res.status).toBe(400);
    expect((await env.client({ ip: '203.0.113.41' }).get(`/invites/${body.code}`)).status).toBe(
      404,
    );
  });

  it('eine neue Einladung ersetzt die alte, Widerruf funktioniert', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const first = (await anna.post('/teams/invites')).body.code;
    const second = (await anna.post('/teams/invites')).body.code;
    expect(
      (
        await env
          .client({ ip: '203.0.113.42' })
          .post('/auth/register', { ...noToken, inviteCode: first })
      ).status,
    ).toBe(400);
    expect((await anna.get('/team')).body.team.invite).not.toBeNull();
    expect((await anna.delete('/teams/invites')).status).toBe(200);
    expect((await anna.get('/team')).body.team.invite).toBeNull();
    expect(
      (
        await env
          .client({ ip: '203.0.113.43' })
          .post('/auth/register', { ...noToken, inviteCode: second })
      ).status,
    ).toBe(400);
  });

  it('akzeptiert Schreibvarianten des Codes', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    const { body } = await anna.post('/teams/invites');
    const sloppy = ` ${body.code.toLowerCase().replaceAll('-', ' ')} `;
    expect(
      (
        await env
          .client({ ip: '203.0.113.44' })
          .post('/auth/register', { ...noToken, inviteCode: sloppy })
      ).status,
    ).toBe(201);
  });

  it('ein volles Team kann keine weitere Einladung erzeugen', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    const res = await anna.post('/teams/invites');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('team_full');
  });
});

describe('Team verlassen, auflösen, erneut beitreten', () => {
  it('Team auflösen braucht das Passwort; beide Konten bleiben bestehen', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    expect((await anna.delete('/team', { password: 'falsch-falsch' })).status).toBe(403);
    expect((await anna.delete('/team', { password: PASSWORD })).status).toBe(200);
    expect((await ben.get('/team')).status).toBe(404);
    expect((await ben.get('/me')).body.team).toBeNull();
    expect((await anna.get('/me')).body.user.email).toBe('anna@example.org');
  });

  it('Konto ohne Team kann per Code einem anderen Team beitreten', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    await anna.delete('/team', { password: PASSWORD });
    const carla = env.client({ ip: '203.0.113.90' });
    await carla.registerFounder('carla@example.org', 'Carla');
    const invite = (await carla.post('/teams/invites')).body.code;
    const res = await ben.post('/teams/join', { code: invite });
    expect(res.status).toBe(200);
    expect(res.body.team.full).toBe(true);
    expect((await ben.post('/teams/join', { code: invite })).status).toBe(409); // bereits im Team
  });

  it('ein Konto ohne Team gründet ein neues Team nur nach den Signup-Regeln', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    await anna.delete('/team', { password: PASSWORD });
    expect((await anna.post('/teams', { name: 'Neu' })).status).toBe(403);
    const ok = await anna.post('/teams', { name: 'Neu', setupToken: SETUP_TOKEN });
    expect(ok.status).toBe(201);
    expect(ok.body.team).toMatchObject({ name: 'Neu', full: false });
  });

  it('Konto löschen: Team des Partners bleibt, wird unvollständig, neue Einladung möglich', async () => {
    const env = createTestEnv();
    const { anna, ben } = await createCouple(env);
    expect((await ben.delete('/me', { password: PASSWORD })).status).toBe(200);
    const team = (await anna.get('/team')).body.team;
    expect(team.full).toBe(false);
    expect(team.members).toHaveLength(1);
    expect((await anna.post('/teams/invites')).status).toBe(201);
  });

  it('Konto löschen als letztes Mitglied entfernt das Team', async () => {
    const env = createTestEnv();
    const anna = env.client();
    await anna.registerFounder();
    await anna.delete('/me', { password: PASSWORD });
    const n = env.ctx.db.$client.prepare('SELECT COUNT(*) AS n FROM teams').get() as { n: number };
    expect(n.n).toBe(0);
  });
});

describe('SIGNUP_MODE', () => {
  const founder = (env: TestEnv, extra: Record<string, unknown> = {}, ip = '203.0.113.110') =>
    env.client({ ip }).post('/auth/register', { ...noToken, ...extra });

  it('token: ohne oder mit falschem Setup-Token keine Teamgründung', async () => {
    const env = createTestEnv();
    const missing = await founder(env);
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe('invalid_setup_token');
    expect((await founder(env, { setupToken: 'falsch' })).status).toBe(403);
    expect((await founder(env, { setupToken: SETUP_TOKEN })).status).toBe(201);
  });

  it('open: jeder darf ein Team gründen', async () => {
    const env = createTestEnv({ env: { SIGNUP_MODE: 'open' } });
    expect((await founder(env)).status).toBe(201);
    expect((await env.client().get('/health')).body.signup).toEqual({
      mode: 'open',
      requiresSetupToken: false,
    });
  });

  it('invite-only: keine Teamgründung per Web, Beitritt per Einladung geht', async () => {
    const env = createTestEnv({ env: { SIGNUP_MODE: 'invite-only' } });
    const blocked = await founder(env, { setupToken: SETUP_TOKEN });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('signup_disabled');

    const team = env.ctx.db.transaction((tx) => createTeamTx(tx, 'Via CLI', env.clock.now()), {
      behavior: 'immediate',
    });
    const { code } = createTeamInvite(env.ctx, team.id, null);
    const joined = await founder(env, { inviteCode: code }, '203.0.113.111');
    expect(joined.status).toBe(201);
    expect(joined.body.team.name).toBe('Via CLI');
  });

  it('closed: gar keine Registrierung, auch nicht mit Einladung', async () => {
    const env = createTestEnv({ env: { SIGNUP_MODE: 'closed' } });
    const team = env.ctx.db.transaction((tx) => createTeamTx(tx, 'Via CLI', env.clock.now()), {
      behavior: 'immediate',
    });
    const { code } = createTeamInvite(env.ctx, team.id, null);
    expect((await founder(env, { inviteCode: code })).status).toBe(403);
    expect((await founder(env, { setupToken: SETUP_TOKEN }, '203.0.113.112')).status).toBe(403);
  });

  it('MAX_TEAMS begrenzt Teamgründungen, nicht den Beitritt', async () => {
    const env = createTestEnv({ env: { SIGNUP_MODE: 'open', MAX_TEAMS: '1' } });
    const first = env.client({ ip: '203.0.113.120' });
    expect((await first.registerFounder()).status).toBe(201);
    const second = await founder(env, { email: 'zweite@example.org' }, '203.0.113.121');
    expect(second.status).toBe(403);
    expect(second.body.error.code).toBe('team_limit');
    const { code } = (await first.post('/teams/invites')).body;
    expect(
      (await founder(env, { email: 'partner@example.org', inviteCode: code }, '203.0.113.122'))
        .status,
    ).toBe(201);
  });
});

describe('Mandantentrennung', () => {
  it('ein Nutzer sieht nur sein eigenes Team', async () => {
    const env = createTestEnv();
    const { anna } = await createCouple(env);
    const other = env.client({ ip: '203.0.113.130' });
    await other.registerFounder('carla@example.org', 'Carla');
    const mine = (await other.get('/team')).body.team;
    const annas = (await anna.get('/team')).body.team;
    expect(mine.id).not.toBe(annas.id);
    expect(mine.members.map((m: { displayName: string }) => m.displayName)).toEqual(['Carla']);
  });
});
