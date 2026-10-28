import { eq } from 'drizzle-orm';
import type { AppContext } from '../../context.js';
import { checkins, type User, users } from '../../db/schema.js';
import { nextWeekStart, weekStartInstant } from '../../domain/weeks.js';
import { badRequest } from '../../util/errors.js';
import { isValidTimeZone } from '../../util/timezone.js';

/**
 * Gültige Zeitzone des Nutzers zum aktuellen Zeitpunkt. Eine vorgemerkte Änderung wird zum Wochenwechsel
 * wirksam und hier bei Bedarf übernommen. Ein Wechsel mitten in der Woche würde sonst Stunden gewinnen
 * oder verlieren lassen.
 */
export function currentTimezone(ctx: AppContext, user: User): string {
  if (!user.pendingTimezone || !user.pendingFromWeek) return user.timezone;
  if (ctx.clock.now() < weekStartInstant(user.pendingFromWeek, user.timezone)) return user.timezone;
  ctx.db
    .update(users)
    .set({ timezone: user.pendingTimezone, pendingTimezone: null, pendingFromWeek: null })
    .where(eq(users.id, user.id))
    .run();
  return user.pendingTimezone;
}

/** Übernimmt alle fälligen Zeitzonenwechsel (Housekeeping). */
export function promoteDueTimezones(ctx: AppContext): void {
  for (const user of ctx.db.select().from(users).all()) {
    if (user.pendingTimezone) currentTimezone(ctx, user);
  }
}

/**
 * Zeitzone ändern: Wer noch keinen Check-in hat, wechselt sofort (z. B. falsche Voreinstellung bei der
 * Registrierung). Danach gilt die neue Zeitzone ab dem nächsten Wochenstart.
 */
export function requestTimezoneChange(ctx: AppContext, user: User, zone: string): void {
  if (!isValidTimeZone(zone)) throw badRequest('invalid_timezone', 'Unbekannte Zeitzone');
  const active = currentTimezone(ctx, user);
  const fresh = ctx.db.select().from(users).where(eq(users.id, user.id)).get() ?? user;
  if (zone === active) {
    ctx.db
      .update(users)
      .set({ pendingTimezone: null, pendingFromWeek: null })
      .where(eq(users.id, user.id))
      .run();
    return;
  }
  const hasCheckins = !!ctx.db
    .select({ id: checkins.id })
    .from(checkins)
    .where(eq(checkins.userId, user.id))
    .get();
  if (!hasCheckins) {
    ctx.db
      .update(users)
      .set({ timezone: zone, pendingTimezone: null, pendingFromWeek: null })
      .where(eq(users.id, user.id))
      .run();
    return;
  }
  ctx.db
    .update(users)
    .set({ pendingTimezone: zone, pendingFromWeek: nextWeekStart(ctx.clock.now(), fresh.timezone) })
    .where(eq(users.id, user.id))
    .run();
}
