import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import { debts, memberships, type User, users, weekResults } from '../../db/schema.js';
import {
  computeStreak,
  computeTeamStreak,
  type Streak,
  type WeekOutcome,
} from '../../domain/streaks.js';
import { forbidden } from '../../util/errors.js';
import { getMembership } from '../teams/service.js';

export interface HistoryMember {
  userId: string;
  displayName: string;
  isMe: boolean;
  goalDays: number | null;
  doneDays: number;
  met: boolean | null;
  debt: { id: string; redeemed: boolean; role: 'debtor' | 'creditor' } | null;
}

export interface HistoryWeek {
  weekStart: string;
  /** Beide haben ihr Ziel erreicht. null, solange ein Partner noch nicht abgerechnet oder nicht gewertet ist. */
  teamMet: boolean | null;
  members: HistoryMember[];
}

export interface History {
  weeks: HistoryWeek[];
  streaks: { me: Streak; partner: Streak; team: Streak };
  /** Für die nächste Seite als `before` übergeben. Null, wenn es nichts Älteres gibt. */
  nextCursor: string | null;
}

export function getHistory(ctx: AppContext, viewer: User, limit: number, before?: string): History {
  const membership = getMembership(ctx.db, viewer.id);
  if (!membership) throw forbidden('no_team', 'Du bist in keinem Team');
  const teamId = membership.teamId;

  const people = ctx.db
    .select({ id: users.id, displayName: users.displayName })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.teamId, teamId))
    .orderBy(memberships.slot)
    .all();

  const all = ctx.db.select().from(weekResults).where(eq(weekResults.teamId, teamId)).all();
  const outcomes = (userId: string): WeekOutcome[] =>
    all.filter((r) => r.userId === userId).map((r) => ({ weekStart: r.weekStart, met: r.met }));
  const partnerId = people.find((p) => p.id !== viewer.id)?.id;
  const mine = outcomes(viewer.id);
  const theirs = partnerId ? outcomes(partnerId) : [];

  const weekStarts = ctx.db
    .selectDistinct({ weekStart: weekResults.weekStart })
    .from(weekResults)
    .where(
      before
        ? and(eq(weekResults.teamId, teamId), lt(weekResults.weekStart, before))
        : eq(weekResults.teamId, teamId),
    )
    .orderBy(desc(weekResults.weekStart))
    .limit(limit + 1)
    .all()
    .map((r) => r.weekStart);
  const page = weekStarts.slice(0, limit);

  const debtRows = page.length
    ? ctx.db
        .select()
        .from(debts)
        .where(and(eq(debts.teamId, teamId), inArray(debts.weekStart, page)))
        .all()
    : [];

  const weeks: HistoryWeek[] = page.map((weekStart) => {
    const members: HistoryMember[] = people.map((p) => {
      const result = all.find((r) => r.userId === p.id && r.weekStart === weekStart);
      const own = debtRows.find((d) => d.weekStart === weekStart && d.debtorId === p.id);
      const owed = debtRows.find((d) => d.weekStart === weekStart && d.creditorId === p.id);
      const shown = own ?? owed;
      return {
        userId: p.id,
        displayName: p.displayName,
        isMe: p.id === viewer.id,
        goalDays: result?.goalDays ?? null,
        doneDays: result?.doneDays ?? 0,
        met: result ? result.met : null,
        debt: shown
          ? { id: shown.id, redeemed: shown.redeemedAt !== null, role: own ? 'debtor' : 'creditor' }
          : null,
      };
    });
    const settled = people.every((p) =>
      all.some((r) => r.userId === p.id && r.weekStart === weekStart),
    );
    const mets = members.map((m) => m.met);
    const teamMet = !settled || mets.includes(null) ? null : mets.every((m) => m === true);
    return { weekStart, teamMet, members };
  });

  return {
    weeks,
    streaks: {
      me: computeStreak(mine),
      partner: computeStreak(theirs),
      team: computeTeamStreak(mine, theirs),
    },
    nextCursor: weekStarts.length > limit ? (page[page.length - 1] ?? null) : null,
  };
}
