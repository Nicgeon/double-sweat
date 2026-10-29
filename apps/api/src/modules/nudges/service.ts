import { desc, eq } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import { memberships, nudges, type User, users } from '../../db/schema.js';
import { conflict, forbidden, tooManyRequests } from '../../util/errors.js';
import { newId } from '../../util/ids.js';
import { HOUR } from '../../util/time.js';
import { getMembership } from '../teams/service.js';

export const NUDGE_INTERVAL_MS = HOUR;

/**
 * Stupst den Partner an (Push + Postfach). Höchstens ein Nudge pro Stunde und Absender. Das Limit liegt in
 * der Datenbank und überlebt Neustarts; die Prüfung und das Eintragen passieren in einer Transaktion.
 */
export function sendNudge(ctx: AppContext, user: User): { nextAllowedAt: number } {
  const membership = getMembership(ctx.db, user.id);
  if (!membership) throw forbidden('no_team', 'Du bist in keinem Team');
  const partner = ctx.db
    .select({ id: users.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.teamId, membership.teamId))
    .all()
    .find((m) => m.id !== user.id);
  if (!partner) throw conflict('no_partner', 'Dein Team hat noch keinen Partner');

  const now = ctx.clock.now();
  ctx.db.transaction(
    (tx) => {
      const last = tx
        .select({ createdAt: nudges.createdAt })
        .from(nudges)
        .where(eq(nudges.fromUser, user.id))
        .orderBy(desc(nudges.createdAt))
        .limit(1)
        .get();
      if (last && now - last.createdAt < NUDGE_INTERVAL_MS) {
        throw tooManyRequests(
          (last.createdAt + NUDGE_INTERVAL_MS - now) / 1000,
          'Du hast deinen Partner gerade erst angestupst. Bitte warte etwas.',
        );
      }
      tx.insert(nudges)
        .values({ id: newId(now), fromUser: user.id, toUser: partner.id, createdAt: now })
        .run();
    },
    { behavior: 'immediate' },
  );

  ctx.push.notify(partner.id, {
    type: 'nudge',
    params: { name: user.displayName },
    data: { fromUserId: user.id },
  });
  return { nextAllowedAt: now + NUDGE_INTERVAL_MS };
}
