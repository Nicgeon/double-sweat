import { addDays } from '../src/domain/weeks.js';
import { noisyJpeg, photoForm } from './fixtures.js';
import { createTestEnv, type TestClient, type TestEnv } from './helpers.js';

/**
 * Zeitleiste der Szenarien (Uhr startet Montag, 02.03.2026, 10:00 UTC):
 *   Woche 03-02: Team wird vollständig (Beitrittswoche, zählt nicht)
 *   Woche 03-09, 03-16, 03-23: gewertete Wochen
 */
export const W1 = '2026-03-09';
export const W2 = '2026-03-16';
export const W3 = '2026-03-23';

/** Mittag UTC an einem Kalendertag: in Berlin derselbe Tag. */
export const noon = (date: string) => Date.parse(`${date}T12:00:00Z`);

/** Setzt die Uhr auf Montag 00:30 Berlin (kurz nach Wochenwechsel) der Folgewoche. */
export const afterWeek = (weekStart: string) =>
  Date.parse(`${addDays(weekStart, 7)}T00:30:00+01:00`);

/** Check-ins an den ersten n Tagen einer Woche. */
export async function checkinDays(env: TestEnv, who: TestClient, weekStart: string, count: number) {
  for (let i = 0; i < count; i++) {
    env.clock.set(noon(addDays(weekStart, i)));
    const res = await who.upload('/checkins', photoForm(await noisyJpeg()));
    if (res.status !== 201)
      throw new Error(`Check-in fehlgeschlagen: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

export interface Pair {
  env: TestEnv;
  anna: TestClient;
  ben: TestClient;
}

/**
 * Paar mit Zielen (Anna 3, Ben 2) für Woche 03-09 und Einsatz. Die Uhr steht danach noch in der
 * Beitrittswoche. Optional andere Zeitzonen und kein Einsatz.
 */
export async function pair(
  options: {
    annaTz?: string;
    benTz?: string;
    bet?: string | null;
    annaGoal?: number;
    benGoal?: number;
  } = {},
): Promise<Pair> {
  const env = createTestEnv();
  const anna = env.client({ ip: '203.0.113.11' });
  const ben = env.client({ ip: '203.0.113.12' });
  await anna.registerFounder('anna@example.org', 'Anna', options.annaTz ?? 'Europe/Berlin');
  const invite = (await anna.post('/teams/invites')).body.code;
  await ben.registerWithInvite(invite, 'ben@example.org', 'Ben', options.benTz ?? 'Europe/Berlin');
  await anna.put('/goals/next', { days: options.annaGoal ?? 3 });
  await ben.put('/goals/next', { days: options.benGoal ?? 2 });
  const bet = options.bet === undefined ? 'Der Verlierer kocht' : options.bet;
  if (bet) await anna.put('/bets', { text: bet });
  return { env, anna, ben };
}

export const results = (env: TestEnv) =>
  env.ctx.db.$client
    .prepare(
      `SELECT u.display_name AS name, r.week_start AS week, r.goal_days AS goal, r.done_days AS done, r.met AS met
       FROM week_results r JOIN users u ON u.id = r.user_id ORDER BY r.week_start, u.display_name`,
    )
    .all() as {
    name: string;
    week: string;
    goal: number | null;
    done: number;
    met: number | null;
  }[];

export const debtRows = (env: TestEnv) =>
  env.ctx.db.$client
    .prepare(
      `SELECT d.week_start AS week, debtor.display_name AS debtor, creditor.display_name AS creditor, d.bet_text AS bet
       FROM debts d JOIN users debtor ON debtor.id = d.debtor_id JOIN users creditor ON creditor.id = d.creditor_id
       ORDER BY d.week_start, debtor.display_name`,
    )
    .all() as { week: string; debtor: string; creditor: string; bet: string }[];
