import { eq } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import { users } from '../db/schema.js';
import { settleDueWeeks } from '../modules/settlement/service.js';

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
        title: 'Double Sweat',
        body: `Ziel verfehlt: Du schuldest ${creditor} diese Woche „${week.betText}“.`,
        data,
      });
      ctx.push.notify(week.partnerId, {
        type: 'debt_created',
        title: 'Double Sweat',
        body: `${debtor} hat das Ziel verfehlt und schuldet dir „${week.betText}“.`,
        data,
      });
    }
    if (week.rewardClaimId && week.rewardText) {
      const recipient = nameOf(ctx, week.userId);
      const giver = nameOf(ctx, week.partnerId);
      const data = { rewardClaimId: week.rewardClaimId, weekStart: week.weekStart };
      ctx.push.notify(week.userId, {
        type: 'reward_earned',
        title: 'Double Sweat',
        body: `Wochenziel geschafft! Deine Belohnung von ${giver}: „${week.rewardText}“.`,
        data,
      });
      ctx.push.notify(week.partnerId, {
        type: 'reward_earned',
        title: 'Double Sweat',
        body: `${recipient} hat das Wochenziel geschafft. Deine Belohnung ist fällig: „${week.rewardText}“.`,
        data,
      });
    }
  }
  ctx.log.info('weeks_settled', {
    weeks: settled.length,
    missed: settled.filter((s) => s.met === false).length,
    debts: settled.filter((s) => s.debtId !== null).length,
    rewards: settled.filter((s) => s.rewardClaimId !== null).length,
  });
}
