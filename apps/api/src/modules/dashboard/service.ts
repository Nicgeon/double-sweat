import { and, eq, isNull } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import { checkins, debts, memberships, type User, users } from '../../db/schema.js';
import type { PartnerColor } from '../../domain/colors.js';
import {
  addWeeks,
  type LocalDate,
  localDateAt,
  positionInWeek,
  weekDays,
  weekEndInstant,
  weekStartOf,
} from '../../domain/weeks.js';
import { forbidden } from '../../util/errors.js';
import { betForWeek } from '../bets/service.js';
import { type CheckinDto, listTeamCheckins, MAX_CHECKINS_PER_DAY } from '../checkins/service.js';
import { goalForWeek } from '../goals/service.js';
import { currentTimezone } from '../me/timezone.js';
import { openClaimCounts, rewardForWeek } from '../rewards/service.js';
import { getMembership } from '../teams/service.js';

export type WeekStatus = 'no_goal' | 'done' | 'on_track' | 'at_risk' | 'unreachable';

export interface MemberProgress {
  userId: string;
  displayName: string;
  /** Platz im Team: bestimmt die Form (1 Kreis, 2 Quadrat). */
  slot: number;
  color: PartnerColor;
  isMe: boolean;
  timezone: string;
  weekStart: LocalDate;
  /** Ende der Woche dieses Mitglieds (exklusiv), in seiner Zeitzone. */
  weekEndsAt: number;
  goalDays: number | null;
  /** Ziel, das ab der kommenden Woche gilt (null = keins gesetzt). Zeigt, dass ein gerade gesetztes Ziel schon gilt. */
  nextGoalDays: number | null;
  /** Tage mit mindestens einem Check-in (mehrere Check-ins am Tag zählen einmal). */
  doneDays: number;
  checkedInToday: boolean;
  /** Check-ins heute (höchstens MAX_CHECKINS_PER_DAY). */
  checkinsToday: number;
  /** Tage, an denen noch eingecheckt werden kann (inklusive heute, falls noch nicht erledigt). */
  remainingDays: number;
  /** Fehlende Check-ins bis zum Ziel. */
  neededDays: number;
  status: WeekStatus;
  days: { date: LocalDate; checkedIn: boolean; isToday: boolean; isFuture: boolean }[];
}

export interface Dashboard {
  team: { id: string; full: boolean };
  /** Wie viele Check-ins pro Tag möglich sind. */
  maxCheckinsPerDay: number;
  /** Einsatz der laufenden Woche des Betrachters. */
  bet: string | null;
  /** Offene Schulden: wie viele ich schulde und wie viele mir geschuldet werden. */
  debts: { owe: number; owed: number };
  /** Belohnung, die mein Partner mir für das Wochenziel der laufenden Woche verspricht. */
  reward: string | null;
  /** Offene Belohnungen: wie viele ich verdient habe (earned) und wie viele ich noch schulde (toGive). */
  rewards: { earned: number; toGive: number };
  members: MemberProgress[];
  feed: CheckinDto[];
}

/** Bewertung des Wochenstands. Dieselbe Rechnung nutzt später die Abend-Erinnerung. */
export function weekStatus(
  goal: number | null,
  done: number,
  slots: number,
): { needed: number; status: WeekStatus } {
  if (goal === null) return { needed: 0, status: 'no_goal' };
  const needed = Math.max(0, goal - done);
  if (needed === 0) return { needed, status: 'done' };
  if (needed > slots) return { needed, status: 'unreachable' };
  if (needed === slots) return { needed, status: 'at_risk' };
  return { needed, status: 'on_track' };
}

/**
 * Wochenstand eines Mitglieds in dessen eigener Zeitzone. Auch die Abend-Erinnerung nutzt diese Rechnung,
 * damit Dashboard und Erinnerung nie auseinanderlaufen.
 */
export function buildMemberProgress(
  ctx: AppContext,
  user: User,
  slot: number,
  viewerId: string,
  now: number,
): MemberProgress {
  const zone = currentTimezone(ctx, user);
  const today = localDateAt(now, zone);
  const weekStart = weekStartOf(today);
  const rows = ctx.db
    .select({ localDate: checkins.localDate })
    .from(checkins)
    .where(and(eq(checkins.userId, user.id), eq(checkins.weekStart, weekStart)))
    .all();
  const done = new Set(rows.map((r) => r.localDate));
  const checkinsToday = rows.filter((r) => r.localDate === today).length;
  const checkedInToday = done.has(today);
  const { daysLeftInclToday } = positionInWeek(today);
  const remainingDays = checkedInToday ? daysLeftInclToday - 1 : daysLeftInclToday;
  const goalDays = goalForWeek(ctx.db, user.id, weekStart);
  const { needed, status } = weekStatus(goalDays, done.size, remainingDays);
  return {
    userId: user.id,
    displayName: user.displayName,
    slot,
    color: user.color,
    isMe: user.id === viewerId,
    timezone: zone,
    weekStart,
    weekEndsAt: weekEndInstant(weekStart, zone),
    goalDays,
    nextGoalDays: goalForWeek(ctx.db, user.id, addWeeks(weekStart, 1)),
    doneDays: done.size,
    checkedInToday,
    checkinsToday,
    remainingDays,
    neededDays: needed,
    status,
    days: weekDays(weekStart).map((date) => ({
      date,
      checkedIn: done.has(date),
      isToday: date === today,
      isFuture: date > today,
    })),
  };
}

export function getDashboard(ctx: AppContext, viewer: User): Dashboard {
  const membership = getMembership(ctx.db, viewer.id);
  if (!membership) throw forbidden('no_team', 'Du bist in keinem Team');
  const now = ctx.clock.now();

  const people = ctx.db
    .select({ user: users, slot: memberships.slot })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.teamId, membership.teamId))
    .orderBy(memberships.slot)
    .all();

  const members: MemberProgress[] = people.map(({ user, slot }) =>
    buildMemberProgress(ctx, user, slot, viewer.id, now),
  );

  const weeks = [...new Set(members.map((m) => m.weekStart))];
  const mine = members.find((m) => m.isMe) as MemberProgress;
  const partnerId = members.find((m) => !m.isMe)?.userId;
  const open = ctx.db
    .select({ debtorId: debts.debtorId, creditorId: debts.creditorId })
    .from(debts)
    .where(and(eq(debts.teamId, membership.teamId), isNull(debts.redeemedAt)))
    .all();
  return {
    team: { id: membership.teamId, full: people.length === 2 },
    maxCheckinsPerDay: MAX_CHECKINS_PER_DAY,
    bet: betForWeek(ctx.db, membership.teamId, mine.weekStart),
    debts: {
      owe: open.filter((d) => d.debtorId === viewer.id).length,
      owed: open.filter((d) => d.creditorId === viewer.id).length,
    },
    reward: partnerId ? rewardForWeek(ctx.db, partnerId, mine.weekStart) : null,
    rewards: openClaimCounts(ctx.db, membership.teamId, viewer.id),
    members,
    feed: listTeamCheckins(ctx.db, membership.teamId, weeks),
  };
}
