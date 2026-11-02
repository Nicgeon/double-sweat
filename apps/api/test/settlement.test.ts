import { describe, expect, it } from 'vitest';
import { settleWeeksJob } from '../src/jobs/settle-weeks.js';
import { firstScoredWeek, settleDueWeeks } from '../src/modules/settlement/service.js';
import { PASSWORD } from './helpers.js';
import { afterWeek, checkinDays, debtRows, noon, pair, results, W1, W2, W3 } from './scenario.js';

describe('Wochenabschluss', () => {
  it('rechnet nichts ab, solange keine gewertete Woche vorbei ist', async () => {
    const { env } = await pair();
    expect(settleDueWeeks(env.ctx)).toEqual([]);
    env.clock.set(noon('2026-03-12')); // mitten in Woche 1
    expect(settleDueWeeks(env.ctx)).toEqual([]);
    expect(results(env)).toEqual([]);
  });

  it('die Beitrittswoche zählt nicht, die erste volle Woche danach schon', async () => {
    const { env } = await pair();
    env.clock.set(afterWeek('2026-03-02')); // Woche 03-02 ist vorbei
    expect(settleDueWeeks(env.ctx)).toEqual([]); // Team wurde mitten in dieser Woche vollständig
    env.clock.set(afterWeek(W1));
    expect(settleDueWeeks(env.ctx)).toHaveLength(2);
    expect(results(env).map((r) => r.week)).toEqual([W1, W1]);
  });

  it('wertet erreicht, verfehlt und Übererfüllung korrekt', async () => {
    const { env, anna, ben } = await pair({ annaGoal: 3, benGoal: 2 });
    await checkinDays(env, anna, W1, 5); // 5 von 3: übererfüllt
    await checkinDays(env, ben, W1, 1); //  1 von 2: verfehlt
    env.clock.set(afterWeek(W1));
    settleDueWeeks(env.ctx);
    expect(results(env)).toEqual([
      { name: 'Anna', week: W1, goal: 3, done: 5, met: 1 },
      { name: 'Ben', week: W1, goal: 2, done: 1, met: 0 },
    ]);
    expect(debtRows(env)).toEqual([
      { week: W1, debtor: 'Ben', creditor: 'Anna', bet: 'Der Verlierer kocht' },
    ]);
  });

  it('beide erreichen das Ziel: keine Schuld', async () => {
    const { env, anna, ben } = await pair();
    await checkinDays(env, anna, W1, 3);
    await checkinDays(env, ben, W1, 2);
    env.clock.set(afterWeek(W1));
    settleDueWeeks(env.ctx);
    expect(results(env).map((r) => r.met)).toEqual([1, 1]);
    expect(debtRows(env)).toEqual([]);
  });

  it('beide verfehlen: jeder schuldet dem anderen den Einsatz', async () => {
    const { env, anna } = await pair();
    await checkinDays(env, anna, W1, 1);
    env.clock.set(afterWeek(W1));
    settleDueWeeks(env.ctx);
    expect(debtRows(env)).toEqual([
      { week: W1, debtor: 'Anna', creditor: 'Ben', bet: 'Der Verlierer kocht' },
      { week: W1, debtor: 'Ben', creditor: 'Anna', bet: 'Der Verlierer kocht' },
    ]);
  });

  it('ist idempotent: ein zweiter Lauf ändert nichts', async () => {
    const { env, anna } = await pair();
    await checkinDays(env, anna, W1, 1);
    env.clock.set(afterWeek(W1));
    expect(settleDueWeeks(env.ctx)).toHaveLength(2);
    const before = { results: results(env), debts: debtRows(env) };
    expect(settleDueWeeks(env.ctx)).toEqual([]);
    expect(settleDueWeeks(env.ctx)).toEqual([]);
    expect({ results: results(env), debts: debtRows(env) }).toEqual(before);
  });

  it('holt verpasste Wochen der Reihe nach nach (Neustart nach längerer Pause)', async () => {
    const { env, anna, ben } = await pair({ annaGoal: 2, benGoal: 2 });
    await checkinDays(env, anna, W1, 2); // Woche 1: Anna ok, Ben verfehlt
    await checkinDays(env, ben, W1, 1);
    await checkinDays(env, ben, W2, 2); // Woche 2: Ben ok, Anna verfehlt
    await checkinDays(env, anna, W2, 1);
    await checkinDays(env, anna, W3, 2); // Woche 3: beide ok
    await checkinDays(env, ben, W3, 2);

    // Server war die ganze Zeit aus: ein einziger Lauf nach Woche 3
    env.clock.set(afterWeek(W3));
    const settled = settleDueWeeks(env.ctx);
    expect(settled).toHaveLength(6);
    // pro Nutzer aufsteigend: erst alle Wochen des einen, dann des anderen
    for (const userId of new Set(settled.map((s) => s.userId))) {
      expect(settled.filter((s) => s.userId === userId).map((s) => s.weekStart)).toEqual([
        W1,
        W2,
        W3,
      ]);
    }
    expect(results(env)).toEqual([
      { name: 'Anna', week: W1, goal: 2, done: 2, met: 1 },
      { name: 'Ben', week: W1, goal: 2, done: 1, met: 0 },
      { name: 'Anna', week: W2, goal: 2, done: 1, met: 0 },
      { name: 'Ben', week: W2, goal: 2, done: 2, met: 1 },
      { name: 'Anna', week: W3, goal: 2, done: 2, met: 1 },
      { name: 'Ben', week: W3, goal: 2, done: 2, met: 1 },
    ]);
    expect(debtRows(env)).toEqual([
      { week: W1, debtor: 'Ben', creditor: 'Anna', bet: 'Der Verlierer kocht' },
      { week: W2, debtor: 'Anna', creditor: 'Ben', bet: 'Der Verlierer kocht' },
    ]);
  });

  it('ein Absturz mitten im Abschluss hinterlässt nichts Halbes; der nächste Lauf macht weiter', async () => {
    const { env, anna } = await pair();
    await checkinDays(env, anna, W1, 1);
    env.clock.set(afterWeek(W1));
    const insertDebt = env.ctx.db.$client.prepare(
      `CREATE TRIGGER fail_debt BEFORE INSERT ON debts BEGIN SELECT RAISE(ABORT, 'simulierter Absturz'); END`,
    );
    insertDebt.run();
    expect(() => settleDueWeeks(env.ctx)).toThrow(/Absturz/);
    // Transaktion zurückgerollt: kein Ergebnis ohne zugehörige Schuld
    expect(results(env).filter((r) => r.met === 0)).toEqual([]);
    env.ctx.db.$client.prepare('DROP TRIGGER fail_debt').run();
    settleDueWeeks(env.ctx);
    expect(results(env)).toHaveLength(2);
    expect(debtRows(env)).toHaveLength(2);
  });

  it('friert das Ziel ein: spätere Änderungen wirken nicht zurück, die Folgewoche nutzt das neue Ziel', async () => {
    const { env, anna } = await pair({ annaGoal: 3 });
    env.clock.set(noon(W1));
    await anna.put('/goals/next', { days: 5 }); // gilt erst ab W2
    await checkinDays(env, anna, W1, 3);
    await checkinDays(env, anna, W2, 4);
    env.clock.set(afterWeek(W2));
    settleDueWeeks(env.ctx);
    const rows = results(env).filter((r) => r.name === 'Anna');
    expect(rows).toEqual([
      { name: 'Anna', week: W1, goal: 3, done: 3, met: 1 },
      { name: 'Anna', week: W2, goal: 5, done: 4, met: 0 },
    ]);
  });

  it('ohne gesetztes Ziel wird die Woche nicht gewertet und erzeugt keine Schuld', async () => {
    const { env, anna } = await pair();
    env.ctx.db.$client
      .prepare(
        'DELETE FROM weekly_goals WHERE user_id = (SELECT id FROM users WHERE display_name = ?)',
      )
      .run('Ben');
    await checkinDays(env, anna, W1, 3);
    env.clock.set(afterWeek(W1));
    settleDueWeeks(env.ctx);
    expect(results(env).find((r) => r.name === 'Ben')).toMatchObject({
      goal: null,
      met: null,
      done: 0,
    });
    expect(debtRows(env)).toEqual([]);
  });

  it('ohne Einsatz wird keine Woche gewertet (der Einsatz ist Pflicht)', async () => {
    const { env } = await pair({ bet: null });
    env.clock.set(afterWeek(W1));
    expect(settleDueWeeks(env.ctx)).toEqual([]);
    expect(results(env)).toEqual([]);
    expect(debtRows(env)).toEqual([]);
  });

  it('setzt das Team den Einsatz später, zählt es ab der laufenden Woche, nicht rückwirkend', async () => {
    const { env, anna } = await pair({ bet: null });
    env.clock.set(afterWeek(W1)); // Anfang Woche 2, Woche 1 ist vorbei und ohne Einsatz
    settleDueWeeks(env.ctx);
    await anna.get('/me');
    await anna.put('/bets', { text: 'Pizza' }); // gilt sofort, für Woche 2
    settleDueWeeks(env.ctx);
    expect(results(env)).toEqual([]);
    env.clock.set(afterWeek(W2));
    settleDueWeeks(env.ctx);
    expect(results(env).map((r) => r.week)).toEqual([W2, W2]);
    expect(debtRows(env).map((d) => d.bet)).toEqual(['Pizza', 'Pizza']);
  });

  it('jeder Partner wird zum Ende seiner eigenen Woche abgerechnet (Auckland vor Berlin)', async () => {
    const { env } = await pair({ annaTz: 'Europe/Berlin', benTz: 'Pacific/Auckland' });
    // Bens Woche 03-09 endet So 15.03. 11:00 UTC (Mo 00:00 NZDT), Annas erst um 23:00 UTC (Mo 00:00 CET)
    env.clock.set(Date.parse('2026-03-15T10:59:00Z'));
    expect(settleDueWeeks(env.ctx)).toEqual([]);
    env.clock.set(Date.parse('2026-03-15T11:01:00Z'));
    const first = settleDueWeeks(env.ctx);
    expect(first.map((s) => s.userId)).toHaveLength(1);
    expect(results(env).map((r) => r.name)).toEqual(['Ben']);
    env.clock.set(Date.parse('2026-03-15T23:01:00Z'));
    settleDueWeeks(env.ctx);
    expect(results(env).map((r) => r.name)).toEqual(['Anna', 'Ben']);
    expect(debtRows(env).map((d) => d.debtor)).toEqual(['Anna', 'Ben']);
  });

  it('wertet nur vollständige Teams: verlässt ein Partner das Team, wird nicht abgerechnet', async () => {
    const { env, ben } = await pair();
    expect((await ben.delete('/me', { password: PASSWORD })).status).toBe(200);
    env.clock.set(afterWeek(W2));
    expect(settleDueWeeks(env.ctx)).toEqual([]);
    expect(results(env)).toEqual([]);
  });

  it('ein neuer Partner startet frisch: ältere Wochen werden nie nachträglich bewertet', async () => {
    const { env, anna, ben } = await pair();
    await ben.delete('/me', { password: PASSWORD });
    env.clock.set(noon(W1));
    await anna.get('/me'); // aktiv bleiben, sonst läuft die Sitzung nach 14 Tagen Pause ab
    env.clock.set(noon(W2)); // Woche 2 läuft, Team ist unvollständig
    const code = (await anna.post('/teams/invites')).body.code;
    const carla = env.client({ ip: '203.0.113.77' });
    await carla.registerWithInvite(code, 'carla@example.org', 'Carla');
    await carla.put('/goals/next', { days: 2 });
    await anna.put('/goals/next', { days: 3 });
    env.clock.set(afterWeek(W2));
    expect(settleDueWeeks(env.ctx)).toEqual([]); // W2 war die Beitrittswoche
    env.clock.set(afterWeek(W3));
    settleDueWeeks(env.ctx);
    expect(results(env).map((r) => `${r.name}:${r.week}`)).toEqual([`Anna:${W3}`, `Carla:${W3}`]);
  });

  it('Konto löschen entfernt die Ergebnisse und Schulden dieses Nutzers', async () => {
    const { env, ben } = await pair();
    env.clock.set(afterWeek(W1));
    settleDueWeeks(env.ctx);
    expect(debtRows(env)).toHaveLength(2);
    await ben.delete('/me', { password: PASSWORD });
    expect(results(env).map((r) => r.name)).toEqual(['Anna']);
    expect(debtRows(env)).toEqual([]);
  });

  it('der Scheduler-Job protokolliert Abrechnungen ohne personenbezogene Daten', async () => {
    const { env } = await pair();
    env.clock.set(afterWeek(W1));
    settleWeeksJob(env.ctx);
    const line = env.logs.find((l) => l.includes('weeks_settled'));
    expect(line).toBeDefined();
    expect(line).toContain('"weeks":2');
    expect(line).toContain('"missed":2');
    expect(line).not.toMatch(/anna|ben|kocht/i);
    settleWeeksJob(env.ctx);
    expect(env.logs.filter((l) => l.includes('weeks_settled'))).toHaveLength(1);
  });
});

describe('firstScoredWeek', () => {
  it('liefert den ersten Wochenstart nach der Vervollständigung', () => {
    const berlin = 'Europe/Berlin';
    expect(firstScoredWeek(Date.parse('2026-03-02T10:00:00Z'), berlin)).toBe('2026-03-09'); // Mo mittags
    expect(firstScoredWeek(Date.parse('2026-03-04T10:00:00Z'), berlin)).toBe('2026-03-09'); // Mi
    expect(firstScoredWeek(Date.parse('2026-03-08T22:59:59Z'), berlin)).toBe('2026-03-09'); // So 23:59:59
    expect(firstScoredWeek(Date.parse('2026-03-01T23:00:00Z'), berlin)).toBe('2026-03-02'); // exakt Mo 00:00
    expect(firstScoredWeek(Date.parse('2026-03-01T23:00:01Z'), berlin)).toBe('2026-03-09'); // 1 s später
  });
});
