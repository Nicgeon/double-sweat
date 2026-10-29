import { and, eq, inArray } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import type { DbLike } from '../../db/client.js';
import { checkins, reactions, type User, users } from '../../db/schema.js';
import { badRequest, forbidden, notFound } from '../../util/errors.js';
import { HOUR } from '../../util/time.js';
import { getMembership } from '../teams/service.js';

export const REACTION_KINDS = ['flame', 'applause', 'strong', 'heart'] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export interface ReactionDto {
  kind: ReactionKind;
  userId: string;
  displayName: string;
}

/** Was die Mitteilung an den Partner sagt, je Symbol. */
const PHRASE: Record<ReactionKind, string> = {
  flame: 'feuert dich an',
  applause: 'applaudiert dir',
  strong: 'findet dich stark',
  heart: 'ist stolz auf dich',
};

/** Reaktionen zu mehreren Check-ins auf einmal (für den Feed). */
export function reactionsFor(db: DbLike, checkinIds: string[]): Map<string, ReactionDto[]> {
  const byCheckin = new Map<string, ReactionDto[]>();
  if (checkinIds.length === 0) return byCheckin;
  const rows = db
    .select({
      checkinId: reactions.checkinId,
      kind: reactions.kind,
      userId: reactions.userId,
      displayName: users.displayName,
    })
    .from(reactions)
    .innerJoin(users, eq(users.id, reactions.userId))
    .where(inArray(reactions.checkinId, checkinIds))
    .orderBy(reactions.createdAt)
    .all();
  for (const row of rows) {
    const list = byCheckin.get(row.checkinId) ?? [];
    list.push({ kind: row.kind as ReactionKind, userId: row.userId, displayName: row.displayName });
    byCheckin.set(row.checkinId, list);
  }
  return byCheckin;
}

function findTeamCheckin(ctx: AppContext, user: User, checkinId: string) {
  const membership = getMembership(ctx.db, user.id);
  if (!membership) throw forbidden('no_team', 'Du bist in keinem Team');
  // Fremde Teams und unbekannte IDs sehen dasselbe: "nicht gefunden"
  const row = ctx.db
    .select()
    .from(checkins)
    .where(and(eq(checkins.id, checkinId), eq(checkins.teamId, membership.teamId)))
    .get();
  if (!row) throw notFound('Check-in nicht gefunden');
  if (row.userId === user.id) {
    throw badRequest('own_checkin', 'Auf eigene Check-ins kannst du nicht reagieren');
  }
  return row;
}

/** Setzt oder ändert die Reaktion auf den Check-in des Partners. Der Partner erfährt nur von der ersten. */
export function setReaction(
  ctx: AppContext,
  user: User,
  checkinId: string,
  kind: ReactionKind,
): ReactionDto[] {
  const limit = ctx.limiter.hit(`reaction:user:${user.id}`, 60, HOUR);
  if (limit.limited)
    throw badRequest('too_many', 'Das war etwas viel. Versuche es später noch einmal.');
  const row = findTeamCheckin(ctx, user, checkinId);
  const existing = ctx.db
    .select({ kind: reactions.kind })
    .from(reactions)
    .where(and(eq(reactions.checkinId, checkinId), eq(reactions.userId, user.id)))
    .get();
  ctx.db
    .insert(reactions)
    .values({ checkinId, userId: user.id, kind, createdAt: ctx.clock.now() })
    .onConflictDoUpdate({
      target: [reactions.checkinId, reactions.userId],
      set: { kind },
    })
    .run();

  // Eine Mitteilung pro Check-in und Person und Stunde: Wechseln oder Zurücknehmen und Neusetzen erzeugt keinen Spam
  if (!existing && !ctx.limiter.hit(`reaction-notify:${checkinId}:${user.id}`, 1, HOUR).limited) {
    ctx.push.notify(row.userId, {
      type: 'reaction',
      title: 'Double Sweat',
      body: `${user.displayName} ${PHRASE[kind]}.`,
      data: { checkinId },
    });
  }
  return reactionsFor(ctx.db, [checkinId]).get(checkinId) ?? [];
}

export function removeReaction(ctx: AppContext, user: User, checkinId: string): ReactionDto[] {
  findTeamCheckin(ctx, user, checkinId);
  ctx.db
    .delete(reactions)
    .where(and(eq(reactions.checkinId, checkinId), eq(reactions.userId, user.id)))
    .run();
  return reactionsFor(ctx.db, [checkinId]).get(checkinId) ?? [];
}
