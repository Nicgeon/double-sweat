import { and, eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { AppContext } from '../context.js';
import { users, weekResults } from '../db/schema.js';
import { loadTeamStreak } from '../modules/history/service.js';
import { settleDueWeeks } from '../modules/settlement/service.js';

/** Meilensteine der gemeinsamen Serie in Wochen (danach jede 52). */
export const STREAK_MILESTONES = [2, 4, 8, 12, 26, 52];
const isMilestone = (weeks: number) =>
  STREAK_MILESTONES.includes(weeks) || (weeks > 52 && weeks % 52 === 0);

const nameOf = (ctx: AppContext, id: string) =>
  ctx.db.select({ n: users.displayName }).from(users).where(eq(users.id, id)).get()?.n ??
  'Dein Partner';

/**
 * Wochenabschluss. Läuft bei jedem Tick und holt verpasste Wochen nach (z. B. nach einem Neustart).
 * Wer eine Schuld hat und wem etwas geschuldet wird, erfährt es per Push und im Postfach.
 */
export function settleWeeksJob(ctx: AppContext): void {
  const settled = settleDueWeeks(ctx);
  if (settled.length === 0) return;

  for (const week of settled) {
    if (week.debtId && week.betText) {
      const debtor = nameOf(ctx, week.userId);
      const creditor = nameOf(ctx, week.partnerId);
      const data = { debtId: week.debtId, weekStart: week.weekStart };
      ctx.push.notify(week.userId, {
        type: 'debt_created',
        params: { role: 'debtor', other: creditor, bet: week.betText },
        data,
      });
      ctx.push.notify(week.partnerId, {
        type: 'debt_created',
        params: { role: 'creditor', other: debtor, bet: week.betText },
        data,
      });
    }
    if (week.rewardClaimId && week.rewardText) {
      const recipient = nameOf(ctx, week.userId);
      const giver = nameOf(ctx, week.partnerId);
      const data = { rewardClaimId: week.rewardClaimId, weekStart: week.weekStart };
      ctx.push.notify(week.userId, {
        type: 'reward_earned',
        params: { role: 'recipient', other: giver, reward: week.rewardText },
        data,
      });
      ctx.push.notify(week.partnerId, {
        type: 'reward_earned',
        params: { role: 'giver', other: recipient, reward: week.rewardText },
        data,
      });
    }
  }
  notifyStreaks(ctx, settled);
  ctx.log.info('weeks_settled', {
    weeks: settled.length,
    missed: settled.filter((s) => s.met === false).length,
    debts: settled.filter((s) => s.debtId !== null).length,
    rewards: settled.filter((s) => s.rewardClaimId !== null).length,
  });
}

/**
 * Ergebnis und Serie der Wochen eines Teams: sobald beide Partner einer Woche abgerechnet sind (bei verschiedenen
 * Zeitzonen kann das in verschiedenen Läufen sein), bekommen beide das Wochenergebnis ("KW 44: du 3/3, Ben 2/3"),
 * dazu einen Meilenstein oder, wenn eine Serie ab zwei Wochen endet, eine Info. Jede Woche wird pro Team nur einmal
 * bewertet.
 */
function notifyStreaks(ctx: AppContext, settled: ReturnType<typeof settleDueWeeks>): void {
  const done = new Set<string>();
  for (const week of settled) {
    const key = `${week.teamId}:${week.weekStart}`;
    if (done.has(key)) continue;
    const partner = ctx.db
      .select({
        met: weekResults.met,
        goalDays: weekResults.goalDays,
        doneDays: weekResults.doneDays,
      })
      .from(weekResults)
      .where(and(eq(weekResults.userId, week.partnerId), eq(weekResults.weekStart, week.weekStart)))
      .get();
    if (!partner) continue; // der Partner wird erst später abgerechnet
    done.add(key);
    const members = [week.userId, week.partnerId];
    const data = { weekStart: week.weekStart };
    // Wochenergebnis: jede Person sieht sich zuerst. Ein Ziel von 0 steht für "kein Ziel in dieser Woche".
    const number = DateTime.fromISO(week.weekStart, { zone: 'utc' }).weekNumber;
    const mine = { done: week.doneDays, goal: week.goalDays ?? 0 };
    const theirs = { done: partner.doneDays, goal: partner.goalDays ?? 0 };
    const resultFor = (self: typeof mine, other: typeof mine, otherId: string) => ({
      type: 'week_result' as const,
      params: {
        week: number,
        mine: self.done,
        myGoal: self.goal,
        other: nameOf(ctx, otherId),
        theirs: other.done,
        theirGoal: other.goal,
      },
      data,
    });
    ctx.push.notify(week.userId, resultFor(mine, theirs, week.partnerId));
    ctx.push.notify(week.partnerId, resultFor(theirs, mine, week.userId));
    if (week.met === true && partner.met === true) {
      const weeks = loadTeamStreak(ctx.db, week.teamId).current;
      if (isMilestone(weeks))
        for (const id of members)
          ctx.push.notify(id, { type: 'streak_milestone', params: { weeks }, data });
    } else if (week.met === false || partner.met === false) {
      const weeks = loadTeamStreak(ctx.db, week.teamId, week.weekStart).current;
      if (weeks >= 2)
        for (const id of members)
          ctx.push.notify(id, { type: 'streak_broken', params: { weeks }, data });
    }
  }
}
