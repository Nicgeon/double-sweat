import { and, desc, eq, lte } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import type { DbLike } from '../../db/client.js';
import { type User, weeklyGoals } from '../../db/schema.js';
import { type LocalDate, nextWeekStart, weekStartAt } from '../../domain/weeks.js';
import { currentTimezone } from '../me/timezone.js';

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
}

export function getGoalOverview(ctx: AppContext, user: User): GoalOverview {
  const now = ctx.clock.now();
  const zone = currentTimezone(ctx, user);
  const current = weekStartAt(now, zone);
  const next = nextWeekStart(now, zone);
  return {
    currentWeekStart: current,
    currentGoal: goalForWeek(ctx.db, user.id, current),
    nextWeekStart: next,
    nextGoal: goalForWeek(ctx.db, user.id, next),
  };
}

/** Setzt das Ziel für die kommende Woche. Die laufende Woche bleibt unverändert. */
export function setNextWeekGoal(ctx: AppContext, user: User, days: number): GoalOverview {
  const now = ctx.clock.now();
  const effectiveFrom = nextWeekStart(now, currentTimezone(ctx, user));
  ctx.db
    .insert(weeklyGoals)
    .values({ userId: user.id, effectiveFrom, days, createdAt: now })
    .onConflictDoUpdate({
      target: [weeklyGoals.userId, weeklyGoals.effectiveFrom],
      set: { days, createdAt: now },
    })
    .run();
  return getGoalOverview(ctx, user);
}
