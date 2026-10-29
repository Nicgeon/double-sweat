import { and, desc, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import type { DbLike } from '../../db/client.js';
import {
  memberships,
  type RewardClaim,
  rewardClaims,
  rewards,
  type User,
  users,
} from '../../db/schema.js';
import { type LocalDate, nextWeekStart, weekStartAt } from '../../domain/weeks.js';
import { forbidden, notFound, tooManyRequests } from '../../util/errors.js';
import { newId } from '../../util/ids.js';
import { HOUR } from '../../util/time.js';
import { currentTimezone } from '../me/timezone.js';
import { getMembership } from '../teams/service.js';

export const REWARD_MAX_LENGTH = 140;

/** Belohnung, die {giver} für eine Woche verspricht: die jüngste mit effective_from <= Wochenstart. Leer = keine. */
export function rewardForWeek(db: DbLike, giverId: string, weekStart: LocalDate): string | null {
  const row = db
    .select({ text: rewards.text })
    .from(rewards)
    .where(and(eq(rewards.giverId, giverId), lte(rewards.effectiveFrom, weekStart)))
    .orderBy(desc(rewards.effectiveFrom))
    .limit(1)
    .get();
  return row?.text ? row.text : null;
}

export interface RewardPromise {
  /** Gilt für die laufende Woche des Betrachters. */
  current: string | null;
  /** Bereits beschlossene Änderung, die erst in einer späteren Woche greift (text null = zurückgezogen). */
  upcoming: { text: string | null; effectiveFrom: LocalDate } | null;
}

export interface RewardOverview {
  /** Was ich meinem Partner verspreche. */
  mine: RewardPromise;
  /** Was mein Partner mir verspricht (sichtbar, damit es motiviert). Null, solange es keinen Partner gibt. */
  partner: (RewardPromise & { displayName: string }) | null;
}

function promiseOf(db: DbLike, giverId: string, week: LocalDate): RewardPromise {
  const upcoming = db
    .select()
    .from(rewards)
    .where(and(eq(rewards.giverId, giverId), gt(rewards.effectiveFrom, week)))
    .orderBy(desc(rewards.effectiveFrom))
    .limit(1)
    .get();
  return {
    current: rewardForWeek(db, giverId, week),
    upcoming: upcoming
      ? { text: upcoming.text || null, effectiveFrom: upcoming.effectiveFrom }
      : null,
  };
}

function teamMembers(ctx: AppContext, teamId: string): User[] {
  return ctx.db
    .select({ user: users })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.teamId, teamId))
    .all()
    .map((r) => r.user);
}

export function getRewardOverview(ctx: AppContext, user: User): RewardOverview {
  const membership = getMembership(ctx.db, user.id);
  if (!membership) throw forbidden('no_team', 'Du bist in keinem Team');
  const week = weekStartAt(ctx.clock.now(), currentTimezone(ctx, user));
  const partner = teamMembers(ctx, membership.teamId).find((m) => m.id !== user.id);
  return {
    mine: promiseOf(ctx.db, user.id, week),
    partner: partner
      ? { displayName: partner.displayName, ...promiseOf(ctx.db, partner.id, week) }
      : null,
  };
}

/**
 * Legt fest, was ich meinem Partner verspreche, wenn er sein Wochenziel schafft (leer = zurückziehen).
 * Wie der Einsatz gilt es erst für Wochen, die noch bei keinem Partner begonnen haben: Niemand kann eine
 * Belohnung kurz vor der Abrechnung ändern, und bereits verdiente Belohnungen behalten ihren Text.
 */
export function setReward(ctx: AppContext, user: User, text: string): RewardOverview {
  const limit = ctx.limiter.hit(`reward:user:${user.id}`, 20, HOUR);
  if (limit.limited) throw tooManyRequests(limit.retryAfterSec);
  const membership = getMembership(ctx.db, user.id);
  if (!membership) throw forbidden('no_team', 'Du bist in keinem Team');
  const now = ctx.clock.now();
  const members = teamMembers(ctx, membership.teamId);
  const effectiveFrom = members
    .map((m) => nextWeekStart(now, currentTimezone(ctx, m)))
    .sort()
    .at(-1) as string;
  const value = text.trim();
  ctx.db
    .insert(rewards)
    .values({
      id: newId(now),
      teamId: membership.teamId,
      giverId: user.id,
      text: value,
      effectiveFrom,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [rewards.giverId, rewards.effectiveFrom],
      set: { text: value, createdAt: now },
    })
    .run();

  const partner = members.find((m) => m.id !== user.id);
  if (partner && value) {
    ctx.push.notify(partner.id, {
      type: 'reward_set',
      title: 'Double Sweat',
      body: `${user.displayName} verspricht dir eine Belohnung für dein Wochenziel: „${value}“.`,
    });
  }
  return getRewardOverview(ctx, user);
}

