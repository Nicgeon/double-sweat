import { and, eq, gt, ne } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import type { DbLike } from '../../db/client.js';
import { type SessionRow, sessions, type User, users } from '../../db/schema.js';
import { hashToken, randomToken } from '../../security/tokens.js';
import { newId } from '../../util/ids.js';
import { DAY, MINUTE } from '../../util/time.js';

export const SESSION_IDLE_MS = 14 * DAY;
export const SESSION_ABSOLUTE_MS = 90 * DAY;
const TOUCH_INTERVAL_MS = 5 * MINUTE;

export interface CreatedSession {
  id: string;
  token: string;
  csrfToken: string;
  maxAgeSec: number;
}

/** Legt eine Web-Session an. Das Token steht nur im Cookie, in der DB liegt sein Hash. */
export function createSession(
  ctx: AppContext,
  userId: string,
  userAgent: string | undefined,
): CreatedSession {
  const now = ctx.clock.now();
  const token = randomToken(32);
  const id = newId(now);
  const csrfToken = randomToken(24);
  ctx.db
    .insert(sessions)
    .values({
      id,
      idHash: hashToken('session', token),
      userId,
      csrfToken,
      createdAt: now,
      lastSeenAt: now,
      idleExpiresAt: now + SESSION_IDLE_MS,
      absExpiresAt: now + SESSION_ABSOLUTE_MS,
      userAgent: userAgent?.slice(0, 200) ?? null,
    })
    .run();
  return { id, token, csrfToken, maxAgeSec: Math.floor(SESSION_ABSOLUTE_MS / 1000) };
}

/** Findet eine gültige Session (nicht idle- oder absolut abgelaufen) und verlängert die Idle-Frist gleitend. */
export function lookupSession(
  ctx: AppContext,
  token: string,
): { session: SessionRow; user: User } | null {
  const now = ctx.clock.now();
  const row = ctx.db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.idHash, hashToken('session', token)),
        gt(sessions.idleExpiresAt, now),
        gt(sessions.absExpiresAt, now),
      ),
    )
    .get();
  if (!row) return null;
  if (now - row.session.lastSeenAt > TOUCH_INTERVAL_MS) {
    ctx.db
      .update(sessions)
      .set({
        lastSeenAt: now,
        idleExpiresAt: Math.min(now + SESSION_IDLE_MS, row.session.absExpiresAt),
      })
      .where(eq(sessions.id, row.session.id))
      .run();
  }
  return row;
}

export function deleteSession(ctx: AppContext, sessionId: string, userId: string): boolean {
  return (
    ctx.db
      .delete(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .run().changes > 0
  );
}

/** Beendet alle Web-Sessions eines Nutzers, optional bis auf eine (z. B. die aktuelle). */
export function deleteAllSessions(db: DbLike, userId: string, exceptSessionId?: string): void {
  const where = exceptSessionId
    ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId))
    : eq(sessions.userId, userId);
  db.delete(sessions).where(where).run();
}
