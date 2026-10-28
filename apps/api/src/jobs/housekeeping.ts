import { and, isNotNull, lte, or } from 'drizzle-orm';
import type { AppContext } from '../context.js';
import {
  appTokens,
  emailTokens,
  invites,
  notifications,
  nudges,
  reminderLog,
  sessions,
} from '../db/schema.js';
import { promoteDueTimezones } from '../modules/me/timezone.js';
import { DAY } from '../util/time.js';

/**
 * Räumt abgelaufene Daten auf. Rotierte Refresh-Tokens bleiben bis kurz nach ihrem Ablauf erhalten,
 * damit die Wiederverwendungserkennung greift.
 */
export function runHousekeeping(ctx: AppContext): void {
  const now = ctx.clock.now();
  ctx.db
    .delete(sessions)
    .where(or(lte(sessions.idleExpiresAt, now), lte(sessions.absExpiresAt, now)))
    .run();
  ctx.db
    .delete(appTokens)
    .where(lte(appTokens.refreshExpires, now - DAY))
    .run();
  ctx.db
    .delete(emailTokens)
    .where(lte(emailTokens.expiresAt, now - DAY))
    .run();
  ctx.db
    .delete(invites)
    .where(
      or(
        lte(invites.expiresAt, now - 30 * DAY),
        and(isNotNull(invites.usedAt), lte(invites.usedAt, now - 30 * DAY)),
      ),
    )
    .run();
  ctx.db
    .delete(notifications)
    .where(lte(notifications.createdAt, now - 60 * DAY))
    .run();
  ctx.db
    .delete(nudges)
    .where(lte(nudges.createdAt, now - DAY))
    .run();
  ctx.db
    .delete(reminderLog)
    .where(lte(reminderLog.sentAt, now - 8 * DAY))
    .run();
  ctx.limiter.purgeExpired();
  promoteDueTimezones(ctx);
}