export interface RewardClaimDto {
  id: string;
  weekStart: string;
  rewardText: string;
  createdAt: number;
  redeemedAt: number | null;
  /** earned: du hast sie dir verdient, give: du schuldest sie deinem Partner. */
  direction: 'earned' | 'give';
  recipientName: string;
  giverName: string;
}

export type ClaimFilter = 'open' | 'redeemed' | 'all';

function teamIdOf(ctx: AppContext, user: User): string {
  const membership = getMembership(ctx.db, user.id);
  if (!membership) throw forbidden('no_team', 'Du bist in keinem Team');
  return membership.teamId;
}

function toDto(ctx: AppContext, row: RewardClaim, viewerId: string): RewardClaimDto {
  const name = (id: string) =>
    ctx.db.select({ n: users.displayName }).from(users).where(eq(users.id, id)).get()?.n ??
    'Unbekannt';
  return {
    id: row.id,
    weekStart: row.weekStart,
    rewardText: row.rewardText,
    createdAt: row.createdAt,
    redeemedAt: row.redeemedAt,
    direction: row.recipientId === viewerId ? 'earned' : 'give',
    recipientName: name(row.recipientId),
    giverName: name(row.giverId),
  };
}

export function listRewardClaims(ctx: AppContext, user: User, filter: ClaimFilter) {
  const teamId = teamIdOf(ctx, user);
  const state =
    filter === 'open'
      ? isNull(rewardClaims.redeemedAt)
      : filter === 'redeemed'
        ? isNotNull(rewardClaims.redeemedAt)
        : undefined;
  return ctx.db
    .select()
    .from(rewardClaims)
    .where(and(eq(rewardClaims.teamId, teamId), state))
    .orderBy(desc(rewardClaims.weekStart), desc(rewardClaims.createdAt))
    .all()
    .map((row) => toDto(ctx, row, user.id));
}

/** Offene Belohnungen für die Startseite: wie viele ich verdient habe und wie viele ich noch schulde. */
export function openClaimCounts(db: DbLike, teamId: string, viewerId: string) {
  const open = db
    .select({ recipientId: rewardClaims.recipientId, giverId: rewardClaims.giverId })
    .from(rewardClaims)
    .where(and(eq(rewardClaims.teamId, teamId), isNull(rewardClaims.redeemedAt)))
    .all();
  return {
    earned: open.filter((c) => c.recipientId === viewerId).length,
    toGive: open.filter((c) => c.giverId === viewerId).length,
  };
}

/** Nur wer die Belohnung verdient hat, bestätigt, dass sie angekommen ist. Der Geber kann sie nicht selbst abhaken. */
export function setClaimRedeemed(
  ctx: AppContext,
  user: User,
  id: string,
  redeemed: boolean,
): RewardClaimDto {
  const teamId = teamIdOf(ctx, user);
  const claim = ctx.db
    .select()
    .from(rewardClaims)
    .where(and(eq(rewardClaims.id, id), eq(rewardClaims.teamId, teamId)))
    .get();
  if (!claim) throw notFound('Belohnung nicht gefunden');
  if (claim.recipientId !== user.id) {
    throw forbidden(
      'not_recipient',
      'Nur die Person, die die Belohnung verdient hat, kann das bestätigen',
    );
  }
  if ((claim.redeemedAt !== null) !== redeemed) {
    ctx.db
      .update(rewardClaims)
      .set({ redeemedAt: redeemed ? ctx.clock.now() : null })
      .where(eq(rewardClaims.id, id))
      .run();
  }
  const fresh = ctx.db.select().from(rewardClaims).where(eq(rewardClaims.id, id)).get();
  return toDto(ctx, fresh as RewardClaim, user.id);
}

// Für Auswertungen mit beiden Rollen (Export)
export const claimsOfUser = (db: DbLike, userId: string) =>
  db
    .select()
    .from(rewardClaims)
    .where(or(eq(rewardClaims.recipientId, userId), eq(rewardClaims.giverId, userId)))
    .orderBy(rewardClaims.weekStart)
    .all();
