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

/** Beschlossener Einsatz, der erst nach der Woche `week` gilt (ein Team hat höchstens einen). */
export function upcomingBet(
  db: DbLike,
  teamId: string,
  week: LocalDate,
): { text: string; effectiveFrom: LocalDate } | null {
  const row = db
    .select()
    .from(bets)
    .where(and(eq(bets.teamId, teamId), gt(bets.effectiveFrom, week)))
    .orderBy(desc(bets.effectiveFrom))
    .limit(1)
    .get();
  return row ? { text: row.text, effectiveFrom: row.effectiveFrom } : null;
}

export function getBetOverview(ctx: AppContext, user: User): BetOverview {
  const membership = getMembership(ctx.db, user.id);
  if (!membership) throw forbidden('no_team', 'Du bist in keinem Team');
  const week = weekStartAt(ctx.clock.now(), currentTimezone(ctx, user));
  return {
    current: betForWeek(ctx.db, membership.teamId, week),
    upcoming: upcomingBet(ctx.db, membership.teamId, week),
  };
}

/**
 * Legt den Einsatz fest.
 *
 * Der erste Einsatz eines Teams gilt sofort, für die laufende Woche (er ist Pflicht: ohne Einsatz wird keine
 * Woche gewertet, siehe `settleWeek`). Jede spätere Änderung gilt erst für Wochen, die noch bei keinem Partner
 * begonnen haben. Dadurch lässt sich der Einsatz nicht kurz vor der Abrechnung ändern, und bereits entstandene
 * Schulden behalten ihren Text.
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
  const zones = members.map((m) => currentTimezone(ctx, m.user));
  // Montag der laufenden Woche, aufsteigend: Wer in der Zeitzone zurückliegt, hat die frühere Woche noch
  const currentWeeks = zones.map((zone) => weekStartAt(now, zone)).sort();
  const earliestCurrent = currentWeeks[0] as string;
  const clean = text.trim();

  const firstBet = betForWeek(ctx.db, membership.teamId, earliestCurrent) === null;
  // Ohne Einsatz für die laufende Woche gilt der neue sofort, für beide. Zukünftig angelegte Zeilen (aus der Zeit,
  // als jeder Einsatz erst ab nächstem Montag galt) würden ihn sonst wieder ablösen, sie entfallen.
  // Sonst: der späteste "nächste Montag" aller Mitglieder, damit niemand die Woche schon begonnen hat.
  const effectiveFrom = firstBet
    ? earliestCurrent
    : (zones
        .map((zone) => nextWeekStart(now, zone))
        .sort()
        .at(-1) as string);

  ctx.db.transaction((tx) => {
    if (firstBet) {
      tx.delete(bets).where(eq(bets.teamId, membership.teamId)).run();
    }
    tx.insert(bets)
      .values({
        id: newId(now),
        teamId: membership.teamId,
        text: clean,
        effectiveFrom,
        createdBy: user.id,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [bets.teamId, bets.effectiveFrom],
        set: { text: clean, createdBy: user.id, createdAt: now },
      })
      .run();
  });
  return getBetOverview(ctx, user);
}
