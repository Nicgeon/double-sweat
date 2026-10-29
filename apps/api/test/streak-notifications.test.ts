import { describe, expect, it } from 'vitest';
import { remindersJob } from '../src/jobs/reminders.js';
import { settleWeeksJob } from '../src/jobs/settle-weeks.js';
import { afterWeek, checkinDays, type Pair, pair, W1, W2, W3 } from './scenario.js';

const inbox = (p: Pair, name: string, type: string) =>
  p.env.ctx.db.$client
    .prepare(
      `SELECT n.body AS body FROM notifications n JOIN users u ON u.id = n.user_id
       WHERE u.display_name = ? AND n.type = ? ORDER BY n.created_at`,
    )
    .all(name, type) as { body: string }[];

/** Beide erreichen ihr Ziel in der Woche (Anna 3 Tage, Ben 2) und die Woche wird abgerechnet. */
async function goodWeek(p: Pair, week: string) {
  await checkinDays(p.env, p.anna, week, 3);
  await checkinDays(p.env, p.ben, week, 2);
  p.env.clock.set(afterWeek(week));
  settleWeeksJob(p.env.ctx);
  await p.env.ctx.idle();
}

describe('Serien-Benachrichtigungen', () => {
  it('Meilenstein: nach zwei gemeinsamen Wochen gratulieren beide, nur einmal', async () => {
    const p = await pair();
    await goodWeek(p, W1);
    expect(inbox(p, 'Anna', 'streak_milestone')).toHaveLength(0); // erst eine Woche
    await goodWeek(p, W2);
    for (const name of ['Anna', 'Ben']) {
      const [m, ...rest] = inbox(p, name, 'streak_milestone');
      expect(rest).toHaveLength(0);
      expect(m?.body).toContain('2 Wochen in Serie');
    }
    // erneuter Lauf erzeugt nichts Neues
    settleWeeksJob(p.env.ctx);
    await p.env.ctx.idle();
    expect(inbox(p, 'Anna', 'streak_milestone')).toHaveLength(1);
  });

  it('der Meilenstein folgt der Sprache des Empfängers', async () => {
    const p = await pair();
    await p.ben.patch('/me', { locale: 'en' });
    await goodWeek(p, W1);
    await goodWeek(p, W2);
    expect(inbox(p, 'Ben', 'streak_milestone')[0]?.body).toContain('2 weeks in a row');
    expect(inbox(p, 'Anna', 'streak_milestone')[0]?.body).toContain('Wochen in Serie');
  });

  it('Serie gerissen: nach einer verfehlten Woche bekommen beide eine Info mit der bisherigen Länge', async () => {
    const p = await pair();
    await goodWeek(p, W1);
    await goodWeek(p, W2);
    // Woche 3: Ben schafft sein Ziel nicht
    await checkinDays(p.env, p.anna, W3, 3);
    await checkinDays(p.env, p.ben, W3, 1);
    p.env.clock.set(afterWeek(W3));
    settleWeeksJob(p.env.ctx);
    await p.env.ctx.idle();
    for (const name of ['Anna', 'Ben']) {
      const [b, ...rest] = inbox(p, name, 'streak_broken');
      expect(rest).toHaveLength(0);
      expect(b?.body).toContain('2 Wochen in Folge');
    }
  });

  it('eine Serie von nur einer Woche reißt ohne Meldung', async () => {
    const p = await pair();
    await goodWeek(p, W1);
    await checkinDays(p.env, p.anna, W2, 3);
    p.env.clock.set(afterWeek(W2));
    settleWeeksJob(p.env.ctx);
    await p.env.ctx.idle();
    expect(inbox(p, 'Anna', 'streak_broken')).toHaveLength(0);
  });

  it('die Abend-Erinnerung nennt die Serie, wenn sie auf dem Spiel steht', async () => {
    const p = await pair();
    await goodWeek(p, W1);
    await goodWeek(p, W2);
    // Freitag der dritten Woche, 19:00 Berlin: Anna braucht alle drei verbleibenden Tage
    p.env.clock.set(Date.parse('2026-03-27T19:00:00+01:00'));
    remindersJob(p.env.ctx);
    await p.env.ctx.idle();
    const [r] = inbox(p, 'Anna', 'reminder');
    expect(r?.body).toContain('Eure Serie von 2 Wochen steht auf dem Spiel');
  });

  it('ohne Serie bleibt die Erinnerung unverändert', async () => {
    const p = await pair();
    await goodWeek(p, W1); // Serie nur 1
    p.env.clock.set(Date.parse('2026-03-20T19:00:00+01:00'));
    remindersJob(p.env.ctx);
    await p.env.ctx.idle();
    const [r] = inbox(p, 'Anna', 'reminder');
    expect(r?.body).toBeDefined();
    expect(r?.body).not.toContain('Serie');
  });
});
