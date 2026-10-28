import { and, desc, eq, gt, lte } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import type { DbLike } from '../../db/client.js';
import { bets, memberships, type User, users } from '../../db/schema.js';
import { type LocalDate, nextWeekStart, weekStartAt } from '../../domain/weeks.js';
import { forbidden, tooManyRequests } from '../../util/errors.js';
import { newId } from '../../util/ids.js';
import { HOUR } from '../../util/time.js';
import { currentTimezone } from '../me/timezone.js';
import { getMembership } from '../teams/service.js';

export const BET_MAX_LENGTH = 140;

/** Einsatz, der für eine Woche gilt: der jüngste mit effective_from <= Wochenstart. */
export function betForWeek(db: DbLike, teamId: string, weekStart: LocalDate): string | null {
  const row = db
    .select({ text: bets.text })
    .from(bets)
    .where(and(eq(bets.teamId, teamId), lte(bets.effectiveFrom, weekStart)))
    .orderBy(desc(bets.effectiveFrom))
    .limit(1)
    .get();
  return row?.text ?? null;
}

export interface BetOverview {
  /** Einsatz, der für die laufende Woche des Betrachters gilt. */
  current: string | null;
  /** Bereits beschlossene Änderung, die erst in einer späteren Woche greift. */
  upcoming: { text: string; effectiveFrom: LocalDate } | null;
}

export function getBetOverview(ctx: AppContext, user: User): BetOverview {
  const membership = getMembership(ctx.db, user.id);
  if (!membership) throw forbidden('no_team', 'Du bist in keinem Team');
  const week = weekStartAt(ctx.clock.now(), currentTimezone(ctx, user));
  const upcoming = ctx.db
    .select()
    .from(bets)
    .where(and(eq(bets.teamId, membership.teamId), gt(bets.effectiveFrom, week)))
    .orderBy(desc(bets.effectiveFrom))
    .limit(1)
    .get();
  return {
    current: betForWeek(ctx.db, membership.teamId, week),
    upcoming: upcoming ? { text: upcoming.text, effectiveFrom: upcoming.effectiveFrom } : null,
  };
}

/**
 * Legt den Einsatz fest. Er gilt erst für Wochen, die noch bei keinem Partner begonnen haben. Dadurch lässt
 * sich der Einsatz nicht kurz vor der Abrechnung ändern, und bereits entstandene Schulden behalten ihren Text.
 */
export function setBet(ctx: AppContext, user: User, text: string): BetOverview {
  const limit = ctx.limiter.hit(`bet:user:${user.id}`, 20, HOUR);
  if (limit.limited) throw tooManyRequests(limit.retryAfterSec);
  const membership = getMembership(ctx.db, user.id);
  if (!membership) throw forbidden('no_team', 'Du bist in keinem Team');
  const now = ctx.clock.now();
  const members = ctx.db
    .select({ user: users })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.teamId, membership.teamId))
    .all();
  // Der späteste "nächste Montag" aller Mitglieder: Wer in der Zeitzone voraus ist, hat die Woche evtl. schon begonnen
  const effectiveFrom = members
    .map((m) => nextWeekStart(now, currentTimezone(ctx, m.user)))
    .reduce((latest, week) => (week > latest ? week : latest));
  ctx.db
    .insert(bets)
    .values({
      id: newId(now),
      teamId: membership.teamId,
      text: text.trim(),
      effectiveFrom,
      createdBy: user.id,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [bets.teamId, bets.effectiveFrom],
      set: { text: text.trim(), createdBy: user.id, createdAt: now },
    })
    .run();
  return getBetOverview(ctx, user);
}
