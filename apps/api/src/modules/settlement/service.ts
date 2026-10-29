import { and, countDistinct, eq, isNotNull } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import {
  checkins,
  debts,
  memberships,
  type Team,
  teams,
  type User,
  users,
  weekResults,
} from '../../db/schema.js';
import { addWeeks, firstScoredWeek, type LocalDate, weekStartAt } from '../../domain/weeks.js';

export { firstScoredWeek };

import { newId } from '../../util/ids.js';
import { betForWeek } from '../bets/service.js';
import { goalForWeek } from '../goals/service.js';
import { currentTimezone } from '../me/timezone.js';

export interface SettledWeek {
  userId: string;
  partnerId: string;
  teamId: string;
  weekStart: LocalDate;
  goalDays: number | null;
  doneDays: number;
  /** null = nicht gewertet (kein Ziel gesetzt) */
  met: boolean | null;
  debtId: string | null;
  betText: string | null;
}

function settleWeek(
  ctx: AppContext,
  team: Team,
  user: User,
  partner: User,
  weekStart: LocalDate,
  zone: string,
  now: number,
): SettledWeek | null {
  return ctx.db.transaction(
    (tx): SettledWeek | null => {
      const existing = tx
        .select({ weekStart: weekResults.weekStart })
        .from(weekResults)
        .where(and(eq(weekResults.userId, user.id), eq(weekResults.weekStart, weekStart)))
        .get();
      if (existing) return null;

      const goalDays = goalForWeek(tx, user.id, weekStart);
      const doneDays =
        tx
          .select({ n: countDistinct(checkins.localDate) })
          .from(checkins)
          .where(and(eq(checkins.userId, user.id), eq(checkins.weekStart, weekStart)))
          .get()?.n ?? 0;
      const met = goalDays === null ? null : doneDays >= goalDays;

      tx.insert(weekResults)
        .values({
          userId: user.id,
          teamId: team.id,
          weekStart,
          tz: zone,
          goalDays,
          doneDays,
          met,
          settledAt: now,
        })
        .onConflictDoNothing()
        .run();

      let debtId: string | null = null;
      let betText: string | null = null;
      if (met === false) {
        betText = betForWeek(tx, team.id, weekStart);
        if (betText) {
          debtId = newId(now);
          tx.insert(debts)
            .values({
              id: debtId,
              teamId: team.id,
              weekStart,
              debtorId: user.id,
              creditorId: partner.id,
              betText,
              createdAt: now,
            })
            .onConflictDoNothing()
            .run();
        }
      }
      return {
        userId: user.id,
        partnerId: partner.id,
        teamId: team.id,
        weekStart,
        goalDays,
        doneDays,
        met,
        debtId,
        betText,
      };
    },
    { behavior: 'immediate' },
  );
}

/**
 * Rechnet alle abgeschlossenen, noch nicht gewerteten Wochen ab. Idempotent (pro Nutzer und Woche genau ein
 * Ergebnis) und nachholbar: Nach einem Neustart oder längerer Pause werden alle verpassten Wochen der Reihe
 * nach verarbeitet. Jeder Nutzer wird in seiner eigenen Zeitzone abgerechnet. Nur vollständige Teams zählen,
 * und erst Wochen, die nach der Vervollständigung des Teams begonnen haben.
 */
export function settleDueWeeks(ctx: AppContext): SettledWeek[] {
  const now = ctx.clock.now();
  const settled: SettledWeek[] = [];
  const fullTeams = ctx.db.select().from(teams).where(isNotNull(teams.fullSince)).all();

  for (const team of fullTeams) {
    const members = ctx.db
      .select({ user: users })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.teamId, team.id))
      .all()
      .map((row) => row.user);
    if (members.length !== 2 || team.fullSince === null) continue;

    for (const user of members) {
      const partner = members.find((m) => m.id !== user.id) as User;
      const zone = currentTimezone(ctx, user);
      const current = weekStartAt(now, zone);
      const done = new Set(
        ctx.db
          .select({ weekStart: weekResults.weekStart })
          .from(weekResults)
          .where(eq(weekResults.userId, user.id))
          .all()
          .map((r) => r.weekStart),
      );
      for (
        let week = firstScoredWeek(team.fullSince, zone);
        week < current;
        week = addWeeks(week, 1)
      ) {
        if (done.has(week)) continue;
        const result = settleWeek(ctx, team, user, partner, week, zone, now);
        if (result) settled.push(result);
      }
    }
  }
  return settled;
}
