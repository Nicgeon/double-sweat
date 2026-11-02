import { and, asc, desc, eq, gt, lte } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import type { DbLike } from '../../db/client.js';
import { bets, memberships, teams, type User, users } from '../../db/schema.js';
import {
  addWeeks,
  firstScoredWeek,
  isLocalDate,
  type LocalDate,
  weekStartAt,
  weekStartOf,
} from '../../domain/weeks.js';
import { badRequest, forbidden, notFound, tooManyRequests } from '../../util/errors.js';
import { newId } from '../../util/ids.js';
import { HOUR } from '../../util/time.js';
import { currentTimezone } from '../me/timezone.js';
import { getMembership } from '../teams/service.js';

export const BET_MAX_LENGTH = 140;
/** So viele Wochen im Voraus lässt sich ein Einsatz festlegen. */
export const BET_HORIZON_WEEKS = 12; // dieselbe Zahl steht in der Fehlermeldung unten

/** Einsatz einer Person für eine Woche: der jüngste mit effective_from <= Wochenstart. */
export function betForUserWeek(db: DbLike, userId: string, weekStart: LocalDate): string | null {
  const row = db
    .select({ text: bets.text })
    .from(bets)
    .where(and(eq(bets.userId, userId), lte(bets.effectiveFrom, weekStart)))
    .orderBy(desc(bets.effectiveFrom))
    .limit(1)
    .get();
  return row?.text ?? null;
}

export interface BetEntry {
  text: string;
  /** Montag, ab dem dieser Einsatz gilt (bis ein späterer ihn ablöst). */
  effectiveFrom: LocalDate;
}

export interface PersonBet {
  /** Einsatz für die laufende Woche des Betrachters. */
  current: string | null;
  /** Ab welchem Montag der aktuelle Einsatz gilt (kann Wochen zurückliegen). */
  currentFrom: LocalDate | null;
  /** Bereits festgelegte Änderungen für spätere Wochen, aufsteigend. */
  upcoming: BetEntry[];
}

export interface BetOverview {
  /** Montag der laufenden Woche des Betrachters. */
  currentWeekStart: LocalDate;
  mine: PersonBet;
  /** Einsatz des Partners (sichtbar, er gilt für dich, wenn er sein Ziel verfehlt). Null ohne Partner. */
  partner: (PersonBet & { displayName: string }) | null;
  /** Pflicht: Ab der ersten vollen Woche braucht jede Person einen Einsatz für die laufende Woche. */
  required: boolean;
}

function personBet(db: DbLike, userId: string, week: LocalDate): PersonBet {
  const current = db
    .select()
    .from(bets)
    .where(and(eq(bets.userId, userId), lte(bets.effectiveFrom, week)))
    .orderBy(desc(bets.effectiveFrom))
    .limit(1)
    .get();
  const upcoming = db
    .select()
    .from(bets)
    .where(and(eq(bets.userId, userId), gt(bets.effectiveFrom, week)))
    .orderBy(asc(bets.effectiveFrom))
    .all()
    .map((r) => ({ text: r.text, effectiveFrom: r.effectiveFrom }));
  return {
    current: current?.text ?? null,
    currentFrom: current?.effectiveFrom ?? null,
    upcoming,
  };
}

/**
 * Muss diese Person jetzt einen Einsatz festlegen? Erst ab der ersten vollen Woche des Teams (die Woche, in der
 * es vollständig wird, zählt nicht: so lässt sich die App erst kennenlernen) und solange für die laufende Woche
 * keiner gilt. Wer vorher einen Einsatz für diese Woche festlegt, wird nicht gefragt.
 */
export function betRequired(ctx: AppContext, user: User): boolean {
  const membership = getMembership(ctx.db, user.id);
  if (!membership) return false;
  const team = ctx.db
    .select({ fullSince: teams.fullSince })
    .from(teams)
    .where(eq(teams.id, membership.teamId))
    .get();
  if (!team || team.fullSince === null) return false;
  const zone = currentTimezone(ctx, user);
  const current = weekStartAt(ctx.clock.now(), zone);
  if (current < firstScoredWeek(team.fullSince, zone)) return false;
  return betForUserWeek(ctx.db, user.id, current) === null;
}

function partnerOf(ctx: AppContext, teamId: string, userId: string): User | undefined {
  return ctx.db
    .select({ user: users })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.teamId, teamId))
    .all()
    .map((r) => r.user)
    .find((u) => u.id !== userId);
}

