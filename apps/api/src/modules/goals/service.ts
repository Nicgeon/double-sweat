import { and, desc, eq, lte } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import type { DbLike } from '../../db/client.js';
import { teams, type User, weeklyGoals } from '../../db/schema.js';
import { firstScoredWeek, type LocalDate, nextWeekStart, weekStartAt } from '../../domain/weeks.js';
import { currentTimezone } from '../me/timezone.js';
import { getMembership } from '../teams/service.js';

/** Ziel (Trainingstage), das für eine Woche gilt: die jüngste Einstellung mit effective_from <= Wochenstart. */
export function goalForWeek(db: DbLike, userId: string, weekStart: LocalDate): number | null {
  const row = db
    .select({ days: weeklyGoals.days })
    .from(weeklyGoals)
    .where(and(eq(weeklyGoals.userId, userId), lte(weeklyGoals.effectiveFrom, weekStart)))
    .orderBy(desc(weeklyGoals.effectiveFrom))
    .limit(1)
    .get();
  return row?.days ?? null;
}

export interface GoalOverview {
  currentWeekStart: LocalDate;
  /** Ziel der laufenden Woche. Es ist eingefroren und nicht mehr änderbar. */
  currentGoal: number | null;
  nextWeekStart: LocalDate;
  /** Ziel, das ab der kommenden Woche gilt (änderbar). */
  nextGoal: number | null;
  /** Das nächste gespeicherte Ziel gilt sofort (erstes Ziel in einer Woche, die nicht gewertet wird). */
  newGoalStartsNow: boolean;
}

export function getGoalOverview(ctx: AppContext, user: User): GoalOverview {
  const now = ctx.clock.now();
  const zone = currentTimezone(ctx, user);
  const current = weekStartAt(now, zone);
  const next = nextWeekStart(now, zone);
  const currentGoal = goalForWeek(ctx.db, user.id, current);
  return {
    currentWeekStart: current,
    currentGoal,
    nextWeekStart: next,
    nextGoal: goalForWeek(ctx.db, user.id, next),
    newGoalStartsNow: currentGoal === null && !isScoredWeek(ctx, user, current, zone),
  };
}

/** Zählt die Woche für die Abrechnung? Erst ab dem ersten Montag, nachdem das Team vollständig ist. */
function isScoredWeek(ctx: AppContext, user: User, weekStart: LocalDate, zone: string): boolean {
  const membership = getMembership(ctx.db, user.id);
  if (!membership) return false;
  const team = ctx.db
    .select({ fullSince: teams.fullSince })
    .from(teams)
    .where(eq(teams.id, membership.teamId))
    .get();
  if (!team || team.fullSince === null) return false;
  return weekStart >= firstScoredWeek(team.fullSince, zone);
}

/**
 * Setzt das Ziel für die kommende Woche. Die laufende Woche bleibt unverändert, damit niemand das Ziel kurz
 * vor der Abrechnung drückt. Ausnahme: das allererste Ziel gilt sofort, solange die laufende Woche noch nicht
 * gewertet wird (Team noch nicht vollständig oder Beitrittswoche). Sonst stünde dort wochenlang "Kein Ziel".
 */
export function setNextWeekGoal(ctx: AppContext, user: User, days: number): GoalOverview {
  const now = ctx.clock.now();
  const zone = currentTimezone(ctx, user);
  const current = weekStartAt(now, zone);
  const upsert = (effectiveFrom: LocalDate) =>
    ctx.db
      .insert(weeklyGoals)
      .values({ userId: user.id, effectiveFrom, days, createdAt: now })
      .onConflictDoUpdate({
        target: [weeklyGoals.userId, weeklyGoals.effectiveFrom],
        set: { days, createdAt: now },
      })
      .run();

  if (getGoalOverview(ctx, user).newGoalStartsNow) upsert(current);
  else upsert(nextWeekStart(now, zone));
  return getGoalOverview(ctx, user);
}