export function getBetOverview(ctx: AppContext, user: User): BetOverview {
  const membership = getMembership(ctx.db, user.id);
  if (!membership) throw forbidden('no_team', 'Du bist in keinem Team');
  const week = weekStartAt(ctx.clock.now(), currentTimezone(ctx, user));
  const partner = partnerOf(ctx, membership.teamId, user.id);
  return {
    currentWeekStart: week,
    mine: personBet(ctx.db, user.id, week),
    partner: partner
      ? {
          displayName: partner.displayName,
          ...personBet(
            ctx.db,
            partner.id,
            weekStartAt(ctx.clock.now(), currentTimezone(ctx, partner)),
          ),
        }
      : null,
    required: betRequired(ctx, user),
  };
}

/** Prüft den Wochenstart, ab dem ein Einsatz gelten soll: ein Montag, nicht in der Vergangenheit, höchstens 12 Wochen voraus. */
function checkedWeek(from: string | undefined, current: LocalDate): LocalDate {
  if (from === undefined) return current;
  if (!isLocalDate(from) || weekStartOf(from) !== from) {
    throw badRequest('invalid_week', 'Der Einsatz kann nur ab einem Montag gelten');
  }
  if (from < current)
    throw badRequest('week_in_past', 'Für vergangene Wochen lässt sich nichts mehr ändern');
  if (from > addWeeks(current, BET_HORIZON_WEEKS)) {
    throw badRequest(
      'week_too_far',
      'Der Einsatz lässt sich höchstens 12 Wochen im Voraus festlegen',
    );
  }
  return from;
}

/**
 * Legt den eigenen Einsatz fest: was ich meinem Partner schulde, wenn ich mein Wochenziel verfehle. Er gilt ab
 * dem angegebenen Montag (Standard: die laufende Woche) und bleibt gültig, bis ein späterer ihn ablöst. So lässt
 * er sich jederzeit ändern und für kommende Wochen vorab festlegen. Bereits entstandene Schulden behalten ihren
 * Text; der Partner erfährt von jeder Änderung.
 */
export function setBet(ctx: AppContext, user: User, text: string, from?: string): BetOverview {
  const limit = ctx.limiter.hit(`bet:user:${user.id}`, 20, HOUR);
  if (limit.limited) throw tooManyRequests(limit.retryAfterSec);
  const membership = getMembership(ctx.db, user.id);
  if (!membership) throw forbidden('no_team', 'Du bist in keinem Team');
  const now = ctx.clock.now();
  const current = weekStartAt(now, currentTimezone(ctx, user));
  const effectiveFrom = checkedWeek(from, current);
  const clean = text.trim();
  const hadCurrent = betForUserWeek(ctx.db, user.id, current) !== null;

  ctx.db
    .insert(bets)
    .values({
      id: newId(now),
      teamId: membership.teamId,
      userId: user.id,
      text: clean,
      effectiveFrom,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [bets.userId, bets.effectiveFrom],
      set: { text: clean, createdAt: now },
    })
    .run();

  const partner = partnerOf(ctx, membership.teamId, user.id);
  if (partner) {
    ctx.push.notify(partner.id, {
      type: hadCurrent ? 'bet_changed' : 'bet_set',
      params: { name: user.displayName, bet: clean },
    });
  }
  return getBetOverview(ctx, user);
}

/** Nimmt einen für später festgelegten Einsatz zurück. Der für die laufende Woche gültige bleibt (er ist Pflicht). */
export function removeBet(ctx: AppContext, user: User, from: string): BetOverview {
  const membership = getMembership(ctx.db, user.id);
  if (!membership) throw forbidden('no_team', 'Du bist in keinem Team');
  const current = weekStartAt(ctx.clock.now(), currentTimezone(ctx, user));
  if (!isLocalDate(from) || from <= current) {
    throw badRequest(
      'week_not_upcoming',
      'Nur Einsätze für spätere Wochen lassen sich zurücknehmen',
    );
  }
  const removed = ctx.db
    .delete(bets)
    .where(and(eq(bets.userId, user.id), eq(bets.effectiveFrom, from)))
    .returning({ id: bets.id })
    .all();
  if (removed.length === 0) throw notFound('Für diese Woche ist kein Einsatz festgelegt');
  return getBetOverview(ctx, user);
}
